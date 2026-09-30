import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

export const RELEASE_MANIFEST = 'ant-sword-release-manifest.json'

// The current release is self-contained: the root harness package includes
// the Autograph browser client at its `./client` export.  dshmarket remains a
// separate artifact because it owns the profile installer and client-only
// dependency shim.
export const RELEASE_PACKAGES = [
  { packageName: '@deepseek-ai/dsh-ant-sword-harness', key: 'bundle' },
  { packageName: 'dshmarket', key: 'dshmarket' },
]

// Releases produced before the embedded client migration had a third,
// standalone UI tarball.  Keep accepting those manifests so an already
// downloaded release can still be installed; install-profile deliberately
// ignores the returned `ui` path.
export const LEGACY_RELEASE_PACKAGES = [
  { packageName: '@deepseek-ai/dsh-ant-sword-harness', key: 'bundle' },
  { packageName: '@deepseek-ai/dsh-client-ui-autograph', key: 'ui' },
  { packageName: 'dshmarket', key: 'dshmarket' },
]

export function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function writeReleaseManifest(directory, artifacts) {
  const entries = artifacts.map(({ path, packageName, version }) => ({
    filename: basename(path),
    package: packageName,
    version,
    sha256: sha256(path),
  }))
  const manifest = { schemaVersion: 1, artifacts: entries }
  const path = join(directory, RELEASE_MANIFEST)
  writeFileSync(path, `${JSON.stringify(manifest, undefined, 2)}\n`)
  return path
}

function fail(message) {
  throw new Error(`invalid Ant Sword release: ${message}`)
}

export function resolveLocalRelease(input) {
  const candidate = resolve(input)
  if (!existsSync(candidate)) fail(`path does not exist: ${candidate}`)
  const manifestPath = statSync(candidate).isDirectory() ? join(candidate, RELEASE_MANIFEST) : candidate
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) fail(`manifest not found: ${manifestPath}`)

  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    fail(`cannot parse ${manifestPath}: ${error.message}`)
  }
  if (![1, 2].includes(manifest.schemaVersion) || !Array.isArray(manifest.artifacts)) {
    fail('expected schemaVersion 1 or 2 and an artifacts array')
  }

  // Schema version 1 was used for both layouts.  Schema version 2 is emitted
  // by newer tooling and is reserved for the embedded-client layout.  Select
  // the expected layout from the artifact count, then validate every package
  // name below so duplicate/missing entries get an actionable error.
  const layout = manifest.artifacts.length === RELEASE_PACKAGES.length
    ? RELEASE_PACKAGES
    : manifest.schemaVersion === 1 && manifest.artifacts.length === LEGACY_RELEASE_PACKAGES.length
      ? LEGACY_RELEASE_PACKAGES
      : undefined
  if (layout === undefined) {
    fail(`expected exactly ${RELEASE_PACKAGES.length} current artifacts (or one legacy three-artifact manifest)`)
  }

  const directory = dirname(manifestPath)
  const result = {}
  for (const { packageName, key } of layout) {
    const matches = manifest.artifacts.filter((entry) => entry?.package === packageName)
    if (matches.length !== 1) fail(`expected exactly one ${packageName} artifact, found ${matches.length}`)
    const entry = matches[0]
    if (typeof entry.filename !== 'string' || basename(entry.filename) !== entry.filename || !entry.filename.endsWith('.tgz')) fail(`${packageName} has an invalid filename`)
    if (typeof entry.version !== 'string' || entry.version === '') fail(`${packageName} has an invalid version`)
    if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) fail(`${packageName} has an invalid sha256`)
    const path = join(directory, entry.filename)
    if (!existsSync(path) || !statSync(path).isFile()) fail(`artifact not found: ${path}`)
    const actual = sha256(path)
    if (actual !== entry.sha256) fail(`sha256 mismatch for ${entry.filename}: expected ${entry.sha256}, got ${actual}`)
    result[key] = path
  }

  const declared = new Set(manifest.artifacts.map((entry) => entry.filename))
  if (declared.size !== manifest.artifacts.length) fail('artifact filenames must be unique')
  const tarballs = readdirSync(directory).filter((name) => name.endsWith('.tgz'))
  const extras = tarballs.filter((name) => !declared.has(name))
  if (extras.length > 0) fail(`undeclared tarballs found: ${extras.join(', ')}`)

  return { manifestPath, ...result }
}
