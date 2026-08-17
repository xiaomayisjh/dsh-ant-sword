import { describe, expect, it, vi } from 'vitest'
import { SkillsReconciler } from '../src/skill-runtime.ts'
import type { AntSwordRuntimeConfig } from '../src/runtime-config.ts'

function runtime(disabledSkills: string[]): AntSwordRuntimeConfig {
  return { mcpServers: [], rules: [], disabledSkills }
}

describe('skill disable overlay', () => {
  it('filters disabled skills at list and invalidates on commit', async () => {
    const invalidate = vi.fn()
    const reconciler = new SkillsReconciler()
    const provider = reconciler.provider({ signal: new AbortController().signal, invalidate })
    const before = await provider.list({})
    const candidates = 'candidates' in before ? before.candidates : before
    const selected = candidates[0]
    expect(selected).toBeDefined()

    await reconciler.prepare(runtime([selected!.name]), runtime([])).commit()
    const after = await provider.list({})
    const filtered = 'candidates' in after ? after.candidates : after
    expect(filtered.some(candidate => candidate.name === selected!.name)).toBe(false)
    expect(await provider.get(selected!, {})).toBeUndefined()
    expect(invalidate).toHaveBeenCalledOnce()
  })

  it('restores the previous disable set on rollback', async () => {
    const reconciler = new SkillsReconciler()
    const provider = reconciler.provider({ signal: new AbortController().signal, invalidate: vi.fn() })
    const listed = await provider.list({})
    const candidates = 'candidates' in listed ? listed.candidates : listed
    const selected = candidates[0]!
    const change = reconciler.prepare(runtime([selected.name]), runtime([]))
    await change.commit()
    await change.rollback()
    expect(await provider.get(selected, {})).toBeDefined()
  })
})