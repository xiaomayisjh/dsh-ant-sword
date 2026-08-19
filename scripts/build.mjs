import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
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

function uiSourceFiles(root = join(UI_ROOT, 'src')) {
  const files = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...uiSourceFiles(path))
    else if (['.css', '.ts', '.tsx'].includes(extname(entry.name))) files.push(path)
  }
  return files
}

function verifyUiSources() {
  for (const path of uiSourceFiles()) {
    const source = readFileSync(path, 'utf8')
    const name = relative(ROOT, path)
    if (source.startsWith('\uFEFF')) throw new Error(`UI source contains a UTF-8 BOM: ${name}`)
    if (/\uFFFD/u.test(source)) throw new Error(`UI source contains a replacement character: ${name}`)
    if (/[\uE000-\uF8FF]/u.test(source)) throw new Error(`UI source contains a private-use character: ${name}`)
    if (/\u9225\?/u.test(source)) throw new Error(`UI source contains known mojibake: ${name}`)
  }

  const entry = readFileSync(join(UI_ROOT, 'src', 'client', 'index.ts'), 'utf8')
  const locales = readFileSync(join(UI_ROOT, 'src', 'client', 'locales.ts'), 'utf8')
  if (!entry.includes('Red Team \u73af\u5883')) throw new Error('UI settings title is not valid Chinese')
  if (!locales.includes("'panel.cycle': 'cycle {cycle}'")
    || !locales.includes("'panel.cycle': '\u5faa\u73af {cycle}'")) {
    throw new Error('UI cycle locale must use the host {cycle} placeholder syntax')
  }
}

function inlineUiStyles() {
  const clientPath = join(UI_ROOT, 'lib', 'client.js')
  const cssPath = join(UI_ROOT, 'lib', 'client.css')
  const footer = 'return module.exports; } });'
  const tagId = '@deepseek-ai/dsh-client-ui-autograph/client.css'
  const client = readFileSync(clientPath, 'utf8')
  const css = readFileSync(cssPath, 'utf8')
    .replace(/\r?\n?\/\*# sourceMappingURL=client\.css\.map \*\/\s*$/u, '')
  if (!client.includes(footer)) throw new Error('UI client bundle footer is missing')
  const styleLoader = [
    `const __autographCss = ${JSON.stringify(css)};`,
    `const __autographCssId = ${JSON.stringify(tagId)};`,
    'if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css=${JSON.stringify(__autographCssId)}]`) === null) {',
    '  const tag = document.createElement("style");',
    '  tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-autograph";',
    '  tag.dataset.pluginCss = __autographCssId;',
    '  tag.textContent = __autographCss;',
    '  document.head.appendChild(tag);',
    '}',
  ].join('\n')
  writeFileSync(clientPath, client.replace(footer, `${styleLoader}\n${footer}`))
}

function buildBundles() {
  verifyUiSources()
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
    '--target=es2022',
    '--sourcemap',
    // Keep host-provided React modules external; bundle third-party deps (e.g. @xyflow/react)
    // so the client uses the host's React/ReactDOM pair instead of mixing the
    // development React 19 dependency from this workspace with the host's React 18.
    '--external:react',
    '--external:react-dom',
    '--external:@deepseek-ai/*',
    '--banner:js=window.__ModuleLoader__.load({ id: "@deepseek-ai/dsh-client-ui-autograph", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
    '--footer:js=return module.exports; } });',
    '--outfile=vendor/ui-autograph/lib/client.js',
  ])
  inlineUiStyles()
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
  verifyUiSources()
  ensureOutputs([...outputs.root, ...outputs.ui])
  const client = readFileSync(join(UI_ROOT, 'lib', 'client.js'), 'utf8')
  if (!client.includes('sourceMappingURL=client.js.map')) throw new Error('UI client bundle is missing its source map reference')
  if (!client.includes('__ModuleLoader__.load')) throw new Error('UI client bundle is missing the DSH module loader registration')
  if (!client.includes('__export(index_exports')) throw new Error('UI client bundle is missing esbuild CJS export table')
  if (!client.includes('apply: () => apply')) throw new Error('UI client bundle does not export apply')
  if (!client.includes('require("react-dom")')) throw new Error('UI client bundle does not use the host ReactDOM module')
  if (client.includes('react-dom/cjs/')) throw new Error('UI client bundle contains a private ReactDOM renderer')
  if (!client.includes('data-plugin-css=')) throw new Error('UI client bundle does not install its stylesheet')
  if (!client.includes('.react-flow__container')) throw new Error('UI client bundle is missing React Flow styles')
  if (client.includes('sourceMappingURL=client.css.map')) throw new Error('UI client bundle contains a stale CSS source map reference')
  if (/\uFFFD|[\uE000-\uF8FF]|\u9225\?/u.test(client)
    || /\\u(?:e[0-9a-f]{3}|f[0-8][0-9a-f]{2})/iu.test(client)) {
    throw new Error('UI client bundle contains corrupted Unicode')
  }
  const css = readFileSync(join(UI_ROOT, 'lib', 'client.css'), 'utf8')
  if (css.trim() === '') throw new Error('UI client stylesheet is empty')
  if (!css.includes('--xy-background-pattern-dots-color-default')) throw new Error('UI client stylesheet is missing the React Flow dots theme variable')
  if (css.includes('--xy-background-pattern-dot-color-default')) throw new Error('UI client stylesheet contains the obsolete React Flow dot theme variable')
  if (css.includes('colorprimary-new-color')) throw new Error('UI client stylesheet contains an invalid theme token')
  const localeTypes = readFileSync(join(UI_ROOT, 'lib', 'types', 'client', 'locales.d.ts'), 'utf8')
  if (!localeTypes.includes('"cycle {cycle}"') || localeTypes.includes('{{cycle}}')) {
    throw new Error('UI locale declaration is stale')
  }
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
