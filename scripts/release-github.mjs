/**
 * Release @deepseek-ai/dsh-ant-sword-harness to a GitHub repository as a
 * release asset, then print the one-line install command.
 *
 * Why a release asset and not a git-tag dependency: a git-tag spec makes pnpm
 * clone the repository, which (a) requires every consumer to hold read
 * credentials for a private repo, and (b) triggers the dependency's prepare
 * script that pnpm blocks until allowlisted. A release tarball is a plain
 * HTTPS artifact: `dsh plugin add <url>` downloads and installs it with no
 * clone and no build step, on both public and private repositories.
 *
 * This script talks to the GitHub REST API directly (Node's built-in fetch),
 * so it needs no `gh` CLI. Credential resolution order (first hit wins):
 *   1. --token <pat>
 *   2. GH_TOKEN or GITHUB_TOKEN environment variable
 *   3. an already-authenticated `gh` CLI (`gh auth token`), if present
 *
 * Usage:
 *   node scripts/release-github.mjs --repo <owner>/<name> [--tag v<x.y.z>]
 *       [--profile <name>] [--create] [--private] [--token <pat>] [--dry-run]
 *
 *   --repo     target GitHub repository (owner/name), required
 *   --tag      release tag; defaults to `v<package version>`
 *   --profile  profile name used in the printed install command (display only)
 *   --create   create the repository first when it does not exist
 *   --private  with --create, create it private (default when --create is set)
 *   --token    a PAT with repo scope; overrides env and gh
 *   --dry-run  build and pack only; print the would-be release, no network
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve, isAbsolute, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { RELEASE_MANIFEST, writeReleaseManifest } from './release-artifacts.mjs'

const PACKAGE_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)))
const REPO_ROOT = PACKAGE_DIR
const UI_PACKAGE_DIR = join(REPO_ROOT, 'vendor', 'ui-autograph')
const API = 'https://api.github.com'

/** Run a command, inheriting stdio, and throw on failure. */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32', ...options })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${String(result.status)}`)
}

/** Run a command and capture stdout. */
function capture(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: process.platform === 'win32', ...options })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${String(result.status)}: ${result.stderr}`)
  return result.stdout.trim()
}

/** Resolve the GitHub token: --token, then env, then gh. */
function resolveToken(cliToken) {
  if (cliToken !== undefined && cliToken !== '') return cliToken
  const env = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN
  if (env !== undefined && env !== '') return env
  try {
    const token = capture('gh', ['auth', 'token'])
    if (token !== '') return token
  } catch { /* gh absent or not authenticated */ }
  return undefined
}

function requireToken(token) {
  if (token !== undefined) return
  throw new Error(
    'No GitHub credential found. Provide one of:\n'
    + '  - --token <pat>   (a PAT with repo scope)\n'
    + '  - set GH_TOKEN (or GITHUB_TOKEN)\n'
    + '  - gh auth login   (if the gh CLI is installed)\n'
    + 'Create a PAT at https://github.com/settings/tokens (repo scope).',
  )
}

/** Call the GitHub REST API; returns parsed JSON, or undefined on 404. */
async function api(token, method, path, body, notFoundStatuses = [404]) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'ant-sword-release',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (notFoundStatuses.includes(response.status)) return undefined
  const text = await response.text()
  const data = text === '' ? {} : JSON.parse(text)
  if (!response.ok) {
    throw new Error(`GitHub API ${method} ${path} -> ${response.status}: ${data.message ?? text}`)
  }
  return data
}

/** Ensure the repository exists, creating it when --create is set. */
async function ensureRepo(token, repo, create, isPrivate) {
  const existing = await api(token, 'GET', `/repos/${repo}`)
  if (existing !== undefined) {
    console.log(`release: repository ${repo} exists (${existing.private ? 'private' : 'public'})`)
    return
  }
  if (!create) {
    throw new Error(`repository ${repo} not found; pass --create to create it`)
  }
  const owner = repo.split('/')[0]
  const name = repo.split('/')[1]
  // Resolve the authenticated user to decide user-repo vs org-repo endpoint.
  const me = await api(token, 'GET', '/user')
  if (me.login === owner) {
    await api(token, 'POST', '/user/repos', { name, private: isPrivate, description: 'Security-research dsh bundle distribution (research-only, authorized engagements)' })
  } else {
    await api(token, 'POST', `/orgs/${owner}/repos`, { name, private: isPrivate, description: 'Security-research dsh bundle distribution (research-only, authorized engagements)' })
  }
  console.log(`release: created ${isPrivate ? 'private' : 'public'} repository ${repo}`)
}

/**
 * Ensure the repository has at least one commit on its default branch. A
 * freshly created repository is empty (no branch, no commit), and the
 * Releases API rejects a tag that points at nothing with 422. When empty,
 * create a minimal README commit through the Git Data API (blob → tree →
 * commit → ref), which needs no local clone.
 */
async function ensureDefaultBranch(token, repo) {
  const repoInfo = await api(token, 'GET', `/repos/${repo}`)
  const branch = repoInfo.default_branch ?? 'main'
  const existing = await api(token, 'GET', `/repos/${repo}/git/ref/heads/${branch}`, undefined, [404, 409])
  if (existing !== undefined) return // branch exists with a commit
  const blob = await api(token, 'POST', `/repos/${repo}/git/blobs`, {
    content: `# ${repo}\n\nSecurity-research dsh bundle distribution. Install a release tarball with \`dsh plugin add <release-tarball-url>\`.\n`,
    encoding: 'utf-8',
  })
  const tree = await api(token, 'POST', `/repos/${repo}/git/trees`, {
    tree: [{ path: 'README.md', mode: '100644', type: 'blob', sha: blob.sha }],
  })
  const commit = await api(token, 'POST', `/repos/${repo}/git/commits`, {
    message: 'Initial commit',
    tree: tree.sha,
  })
  await api(token, 'POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha })
  console.log(`release: initialized empty repository with an initial commit on ${branch}`)
}

/** Find an existing release by tag. */
async function findRelease(token, repo, tag) {
  return api(token, 'GET', `/repos/${repo}/releases/tags/${tag}`)
}

/** Create the release for the tag, targeting the default branch. */
async function createRelease(token, repo, tag, name, version) {
  const repoInfo = await api(token, 'GET', `/repos/${repo}`)
  return api(token, 'POST', `/repos/${repo}/releases`, {
    tag_name: tag,
    target_commitish: repoInfo.default_branch ?? 'main',
    name: `${name} ${version}`,
    body: `Security-research bundle ${version}. Install: dsh plugin add <this release's tarball URL>`,
  })
}

/** Delete a release asset (for idempotent re-upload). */
async function deleteAsset(token, repo, assetId) {
  const response = await fetch(`${API}/repos/${repo}/releases/assets/${assetId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ant-sword-release' },
  })
  if (!response.ok && response.status !== 404) throw new Error(`delete asset ${assetId} -> ${response.status}`)
}

/** Upload the tarball as a release asset, replacing any same-named asset. */
async function uploadAsset(token, release, tarball) {
  const name = basename(tarball)
  const existing = (release.assets ?? []).find((asset) => asset.name === name)
  if (existing !== undefined) {
    await deleteAsset(token, release._repo, existing.id)
  }
  const bytes = readFileSync(tarball)
  const uploadUrl = release.upload_url.replace('{?name,label}', '')
  const response = await fetch(`${uploadUrl}?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.length),
      'User-Agent': 'ant-sword-release',
    },
    body: bytes,
  })
  const data = await response.json()
  if (!response.ok) throw new Error(`upload asset -> ${response.status}: ${data.message ?? ''}`)
  return data
}

/** Verify the committed standalone build outputs before packing. */
function build() {
  const required = [
    join(PACKAGE_DIR, 'lib', 'index.js'),
    join(PACKAGE_DIR, 'lib', 'rewind-plugin.js'),
    join(UI_PACKAGE_DIR, 'lib', 'index.js'),
    join(UI_PACKAGE_DIR, 'lib', 'client.js'),
  ]
  const missing = required.filter((path) => !existsSync(path))
  if (missing.length > 0) {
    throw new Error(`committed build output is incomplete: ${missing.join(', ')}`)
  }
}

/** Pack one workspace package into `destination` and return the tarball path. */
function packWorkspace(packageDir, destination) {
  const out = capture('pnpm', ['--dir', packageDir, 'pack', '--pack-destination', destination])
  const line = out.split('\n').map((value) => value.trim()).filter((value) => value.endsWith('.tgz')).pop()
  if (line === undefined) throw new Error(`pnpm pack printed no tarball path:\n${out}`)
  const tarball = isAbsolute(line) ? line : join(destination, line)
  if (!existsSync(tarball)) throw new Error(`pnpm pack produced no tarball at ${tarball}`)
  return tarball
}

/** Download one pinned registry package into the release; consumers never contact the registry. */
function packRegistry(packageName, version, destination) {
  const out = capture('npm', ['pack', `${packageName}@${version}`, '--pack-destination', destination], {
    env: { ...process.env, npm_config_offline: 'false', PNPM_CONFIG_OFFLINE: 'false' },
  })
  const filename = out.split('\n').map((value) => value.trim()).filter((value) => value.endsWith('.tgz')).pop()
  if (filename === undefined) throw new Error(`npm pack printed no tarball name for ${packageName}@${version}:\n${out}`)
  const tarball = join(destination, basename(filename))
  if (!existsSync(tarball)) throw new Error(`npm pack produced no tarball at ${tarball}`)
  return tarball
}

function pinnedVersion(spec, packageName) {
  const match = spec.match(/^(?:\^|~)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/)
  if (match === null) throw new Error(`release dependency ${packageName} must use a single pinned-compatible version, got ${spec}`)
  return match[1]
}

function prepareDestination(directory) {
  mkdirSync(directory, { recursive: true })
  for (const filename of readdirSync(directory)) {
    if (filename.endsWith('.tgz') || filename === RELEASE_MANIFEST) rmSync(join(directory, filename), { force: true })
  }
}

function makeOfflineTarball(tarball, destination, clearDependencies = false) {
  const staging = join(destination, `.rewrite-${basename(tarball, '.tgz')}`)
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  run('tar', ['-xzf', tarball, '-C', staging])
  const manifestPath = join(staging, 'package', 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (clearDependencies) manifest.dependencies = {}
  manifest.peerDependencies = {}
  writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)
  rmSync(tarball, { force: true })
  run('tar', ['-czf', tarball, '-C', staging, 'package'])
  rmSync(staging, { recursive: true, force: true })
  return tarball
}

/** The one-line complete-profile installer for consumers. */
function installCommand(repo, profile) {
  const bootstrap = `https://raw.githubusercontent.com/${repo}/main/install-ant-sword.ps1`
  if (profile === undefined || profile === 'web') return `irm "${bootstrap}" | iex`
  return `& ([scriptblock]::Create((irm "${bootstrap}"))) -Profile "${profile}"`
}

async function main() {
  const { values } = parseArgs({
    options: {
      repo: { type: 'string' },
      tag: { type: 'string' },
      profile: { type: 'string' },
      create: { type: 'boolean', default: false },
      private: { type: 'boolean', default: false },
      token: { type: 'string' },
      output: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
  })
  if (values.repo === undefined) throw new Error('usage: release-github.mjs --repo <owner>/<name> [--tag v<x.y.z>] [--profile <name>] [--output <directory>] [--create] [--private] [--token <pat>] [--dry-run]')

  const manifest = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8'))
  const uiManifest = JSON.parse(readFileSync(join(UI_PACKAGE_DIR, 'package.json'), 'utf8'))
  const version = manifest.version
  const tag = values.tag ?? `v${version}`
  const destination = resolve(values.output ?? join(REPO_ROOT, '.release', `ant-sword-${tag}`))
  const agentTeamsVersion = pinnedVersion(manifest.dependencies['@nanmicoder/dsh-agent-teams'], '@nanmicoder/dsh-agent-teams')
  const dshmarketVersion = pinnedVersion(manifest.dependencies.dshmarket, 'dshmarket')
  const isPrivate = values.private || values.create

  console.log(`release: building ${manifest.name}@${version} for ${values.repo} @ ${tag}`)
  build()
  prepareDestination(destination)

  const artifacts = [
    { path: makeOfflineTarball(packWorkspace(PACKAGE_DIR, destination), destination, true), packageName: manifest.name, version },
    { path: makeOfflineTarball(packWorkspace(UI_PACKAGE_DIR, destination), destination), packageName: uiManifest.name, version: uiManifest.version },
    { path: makeOfflineTarball(packRegistry('@nanmicoder/dsh-agent-teams', agentTeamsVersion, destination), destination), packageName: '@nanmicoder/dsh-agent-teams', version: agentTeamsVersion },
    { path: makeOfflineTarball(packRegistry('dshmarket', dshmarketVersion, destination), destination), packageName: 'dshmarket', version: dshmarketVersion },
  ]
  const manifestPath = writeReleaseManifest(destination, artifacts)
  const assets = [...artifacts.map((artifact) => artifact.path), manifestPath]
  console.log(`release: wrote ${assets.length} assets to ${destination}`)

  if (values['dry-run']) {
    console.log(`release: dry-run — built ${values.repo} @ ${tag} without network upload`)
    console.log(`release: install on Windows with: .\\install-ant-sword.ps1 -Release "${destination}"`)
    console.log(`release: install on Linux/macOS with: ./install-ant-sword.sh --release "${destination}"`)
    return
  }

  const token = resolveToken(values.token)
  requireToken(token)

  await ensureRepo(token, values.repo, values.create, isPrivate)
  await ensureDefaultBranch(token, values.repo)
  let release = await findRelease(token, values.repo, tag)
  if (release === undefined) {
    release = await createRelease(token, values.repo, tag, manifest.name, version)
    console.log(`release: created release ${tag}`)
  } else {
    console.log(`release: reusing existing release ${tag}`)
  }
  release._repo = values.repo
  for (const path of assets) {
    const asset = await uploadAsset(token, release, path)
    console.log(`release: uploaded ${asset.name} (${asset.size} bytes)`)
  }

  console.log('')
  console.log('Install with one line (Windows PowerShell):')
  console.log(`  ${installCommand(values.repo, values.profile)}`)
  console.log('Install with one line (Linux/macOS):')
  console.log(`  curl -fsSL "https://raw.githubusercontent.com/${values.repo}/main/install-ant-sword.sh" | bash`)
}

main().catch((error) => { console.error(`release: ${error.message}`); process.exit(1) })