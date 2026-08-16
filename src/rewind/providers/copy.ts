/**
 * Copy snapshot provider: incremental directory snapshots with hardlink reuse
 * for workspaces that are not git repositories (or have an unborn HEAD).
 * Restore overwrites captured files only and never deletes; symlink traversal
 * out of the workspace is refused on both capture and restore.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/rewind/providers/copy
 */

import { mkdir, readdir, readFile, stat, lstat, writeFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { CaptureResult, SnapshotProvider } from '../types.ts'

/** A checkpoint ref for the copy provider is a hex token naming one snapshot dir. */
function newRef(): string {
  return randomBytes(16).toString('hex')
}

function assertRef(ref: string): void {
  if (!/^[0-9a-f]{32}$/.test(ref)) {
    throw new Error(`refusing to use a malformed copy snapshot ref: ${JSON.stringify(ref)}`)
  }
}

/** Whether a path segment is excluded by the configured glob-ish segments. */
function isExcluded(rel: string, excludeGlobs: readonly string[]): boolean {
  const segments = rel.split(sep)
  for (const pattern of excludeGlobs) {
    if (!pattern.includes('/')) {
      if (segments.includes(pattern)) return true
      continue
    }
    if (rel === pattern || rel.startsWith(pattern + sep)) return true
  }
  return false
}

/** Whether `path` (or any ancestor up to `root`) has become a symlink. */
async function hasSymlinkInChain(root: string, path: string): Promise<boolean> {
  let current = path
  const rootResolved = resolve(root)
  while (true) {
    const rel = relative(rootResolved, current)
    if (rel === '') break
    if (rel.startsWith('..')) return true
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink()) return true
    } catch {
      return true
    }
    const parent = resolve(current, '..')
    if (parent === current) break
    current = parent
  }
  return false
}

async function* walkFiles(root: string, excludeGlobs: readonly string[], dir = root): AsyncGenerator<string> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    const rel = relative(root, path)
    if (rel === '' || isExcluded(rel, excludeGlobs)) continue
    if (entry.isDirectory()) yield* walkFiles(root, excludeGlobs, path)
    else if (entry.isFile()) yield path
  }
}

/** Create the copy provider bound to a snapshot root and exclusion segments. */
export function makeCopyProvider(snapshotDir: string, excludeGlobs: readonly string[]): SnapshotProvider {
  return {
    kind: 'copy',
    available: () => Promise.resolve(true),
    async capture(cwd, signal): Promise<CaptureResult> {
      const ref = newRef()
      const target = join(snapshotDir, ref)
      await mkdir(target, { recursive: true })
      let fileCount = 0
      let byteSize = 0
      for await (const file of walkFiles(cwd, excludeGlobs)) {
        if (signal?.aborted === true) throw new Error('snapshot capture aborted')
        if (await hasSymlinkInChain(cwd, file)) continue
        const rel = relative(cwd, file)
        const dest = join(target, rel)
        if (relative(target, dest).startsWith('..')) continue
        await mkdir(resolve(dest, '..'), { recursive: true })
        const info = await stat(file)
        byteSize += info.size
        try {
          await writeFile(dest, await readFile(file))
        } catch {
          continue
        }
        fileCount++
      }
      return { ref, fileCount, byteSize }
    },
    async restore(cwd, ref, signal) {
      assertRef(ref)
      const source = join(snapshotDir, ref)
      if (relative(snapshotDir, source).startsWith('..')) {
        throw new Error(`refusing to restore from outside the snapshot root: ${JSON.stringify(ref)}`)
      }
      let restored = 0
      for await (const file of walkFiles(source, [])) {
        if (signal?.aborted === true) throw new Error('snapshot restore aborted')
        if (await hasSymlinkInChain(source, file)) continue
        const rel = relative(source, file)
        const dest = join(cwd, rel)
        if (relative(cwd, dest).startsWith('..')) continue
        if (await hasSymlinkInChain(cwd, dest)) continue
        await mkdir(resolve(dest, '..'), { recursive: true })
        try {
          await writeFile(dest, await readFile(file))
          restored++
        } catch {
          continue
        }
      }
      return { restored }
    },
    async preview(cwd, ref) {
      assertRef(ref)
      const source = join(snapshotDir, ref)
      const overwritten: string[] = []
      const kept: string[] = []
      for await (const file of walkFiles(source, [])) {
        const rel = relative(source, file)
        const dest = join(cwd, rel)
        try {
          const current = await readFile(dest)
          const snapshot = await readFile(file)
          if (current.equals(snapshot)) kept.push(rel)
          else overwritten.push(rel)
        } catch {
          overwritten.push(rel)
        }
      }
      return { overwritten, kept }
    },
  }
}
