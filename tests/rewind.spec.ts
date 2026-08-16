/**
 * Snapshot provider seams: the copy provider captures and restores real files
 * under a temporary workspace, overwrites without deleting, and refuses
 * malformed refs; the registry resolves auto/git/copy per workspace.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, afterEach } from 'vitest'
import { makeCopyProvider } from '../src/rewind/providers/copy.ts'
import { makeGitProvider } from '../src/rewind/providers/git.ts'
import { SnapshotProviderRegistry } from '../src/rewind/registry.ts'
import type { ResolvedRewindConfig } from '../src/rewind/types.ts'

const dirs: string[] = []

async function workspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ant-sword-rewind-'))
  dirs.push(dir)
  return dir
}

function config(overrides: Partial<ResolvedRewindConfig> = {}): ResolvedRewindConfig {
  return {
    enabled: true,
    provider: 'auto',
    gitBin: 'git',
    snapshotDir: join(tmpdir(), 'ant-sword-rewind-store'),
    maxSnapshots: 50,
    maxSnapshotBytes: 512 * 1024 * 1024,
    pruneOnTurnEnd: true,
    mutationTools: ['bash', 'write'],
    excludeGlobs: ['node_modules', '.git'],
    listLimit: 10,
    preRewindCheckpoint: 'warn',
    ...overrides,
  }
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('copy snapshot provider', () => {
  it('captures and restores overwritten files without deleting newer ones', async () => {
    const cwd = await workspace()
    const store = await workspace()
    await writeFile(join(cwd, 'a.txt'), 'v1')
    const provider = makeCopyProvider(store, ['node_modules', '.git'])

    const snap = await provider.capture(cwd)
    expect(snap.ref).toMatch(/^[0-9a-f]{32}$/)
    expect(snap.fileCount).toBe(1)

    await writeFile(join(cwd, 'a.txt'), 'v2')
    await writeFile(join(cwd, 'new.txt'), 'created-after')

    const restored = await provider.restore(cwd, snap.ref)
    expect(restored.restored).toBe(1)
    expect(await readFile(join(cwd, 'a.txt'), 'utf8')).toBe('v1')
    expect(await readFile(join(cwd, 'new.txt'), 'utf8')).toBe('created-after')
  })

  it('reports preview impact read-only without writing', async () => {
    const cwd = await workspace()
    const store = await workspace()
    await writeFile(join(cwd, 'a.txt'), 'v1')
    await writeFile(join(cwd, 'same.txt'), 'same')
    const provider = makeCopyProvider(store, [])
    const snap = await provider.capture(cwd)
    await writeFile(join(cwd, 'a.txt'), 'v2')

    const impact = await provider.preview(cwd, snap.ref)
    expect(impact.overwritten).toContain('a.txt')
    expect(impact.kept).toContain('same.txt')
    expect(await readFile(join(cwd, 'a.txt'), 'utf8')).toBe('v2')
  })

  it('refuses a malformed ref at restore and preview', async () => {
    const cwd = await workspace()
    const store = await workspace()
    const provider = makeCopyProvider(store, [])
    await expect(provider.restore(cwd, '../evil')).rejects.toThrow(/malformed/)
    await expect(provider.preview(cwd, 'not-hex')).rejects.toThrow(/malformed/)
  })
})

describe('snapshot provider registry', () => {
  it('resolves copy for a non-git directory under auto', async () => {
    const cwd = await workspace()
    const store = await workspace()
    const registry = new SnapshotProviderRegistry(config({ snapshotDir: store }))
    const provider = await registry.resolve('auto', cwd)
    expect(provider.kind).toBe('copy')
  })

  it('fails loud when git is forced on a non-git directory', async () => {
    const cwd = await workspace()
    const store = await workspace()
    const registry = new SnapshotProviderRegistry(config({ snapshotDir: store }))
    const git = makeGitProvider('git')
    await expect(git.available(cwd)).resolves.toBe(false)
    await expect(registry.resolve('git', cwd)).rejects.toThrow(/not usable/)
  })
})
