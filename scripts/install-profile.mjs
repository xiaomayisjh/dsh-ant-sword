#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { createServer } from 'node:net'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { resolveLocalRelease } from './release-artifacts.mjs'

const STANDALONE_UI_PACKAGE = '@deepseek-ai/dsh-client-ui-autograph'
const HARNESS_PACKAGE = '@deepseek-ai/dsh-ant-sword-harness'

function run(command, args, cwd = process.cwd(), env = process.env, stdio = 'inherit') {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio,
    shell: process.platform === 'win32' && !/\.exe$/i.test(command),
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${String(result.status)}`)
}

function dshHome() {
  const configured = process.env.DSH_HOME
  return configured === undefined || configured === '' ? join(homedir(), '.dsh') : configured
}

function installSpec(spec) {
  if (isAbsolute(spec)) return spec
  if (/^(?:\.{1,2})(?:[/\\]|$)/.test(spec)) return resolve(process.cwd(), spec)
  return spec
}

/**
 * Detect whether a TCP port is already bound (e.g. a stale dsh web instance).
 * Returns true when something is listening; resolves false when free.
 */
async function isPortInUse(host, port) {
  return await new Promise(resolvePromise => {
    const probe = createServer()
    probe.once('error', () => resolvePromise(true))
    probe.once('listening', () => probe.close(() => resolvePromise(false)))
    probe.listen(port, host)
  })
}

/**
 * Pre-install guard: when the target profile boots a webserver on the default
 * port, surface a stale-listener conflict before the profile installation
 * overwrites files that a running dsh instance may still hold open.
 */
async function assertWebPortFree(profileName, cleanup) {
  if (profileName !== 'web') return
  const host = '127.0.0.1'
  const port = Number(process.env.DSH_WEB_PORT ?? 3080)
  if (!(await isPortInUse(host, port))) return

  const suffix = [
    '',
    `ant-sword: port ${host}:${port} is already in use.`,
    '         Another dsh web instance (or a stale one) is holding the port.',
    '         Options:',
    `           1. Stop the running instance, then run the installer again.`,
    `           2. Install anyway and start dsh with: dsh web --port <other-port>`,
    cleanup
      ? '         (cleanup=true was set, but automatic killing is disabled for safety;'
      : '         The installer never kills processes automatically.',
  ]
  if (cleanup) suffix.push('         identify the owner with your OS tools and stop it manually.)')
  console.error(suffix.join('\n'))
}

function addBundleLayer(profileDir, packageName) {
  const manifestPath = join(profileDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const bundles = manifest.dsh?.profile?.bundles
  if (!Array.isArray(bundles)) throw new Error(`profile manifest has no dsh.profile.bundles array: ${manifestPath}`)
  if (!bundles.includes(packageName)) bundles.push(packageName)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)
}

function stripBundleLayers(profileDir, packageNames) {
  const manifestPath = join(profileDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const bundles = manifest.dsh?.profile?.bundles
  if (!Array.isArray(bundles)) return
  manifest.dsh.profile.bundles = bundles.filter(name => !packageNames.includes(name))
  writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)

  const persisted = JSON.parse(readFileSync(manifestPath, 'utf8')).dsh?.profile?.bundles
  const duplicates = Array.isArray(persisted) ? persisted.filter(name => packageNames.includes(name)) : []
  if (duplicates.length > 0) throw new Error(`failed to remove duplicate bundle layers: ${duplicates.join(', ')}`)
}

/**
 * Remove the pre-rc24 standalone Autograph package from an existing profile.
 * The root harness now owns the `./client` bundle, so leaving this direct
 * dependency behind makes the market mount two UI registrations and can make
 * an older board win during boot.  pnpm rewrites the lockfile on the next add
 * or install after the importer entry is removed here.
 */
function removeStandaloneUiDependency(profileDir) {
  const manifestPath = join(profileDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  let changed = false
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    if (manifest[field] !== null && typeof manifest[field] === 'object'
      && Object.prototype.hasOwnProperty.call(manifest[field], STANDALONE_UI_PACKAGE)) {
      delete manifest[field][STANDALONE_UI_PACKAGE]
      changed = true
    }
  }
  if (changed) writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)
}

/** Keep pnpm on the store already backing this profile's node_modules. */
function profileStoreArgs(profileDir) {
  const modulesPath = join(profileDir, 'node_modules', '.modules.yaml')
  if (!existsSync(modulesPath)) return []
  const source = readFileSync(modulesPath, 'utf8')
  let storeDir
  if (source.trimStart().startsWith('{')) {
    storeDir = JSON.parse(source).storeDir
  } else {
    const value = source.match(/^storeDir:\s*(.+)$/m)?.[1]?.trim()
    storeDir = value?.replace(/^['"]|['"]$/g, '')
  }
  return typeof storeDir === 'string' && isAbsolute(storeDir) ? ['--store-dir', storeDir] : []
}

/** Replace stale local-tarball paths before pnpm reads the old lockfile. */
function stageReleaseDependencies(profileDir, bundle, dshmarket) {
  const manifestPath = join(profileDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.dependencies === null || typeof manifest.dependencies !== 'object') manifest.dependencies = {}
  manifest.dependencies[HARNESS_PACKAGE] = `file:${resolve(bundle).replaceAll('\\', '/')}`
  manifest.dependencies.dshmarket = `file:${resolve(dshmarket).replaceAll('\\', '/')}`
  writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)
}

/**
 * A profile can already contain a tarball with the same package version.  In
 * that case `pnpm add` updates the manifest but may keep the package-store
 * entry that came from an older checkout.  Force one lockfile installation so
 * the embedded client and its inline stylesheet always come from the artifact
 * just selected by this invocation.
 */
function refreshProfileDependencies(profileDir, offline, storeArgs, env) {
  run('pnpm', ['install', ...offline, ...storeArgs, '--force'], profileDir, env)
}

function alignRuntimePackages(profileName) {
  if (process.platform !== 'win32') return
  const script = fileURLToPath(new URL('./align-dsh-scope.ps1', import.meta.url))
  if (!existsSync(script)) throw new Error(`runtime alignment script is missing: ${script}`)
  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-ProfileName', profileName, '-DshHome', dshHome()])
}

const { values } = parseArgs({
  options: {
    profile: { type: 'string', default: 'web' },
    bundle: { type: 'string' },
    dshmarket: { type: 'string' },
    // Accepted for callers built against the old three-artifact installer.
    // It is intentionally ignored; the root bundle now embeds the client.
    ui: { type: 'string' },
    release: { type: 'string' },
  },
  allowPositionals: false,
})

if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(values.profile) || values.profile === '.' || values.profile === '..') {
  throw new Error('profile must be a single profile directory name')
}

const hasExplicitTarballs = values.bundle !== undefined || values.dshmarket !== undefined || values.ui !== undefined
if (values.release !== undefined && hasExplicitTarballs) {
  throw new Error('--release cannot be combined with --bundle, --dshmarket, or --ui')
}
if (values.release === undefined && values.bundle === undefined) {
  throw new Error('usage: dsh-ant-sword-install (--release <release-directory-or-manifest> | --bundle <bundle-tarball-or-path> [--dshmarket <dshmarket-tarball-or-path>]) [--profile web]')
}

await assertWebPortFree(values.profile, false)

const artifacts = values.release === undefined
  ? { bundle: values.bundle, dshmarket: values.dshmarket ?? 'dshmarket@1.66.5' }
  : resolveLocalRelease(values.release)
const offline = values.release === undefined ? [] : ['--offline']
const installEnvironment = values.release === undefined
  ? process.env
  : { ...process.env, npm_config_offline: 'true', PNPM_CONFIG_OFFLINE: 'true' }

const profileDir = join(dshHome(), 'profiles', values.profile)
if (values.release === undefined) {
  run('dsh', ['plugin', '--profile', values.profile, 'add', artifacts.bundle])
  if (!existsSync(join(profileDir, 'package.json'))) throw new Error(`profile was not created at ${profileDir}`)
  removeStandaloneUiDependency(profileDir)
  const storeArgs = profileStoreArgs(profileDir)
  run('pnpm', ['add', ...storeArgs, installSpec(artifacts.dshmarket)], profileDir)
  refreshProfileDependencies(profileDir, offline, storeArgs, installEnvironment)
} else {
  run('dsh', ['--profile', values.profile, '--dump-config'], process.cwd(), installEnvironment, ['ignore', 'ignore', 'inherit'])
  if (!existsSync(join(profileDir, 'package.json'))) throw new Error(`profile was not created at ${profileDir}`)
  removeStandaloneUiDependency(profileDir)
  const storeArgs = profileStoreArgs(profileDir)
  stageReleaseDependencies(profileDir, artifacts.bundle, artifacts.dshmarket)
  run('pnpm', ['add', ...offline, ...storeArgs, installSpec(artifacts.bundle), installSpec(artifacts.dshmarket)], profileDir, installEnvironment)
  refreshProfileDependencies(profileDir, offline, storeArgs, installEnvironment)
  addBundleLayer(profileDir, HARNESS_PACKAGE)
}
stripBundleLayers(profileDir, ['@nanmicoder/dsh-agent-teams', 'dshmarket', STANDALONE_UI_PACKAGE])
alignRuntimePackages(values.profile)
console.log(`ant-sword: installed complete bundle into profile ${values.profile}`)
console.log(`ant-sword: start with dsh ${values.profile === 'web' ? 'web' : `--profile ${values.profile}`}`)
