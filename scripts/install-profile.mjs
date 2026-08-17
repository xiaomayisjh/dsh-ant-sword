#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { parseArgs } from 'node:util'
import { resolveLocalRelease } from './release-artifacts.mjs'

function run(command, args, cwd = process.cwd(), env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
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

const { values } = parseArgs({
  options: {
    profile: { type: 'string', default: 'web' },
    bundle: { type: 'string' },
    ui: { type: 'string' },
    release: { type: 'string' },
  },
  allowPositionals: false,
})

const hasExplicitTarballs = values.bundle !== undefined || values.ui !== undefined
if (values.release !== undefined && hasExplicitTarballs) {
  throw new Error('--release cannot be combined with --bundle or --ui')
}
if (values.release === undefined && (values.bundle === undefined || values.ui === undefined)) {
  throw new Error('usage: dsh-ant-sword-install (--release <release-directory-or-manifest> | --bundle <bundle-tarball-or-path> --ui <ui-tarball-or-path>) [--profile web]')
}

const artifacts = values.release === undefined
  ? { bundle: values.bundle, ui: values.ui }
  : resolveLocalRelease(values.release)
const offline = values.release === undefined ? [] : ['--offline']
const installEnvironment = values.release === undefined
  ? process.env
  : { ...process.env, npm_config_offline: 'true', PNPM_CONFIG_OFFLINE: 'true' }

const profileDir = join(dshHome(), 'profiles', values.profile)
if (values.release === undefined) {
  run('dsh', ['plugin', '--profile', values.profile, 'add', artifacts.bundle])
  if (!existsSync(join(profileDir, 'package.json'))) throw new Error(`profile was not created at ${profileDir}`)
  run('pnpm', ['add', '@nanmicoder/dsh-agent-teams@^0.1.4', 'dshmarket@^1.4.1', installSpec(artifacts.ui)], profileDir)
} else {
  run('dsh', ['--profile', values.profile, '--dump-config'], process.cwd(), installEnvironment)
  if (!existsSync(join(profileDir, 'package.json'))) throw new Error(`profile was not created at ${profileDir}`)
  run('pnpm', ['add', ...offline, installSpec(artifacts.bundle), installSpec(artifacts.ui), installSpec(artifacts.agentTeams), installSpec(artifacts.dshmarket)], profileDir, installEnvironment)
  addBundleLayer(profileDir, '@deepseek-ai/dsh-ant-sword-harness')
}
stripBundleLayers(profileDir, ['@nanmicoder/dsh-agent-teams', 'dshmarket'])
console.log(`ant-sword: installed complete bundle into profile ${values.profile}`)
console.log(`ant-sword: start with dsh ${values.profile === 'web' ? 'web' : `--profile ${values.profile}`}`)