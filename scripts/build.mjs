import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const UI_ROOT = join(ROOT, 'vendor', 'ui-autograph')

const outputs = {
  root: [
    join(ROOT, 'lib', 'index.js'),
    join(ROOT, 'lib', 'invariant.js'),
    join(ROOT, 'lib', 'rewind-plugin.js'),
    join(ROOT, 'lib', 'types', 'index.d.ts'),
    join(ROOT, 'lib', 'types', 'rewind-plugin.d.ts'),
    join(ROOT, 'lib', 'types', 'invariant.d.ts'),
  ],
  ui: [
    join(UI_ROOT, 'lib', 'index.js'),
    join(UI_ROOT, 'lib', 'invariant.js'),
    join(UI_ROOT, 'lib', 'client.js'),
    join(UI_ROOT, 'lib', 'client.js.map'),
    join(UI_ROOT, 'lib', 'client.css'),
    join(UI_ROOT, 'lib', 'client.css.map'),
    join(UI_ROOT, 'lib', 'types', 'index.d.ts'),
    join(UI_ROOT, 'lib', 'types', 'client', 'index.d.ts'),
  ],
}

function quoteWindows(value) {
  return `"${value.replaceAll('"', '""')}"`
}

function invocation(command, args) {
  if (process.platform !== 'win32' || !command.endsWith('.cmd')) return { command, args }
  const commandLine = `""${command}" ${args.map(quoteWindows).join(' ')}"`
  return { command: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', commandLine] }
}

function run(command, args, options = {}) {
  const directScript = command.endsWith('esbuild.cmd')
    ? join(ROOT, 'node_modules', 'esbuild', 'bin', 'esbuild')
    : command.endsWith('tsc.cmd')
      ? join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
      : undefined
  const call = directScript === undefined ? invocation(command, args) : { command: process.execPath, args: [directScript, ...args] }
  const result = spawnSync(call.command, call.args, {
    cwd: ROOT,
    stdio: 'inherit',
    ...options,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${String(result.status)}`)
}

function executable(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name
}

function commandPath(name) {
  return join(ROOT, 'node_modules', '.bin', executable(name))
}

function requireCommand(name) {
  const path = commandPath(name)
  if (!existsSync(path)) {
    throw new Error(`missing local build tool ${name}; install the repository dependencies before building`)
  }
  return path
}

const rootBundles = outputs.root.slice(0, 3)
const uiBundles = outputs.ui.slice(0, 6)

function ensureOutputs(paths) {
  const invalid = paths.filter(path => !existsSync(path) || !statSync(path).isFile() || statSync(path).size === 0)
  if (invalid.length > 0) {
    throw new Error(`build output is incomplete: ${invalid.map(path => relative(ROOT, path)).join(', ')}`)
  }
}

function cleanBundles() {
  for (const path of [...rootBundles, ...uiBundles]) rmSync(path, { force: true })
}

function buildBundles() {
  const esbuild = requireCommand('esbuild')
  mkdirSync(join(ROOT, 'lib'), { recursive: true })
  mkdirSync(join(UI_ROOT, 'lib'), { recursive: true })
  run(esbuild, ['src/index.ts', '--bundle', '--platform=node', '--format=esm', '--packages=external', '--target=node24', '--outfile=lib/index.js'])
  run(esbuild, ['src/invariant.ts', '--bundle', '--platform=node', '--format=esm', '--packages=external', '--target=node24', '--outfile=lib/invariant.js'])
  run(esbuild, ['src/rewind-plugin.ts', '--bundle', '--platform=node', '--format=esm', '--packages=external', '--target=node24', '--outfile=lib/rewind-plugin.js'])
  run(esbuild, ['vendor/ui-autograph/src/index.ts', '--bundle', '--platform=node', '--format=esm', '--packages=external', '--target=node24', '--outfile=vendor/ui-autograph/lib/index.js'])
  run(esbuild, ['vendor/ui-autograph/src/invariant.ts', '--bundle', '--platform=node', '--format=esm', '--packages=external', '--target=node24', '--outfile=vendor/ui-autograph/lib/invariant.js'])
  run(esbuild, [
    'vendor/ui-autograph/src/client/index.ts',
    '--bundle',
    '--platform=browser',
    '--format=cjs',
    '--packages=external',
    '--target=es2022',
    '--sourcemap',
    '--banner:js=window.__ModuleLoader__.load({ id: "@deepseek-ai/dsh-client-ui-autograph", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
    '--footer:js=return module.exports; } });',
    '--outfile=vendor/ui-autograph/lib/client.js',
  ])
}

function emitTypes() {
  const tsc = requireCommand('tsc')
  rmSync(join(ROOT, 'lib', 'types'), { recursive: true, force: true })
  run(tsc, ['--project', 'tsconfig.build.json'])
  // UI client declarations are supplied by the host-facing declaration tree.
  // The browser bundle is type-checked by esbuild and does not require the
  // host application's private React peer graph during package assembly.
}

function typecheck() {
  const tsc = requireCommand('tsc')
  run(tsc, ['--project', 'tsconfig.typecheck.json', '--noEmit'])
  run(tsc, ['--project', 'vendor/ui-autograph/tsconfig.typecheck.json', '--noEmit'])
}

function verify() {
  ensureOutputs([...outputs.root, ...outputs.ui])
  const client = readFileSync(join(UI_ROOT, 'lib', 'client.js'), 'utf8')
  if (!client.includes('sourceMappingURL=client.js.map')) throw new Error('UI client bundle is missing its source map reference')
  if (!client.includes('__ModuleLoader__.load')) throw new Error('UI client bundle is missing the DSH module loader registration')
  if (!client.includes('__export(index_exports')) throw new Error('UI client bundle is missing esbuild CJS export table')
  if (!client.includes('apply: () => apply')) throw new Error('UI client bundle does not export apply')
  const css = readFileSync(join(UI_ROOT, 'lib', 'client.css'), 'utf8')
  if (css.trim() === '') throw new Error('UI client stylesheet is empty')
}

const action = process.argv[2] ?? 'build'
if (action === 'clean') cleanBundles()
else if (action === 'bundle') {
  cleanBundles()
  buildBundles()
  ensureOutputs([...rootBundles, ...uiBundles])
} else if (action === 'types') emitTypes()
else if (action === 'typecheck') typecheck()
else if (action === 'verify') verify()
else if (action === 'build') {
  cleanBundles()
  buildBundles()
  emitTypes()
  verify()
} else {
  throw new Error(`unknown build action: ${action}`)
}