import { describe, expect, it, vi } from 'vitest'
import type { InstallComponent } from '../src/installer/catalog.ts'
import { orderSources, planInstallation } from '../src/installer/planner.ts'
import { InstallManager, InstallerError } from '../src/installer/transaction.ts'
import type { InstallRunner } from '../src/installer/transaction.ts'

const catalog: InstallComponent[] = [
  { id: 'dep', label: 'Dependency', version: '1', dependencies: [], probe: { kind: 'command', command: 'dep', args: [] }, variants: [{ platform: 'win32', architectures: ['x64'], steps: [{ kind: 'command', phase: 'installing', executable: 'install-dep', args: [], timeoutMs: 100 }] }] },
  { id: 'target', label: 'Target', version: '1', dependencies: ['dep'], probe: { kind: 'command', command: 'target', args: [] }, variants: [{ platform: 'win32', architectures: ['x64'], steps: [{ kind: 'download', phase: 'downloading', targetName: 'target.zip', sha256: '00', timeoutMs: 100, sources: [{ id: 'mirror', region: 'domestic', url: 'https://mirror.invalid/a' }, { id: 'official', region: 'official', url: 'https://official.invalid/a' }] }] }] },
]

function runner(overrides: Partial<InstallRunner> = {}): InstallRunner {
  const installed = new Set<string>()
  return {
    probe: vi.fn(async component => installed.has(component.id)),
    command: vi.fn(async executable => { if (executable === 'install-dep') installed.add('dep'); return 'ok' }),
    download: vi.fn(async () => { installed.add('target') }),
    verifySha256: vi.fn(async () => undefined),
    resolveOfficialDigest: vi.fn(async () => '00'),
    commitArtifact: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
    refreshEnvironment: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('controlled installer', () => {
  it('plans dependencies before the requested component', () => {
    expect(planInstallation('target', 'win32', 'x64', catalog).map(entry => entry.component.id)).toEqual(['dep', 'target'])
  })

  it('rejects dependency cycles and unknown components', () => {
    const cyclic = catalog.map(component => component.id === 'dep' ? { ...component, dependencies: ['target'] } : component)
    expect(() => planInstallation('target', 'win32', 'x64', cyclic)).toThrow('cycle')
    expect(() => planInstallation('missing', 'win32', 'x64', catalog)).toThrow('unknown')
  })

  it('orders domestic and official sources by policy', () => {
    const sources = catalog[1]!.variants[0]!.steps[0]!
    if (sources.kind !== 'download') throw new Error('fixture')
    expect(orderSources(sources.sources, 'official-first')[0]!.id).toBe('official')
    expect(orderSources(sources.sources, 'domestic-first')[0]!.id).toBe('mirror')
  })

  it('installs a complete dependency plan and publishes success', async () => {
    const installRunner = runner()
    const manager = new InstallManager(installRunner, 'win32', 'x64', catalog, () => 0)
    const started = manager.start('target', 'domestic-first')
    const completed = await manager.wait(started.id)
    expect(completed?.phase).toBe('succeeded')
    expect(completed?.progress).toBe(1)
    expect(installRunner.command).toHaveBeenCalledOnce()
    expect(installRunner.download).toHaveBeenCalledOnce()
  })

  it('retries retryable download failures then succeeds', async () => {
    const download = vi.fn()
      .mockRejectedValueOnce(new InstallerError('temporary', true))
      .mockResolvedValue(undefined)
    const installRunner = runner({
      download,
      probe: vi.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
    })
    const manager = new InstallManager(installRunner, 'win32', 'x64', catalog, () => 0)
    const operation = manager.start('target', 'domestic-first')
    expect((await manager.wait(operation.id))?.phase).toBe('succeeded')
    expect(download).toHaveBeenCalledTimes(2)
  })

  it('prevents concurrent installs of the same component', () => {
    const pending = new Promise<void>(() => undefined)
    const manager = new InstallManager(runner({ download: vi.fn(() => pending) }), 'win32', 'x64', catalog)
    manager.start('target', 'auto')
    expect(() => manager.start('target', 'auto')).toThrow('active installation')
  })
})