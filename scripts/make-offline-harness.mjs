#!/usr/bin/env node

/**
 * Windows-safe offline-tarball rewrite for the harness: extract the packed
 * tgz, clear its dependencies/peerDependencies (the vendored mcp-client is
 * already bundled inside the tarball), and repack — mirroring
 * release-github.mjs makeOfflineTarball(..., clearDependencies=true) without
 * relying on GNU tar's handling of Windows drive paths.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, createReadStream, createWriteStream } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const SRC = resolve(process.argv[2] ?? 'deepseek-ai-dsh-ant-sword-harness-0.1.0-rc.22.tgz')
const OUT = resolve(process.argv[3] ?? 'deepseek-ai-dsh-ant-sword-harness-0.1.0-rc.22-offline.tgz')

if (!existsSync(SRC)) throw new Error(`source tarball not found: ${SRC}`)

const staging = resolve('.offline-rewrite')
rmSync(staging, { recursive: true, force: true })
mkdirSync(staging, { recursive: true })

// Extract using tar with --force-local so C:\ is not read as host:path.
function tar(args) {
  const result = spawnSync('tar', args, { stdio: 'inherit', shell: false })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`tar ${args.join(' ')} exited ${result.status}`)
}

tar(['--force-local', '-xzf', SRC, '-C', staging])

const manifestPath = join(staging, 'package', 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.dependencies = {}
manifest.peerDependencies = {}
writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)

rmSync(OUT, { force: true })
tar(['--force-local', '-czf', OUT, '-C', staging, 'package'])
rmSync(staging, { recursive: true, force: true })

console.log(`offline tarball written: ${OUT}`)
