import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

export const RELEASE_MANIFEST = 'ant-sword-release-manifest.json'
export const RELEASE_PACKAGES = [
  { packageName: '@deepseek-ai/dsh-ant-sword-harness', key: 'bundle' },
  { packageName: '@deepseek-ai/dsh-client-ui-autograph', key: 'ui' },
  { packageName: '@nanmicoder/dsh-agent-teams', key: 'agentTeams' },
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
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.artifacts)) fail('expected schemaVersion 1 and an artifacts array')
  if (manifest.artifacts.length !== RELEASE_PACKAGES.length) fail(`expected exactly ${RELEASE_PACKAGES.length} artifacts`)

  const directory = dirname(manifestPath)
  const result = {}
  for (const { packageName, key } of RELEASE_PACKAGES) {
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