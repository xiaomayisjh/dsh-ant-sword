import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { smokeTarball } from './install-smoke.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const UI_ROOT = join(ROOT, 'vendor', 'ui-autograph')

function quoteWindows(value) {
  return `"${value.replaceAll('"', '""')}"`
}

function invocation(command, args) {
  if (process.platform !== 'win32' || !command.endsWith('.cmd')) return { command, args }
  const commandLine = [command, ...args].map(quoteWindows).join(' ')
  return { command: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', commandLine] }
}

function capture(command, args, options = {}) {
  const call = invocation(command, args)
  const result = spawnSync(call.command, call.args, {
    cwd: ROOT,
    encoding: 'utf8',
    ...options,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${String(result.status)}: ${result.stderr}`)
  return result.stdout.trim()
}

function run(command, args, options = {}) {
  const call = invocation(command, args)
  const result = spawnSync(call.command, call.args, {
    cwd: ROOT,
    stdio: 'inherit',
    ...options,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${String(result.status)}`)
}

function hash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function pack(packageDir, destination) {
  const corepackPnpm = join(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'pnpm.js')
  const output = capture(process.execPath, [corepackPnpm, 'pack', '--pack-destination', destination], { cwd: packageDir })
  const filename = output.split(/\r?\n/u).map(line => line.trim()).findLast(line => line.endsWith('.tgz'))
  if (filename === undefined) throw new Error(`pnpm pack produced no tarball:\n${output}`)
  return join(destination, basename(filename))
}

function inspect(tarball, destination) {
  const packageRoot = join(destination, 'package')
  rmSync(packageRoot, { recursive: true, force: true })
  run('tar', ['-xzf', tarball, '-C', destination])
  return packageRoot
}

function assertPacked(packageRoot, workspaceRoot, expectedVersion, paths) {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  if (manifest.version !== expectedVersion) {
    throw new Error(`packed ${manifest.name} version ${manifest.version} does not match ${expectedVersion}`)
  }
  for (const path of paths) {
    const packed = join(packageRoot, path)
    const workspace = join(workspaceRoot, path)
    const packedHash = hash(packed)
    const workspaceHash = hash(workspace)
    if (packedHash !== workspaceHash) {
      throw new Error(`packed ${manifest.name}/${path} is stale: expected ${workspaceHash}, got ${packedHash}`)
    }
  }
}

const rootManifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const uiManifest = JSON.parse(readFileSync(join(UI_ROOT, 'package.json'), 'utf8'))
const temporary = mkdtempSync(join(tmpdir(), 'ant-sword-pack-check-'))

try {
  const rootTarball = pack(ROOT, temporary)
  const rootPackage = inspect(rootTarball, temporary)
  assertPacked(rootPackage, ROOT, rootManifest.version, [
    'lib/index.js',
    'lib/invariant.js',
    'lib/rewind-plugin.js',
    'lib/types/index.d.ts',
    'vendor/ui-autograph/lib/client.js',
    'vendor/ui-autograph/lib/client.js.map',
    'vendor/ui-autograph/lib/client.css',
    'vendor/ui-autograph/lib/client.css.map',
    'vendor/ui-autograph/lib/types/client/index.d.ts',
  ])
  await smokeTarball(rootTarball)
  rmSync(rootPackage, { recursive: true, force: true })

  const uiTarball = pack(UI_ROOT, temporary)
  const uiPackage = inspect(uiTarball, temporary)
  assertPacked(uiPackage, UI_ROOT, uiManifest.version, [
    'lib/index.js',
    'lib/invariant.js',
    'lib/client.js',
    'lib/client.js.map',
    'lib/client.css',
    'lib/client.css.map',
    'lib/types/index.d.ts',
    'lib/types/client/index.d.ts',
  ])
  console.log(`pack-check: verified ${rootManifest.name}@${rootManifest.version} and ${uiManifest.name}@${uiManifest.version}`)
} finally {
  rmSync(temporary, { recursive: true, force: true })
}