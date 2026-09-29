import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { resolveLocalRelease, writeReleaseManifest } from './release-artifacts.mjs'
import { makeOfflineTarball } from './release-github.mjs'

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, {
    cwd, env, encoding: 'utf8',
    shell: process.platform === 'win32' && command !== 'tar',
  })
  if (result.error !== undefined) throw result.error
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`)
}

function packageTarball(directory, name, manifest, source, extraFiles = {}) {
  const parent = join(directory, `source-${name}`)
  const packageDir = join(parent, 'package')
  mkdirSync(packageDir, { recursive: true })
  writeFileSync(join(packageDir, 'package.json'), `${JSON.stringify(manifest)}\n`)
  writeFileSync(join(packageDir, 'index.js'), source)
  for (const [filename, bytes] of Object.entries(extraFiles)) writeFileSync(join(packageDir, filename), bytes)
  const tarball = join(directory, `${name}-fixture.tgz`)
  // Use paths relative to cwd so GNU tar does not parse Windows drive letters
  // as remote archive names; this also works with Windows/macOS bsdtar.
  run('tar', ['-czf', basename(tarball), '-C', basename(parent), 'package'], directory)
  return tarball
}

function readTarFile(tarball, name) {
  const result = spawnSync('tar', ['-xOf', basename(tarball), name], {
    cwd: dirname(tarball), encoding: null, shell: false,
  })
  if (result.error !== undefined) throw result.error
  assert.equal(result.status, 0, `tar could not read ${name}: ${result.stderr?.toString('utf8')}`)
  return result.stdout
}

test('three release tarballs install from an empty offline pnpm store with dshmarket runtime imports', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ant-sword-offline-release-'))
  try {
    const dependencies = join(directory, 'dependencies')
    const release = join(directory, 'release')
    mkdirSync(dependencies)
    mkdirSync(release)
    const argparse = packageTarball(dependencies, 'argparse', {
      name: 'argparse', version: '2.0.1', type: 'module', main: 'index.js',
    }, `export const argparseValue = 'argparse'\n`)
    const yaml = packageTarball(dependencies, 'js-yaml', {
      name: 'js-yaml', version: '4.3.1', type: 'module', main: 'index.js',
      dependencies: { argparse: pathToFileURL(argparse).href },
    }, `import { argparseValue } from 'argparse'; export const yamlValue = argparseValue + ':yaml'\n`)
    const undici = packageTarball(dependencies, 'undici', {
      name: 'undici', version: '7.30.0', type: 'module', main: 'index.js',
    }, `export const undiciValue = 'undici'\n`)
    const market = packageTarball(release, 'dshmarket', {
      name: 'dshmarket', version: '1.66.5', type: 'module', main: 'index.js',
      dependencies: { 'js-yaml': pathToFileURL(yaml).href, undici: pathToFileURL(undici).href },
      peerDependencies: { '@deepseek-ai/dsh-settings': '^0.2.0-rc.1' },
    }, `import { yamlValue } from 'js-yaml'; import { undiciValue } from 'undici'; export const result = yamlValue + ':' + undiciValue\n`)
    const bundle = packageTarball(release, 'bundle', {
      name: '@deepseek-ai/dsh-ant-sword-harness', version: '1.0.0', type: 'module', main: 'index.js',
      dependencies: { 'registry-only-package': '1.0.0' },
      peerDependencies: { '@deepseek-ai/dsh-agent': '^0.2.0-rc.1' },
    }, `export const bundleValue = 'bundle'\n`, {
      'opaque.bin': Buffer.from(Array.from({ length: 2049 }, (_, index) => index % 256)),
    })
    const ui = packageTarball(release, 'ui', {
      name: '@deepseek-ai/dsh-client-ui-autograph', version: '1.0.0', type: 'module', main: 'index.js',
      peerDependencies: { '@deepseek-ai/dsh-client-ui-session': '^0.2.0-rc.1' },
    }, `export const uiValue = 'ui'\n`)

    const bundleIndex = readTarFile(bundle, 'package/index.js')
    const bundleBinary = readTarFile(bundle, 'package/opaque.bin')
    const uiIndex = readTarFile(ui, 'package/index.js')
    makeOfflineTarball(bundle, release, { clearDependencies: true })
    makeOfflineTarball(ui, release)
    makeOfflineTarball(market, release, { vendorDependencies: true })
    assert.deepEqual(readTarFile(bundle, 'package/index.js'), bundleIndex)
    assert.deepEqual(readTarFile(bundle, 'package/opaque.bin'), bundleBinary)
    assert.deepEqual(readTarFile(ui, 'package/index.js'), uiIndex)
    const rewrittenBundle = JSON.parse(readTarFile(bundle, 'package/package.json').toString('utf8'))
    assert.deepEqual(rewrittenBundle.dependencies, {})
    assert.deepEqual(rewrittenBundle.peerDependencies, {})
    const rewrittenUi = JSON.parse(readTarFile(ui, 'package/package.json').toString('utf8'))
    assert.deepEqual(rewrittenUi.peerDependencies, {})
    writeReleaseManifest(release, [
      { path: bundle, packageName: '@deepseek-ai/dsh-ant-sword-harness', version: '1.0.0' },
      { path: ui, packageName: '@deepseek-ai/dsh-client-ui-autograph', version: '1.0.0' },
      { path: market, packageName: 'dshmarket', version: '1.66.5' },
    ])
    const artifacts = resolveLocalRelease(release)
    const project = join(directory, 'install')
    mkdirSync(project)
    writeFileSync(join(project, 'package.json'), '{"name":"offline-install-test","version":"1.0.0","private":true}\n')
    run('pnpm', ['--dir', project, 'add', '--offline', '--store-dir', join(directory, 'empty-store'), artifacts.bundle, artifacts.ui, artifacts.dshmarket], project, {
      ...process.env, npm_config_offline: 'true', PNPM_CONFIG_OFFLINE: 'true',
    })

    const installed = join(project, 'node_modules', 'dshmarket')
    const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'))
    assert.deepEqual(manifest.dependencies, {})
    assert.deepEqual(manifest.peerDependencies, {})
    assert.deepEqual(manifest.bundleDependencies, ['argparse', 'js-yaml', 'undici'])
    const module = await import(pathToFileURL(join(installed, 'index.js')).href)
    assert.equal(module.result, 'argparse:yaml:undici')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
