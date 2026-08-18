import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${String(result.status)}`)
}

function requireFile(root, path) {
  const absolute = join(root, path)
  if (!existsSync(absolute)) throw new Error(`packed entry is missing: ${path}`)
  return absolute
}

export async function smokeTarball(tarball) {
  const temporary = mkdtempSync(join(tmpdir(), 'ant-sword-install-smoke-'))
  try {
    run('tar', ['-xzf', resolve(tarball), '-C', temporary])
    const packageRoot = join(temporary, 'package')
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
    requireFile(packageRoot, manifest.main)
    requireFile(packageRoot, manifest.types)
    const invariant = manifest.exports?.['./invariant']
    if (typeof invariant?.default !== 'string' || typeof invariant?.types !== 'string') {
      throw new Error('packed invariant export is incomplete')
    }
    const module = await import(pathToFileURL(requireFile(packageRoot, invariant.default)).href)
    if (typeof module.apply !== 'function' || typeof module.name !== 'string') {
      throw new Error('packed invariant module did not expose the companion plugin')
    }
    requireFile(packageRoot, invariant.types)
    return { name: manifest.name, version: manifest.version }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const tarball = process.argv[2]
  if (tarball === undefined) throw new Error('usage: node scripts/install-smoke.mjs <tarball>')
  const result = await smokeTarball(tarball)
  console.log(`install-smoke: loaded ${result.name}@${result.version}`)
}