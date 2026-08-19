import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { findThinkingPolicy, mapThinkingLevel, ThinkingPolicyRuntime } from '../src/thinking-policy.ts'
import type { AntSwordRuntimeConfig } from '../src/runtime-config.ts'

const efforts = ['off', 'low', 'medium', 'high', 'max'].map(id => ({ id: ReasoningEffortId(id), name: id }))

function runtimeConfig(): AntSwordRuntimeConfig {
  return {
    mcpServers: [],
    disabledSkills: [],
    rules: [],
    thinkingPolicies: [{ providerId: 'custom', modelId: 'reasoner', level: 'high' }],
    thinkingFallbacks: [],
  }
}

describe('thinking policy', () => {
  it('maps five semantic levels monotonically onto any adapter effort count', () => {
    expect(mapThinkingLevel('minimum', efforts)?.id).toBe('off')
    expect(mapThinkingLevel('medium', efforts)?.id).toBe('medium')
    expect(mapThinkingLevel('maximum', efforts)?.id).toBe('max')

    const three = [efforts[0]!, efforts[2]!, efforts[4]!]
    expect(['off', 'low', 'medium', 'high', 'max'].map((_, index) => mapThinkingLevel(
      ['minimum', 'low', 'medium', 'high', 'maximum'][index] as 'minimum' | 'low' | 'medium' | 'high' | 'maximum',
      three,
    )?.id)).toEqual(['off', 'medium', 'medium', 'max', 'max'])
    expect(mapThinkingLevel('high', [])).toBeUndefined()
  })

  it('matches only the exact provider and model route', () => {
    const policies = runtimeConfig().thinkingPolicies
    expect(findThinkingPolicy(policies, 'custom', 'reasoner')?.level).toBe('high')
    expect(findThinkingPolicy(policies, 'custom', 'other')).toBeUndefined()
  })

  it('discovers adapter capabilities and applies the mapped effort', async () => {
    const resolveModelInfo = vi.fn(async () => ({
      provider: 'custom',
      id: 'reasoner',
      name: 'Reasoner',
      reasoning: { efforts },
    }))
    const runtime = new ThinkingPolicyRuntime(
      { llm: { resolveModelInfo } } as unknown as Context,
      { snapshot: () => ({ applied: runtimeConfig() }) },
    )

    await expect(runtime.applyPolicy({ provider: 'custom', model: 'reasoner' })).resolves.toEqual({
      provider: 'custom',
      model: 'reasoner',
      reasoningEffort: ReasoningEffortId('high'),
    })
    await runtime.applyPolicy({ provider: 'custom', model: 'reasoner' })
    expect(resolveModelInfo).toHaveBeenCalledOnce()
  })

  it('does not invent an effort for unsupported models', async () => {
    const runtime = new ThinkingPolicyRuntime(
      { llm: { resolveModelInfo: vi.fn(async () => ({ provider: 'custom', id: 'reasoner', name: 'Reasoner' })) } } as unknown as Context,
      { snapshot: () => ({ applied: runtimeConfig() }) },
    )
    const base = { provider: 'custom', model: 'reasoner' }
    await expect(runtime.applyPolicy(base)).resolves.toBe(base)
  })
})