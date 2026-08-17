import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { RELEASE_MANIFEST, RELEASE_PACKAGES, resolveLocalRelease, writeReleaseManifest } from './release-artifacts.mjs'

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ant-sword-artifacts-'))
  const artifacts = RELEASE_PACKAGES.map(({ packageName }, index) => {
    const path = join(directory, `artifact-${index}.tgz`)
    writeFileSync(path, `artifact-${index}`)
    return { path, packageName, version: `1.0.${index}` }
  })
  const manifestPath = writeReleaseManifest(directory, artifacts)
  return { directory, manifestPath }
}

test('resolves a release directory and manifest to all local tarballs', () => {
  const release = fixture()
  try {
    const fromDirectory = resolveLocalRelease(release.directory)
    const fromManifest = resolveLocalRelease(release.manifestPath)
    assert.equal(fromDirectory.bundle, fromManifest.bundle)
    assert.equal(fromDirectory.ui, fromManifest.ui)
    assert.equal(fromDirectory.agentTeams, fromManifest.agentTeams)
    assert.equal(fromDirectory.dshmarket, fromManifest.dshmarket)
  } finally {
    rmSync(release.directory, { recursive: true, force: true })
  }
})

test('rejects a modified artifact', () => {
  const release = fixture()
  try {
    const manifest = JSON.parse(String(requireRead(release.manifestPath)))
    writeFileSync(join(release.directory, manifest.artifacts[0].filename), 'tampered')
    assert.throws(() => resolveLocalRelease(release.directory), /sha256 mismatch/)
  } finally {
    rmSync(release.directory, { recursive: true, force: true })
  }
})

test('rejects missing, duplicate, and undeclared artifacts', () => {
  const release = fixture()
  try {
    const manifest = JSON.parse(String(requireRead(release.manifestPath)))
    manifest.artifacts[1].package = manifest.artifacts[0].package
    writeFileSync(join(release.directory, RELEASE_MANIFEST), JSON.stringify(manifest))
    assert.throws(() => resolveLocalRelease(release.directory), /exactly one/)

    writeReleaseManifest(release.directory, RELEASE_PACKAGES.map(({ packageName }, index) => ({
      path: join(release.directory, `artifact-${index}.tgz`), packageName, version: `1.0.${index}`,
    })))
    writeFileSync(join(release.directory, 'extra.tgz'), 'extra')
    assert.throws(() => resolveLocalRelease(release.directory), /undeclared tarballs/)
  } finally {
    rmSync(release.directory, { recursive: true, force: true })
  }
})

function requireRead(path) {
  return process.getBuiltinModule('node:fs').readFileSync(path)
}