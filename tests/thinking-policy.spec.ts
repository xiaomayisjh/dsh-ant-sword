import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { findThinkingPolicy, mapThinkingLevel, ThinkingPolicyRuntime } from '../src/thinking-policy.ts'
import type { AntSwordRuntimeConfig } from '../src/runtime-config.ts'

const efforts = ['off', 'low', 'medium', 'high', 'max'].map(id => ({ id: ReasoningEffortId(id), name: id }))

function runtimeConfig(overrides: Partial<AntSwordRuntimeConfig> = {}): AntSwordRuntimeConfig {
  return {
    mcpServers: [],
    disabledSkills: [],
    rules: [],
    thinkingPolicies: [{ providerId: 'custom', modelId: 'reasoner', level: 'high' }],
    thinkingFallbacks: [],
    defaultThinkingFallback: null,
    ...overrides,
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

  it('does not invent an effort for unsupported models when the default fallback is disabled', async () => {
    const runtime = new ThinkingPolicyRuntime(
      { llm: { resolveModelInfo: vi.fn(async () => ({ provider: 'custom', id: 'reasoner', name: 'Reasoner' })) } } as unknown as Context,
      { snapshot: () => ({ applied: runtimeConfig({ defaultThinkingFallback: null }) }) },
    )
    const base = { provider: 'custom', model: 'reasoner' }
    await expect(runtime.applyPolicy(base)).resolves.toBe(base)
  })

  it('applies the default fallback to custom-channel models with no native reasoning', async () => {
    const applied = runtimeConfig({
      thinkingPolicies: [{ providerId: 'qoder', modelId: 'deepseek-v4-flash', level: 'maximum' }],
      defaultThinkingFallback: { minimum: 'off', low: 'high', medium: 'high', high: 'max', maximum: 'max' },
    })
    const runtime = new ThinkingPolicyRuntime(
      { llm: { resolveModelInfo: vi.fn(async () => ({ provider: 'qoder', id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' })) } } as unknown as Context,
      { snapshot: () => ({ applied }) },
    )

    const capability = await runtime.capability('qoder', 'deepseek-v4-flash')
    expect(capability.supported).toBe(true)
    expect(capability.fallback).toBe(true)
    expect(capability.efforts.map(effort => effort.id)).toEqual(['off', 'high', 'high', 'max', 'max'])

    await expect(runtime.applyPolicy({ provider: 'qoder', model: 'deepseek-v4-flash' })).resolves.toEqual({
      provider: 'qoder',
      model: 'deepseek-v4-flash',
      reasoningEffort: 'max',
    })
  })

  it('prefers an explicit per-model fallback over the default', async () => {
    const applied = runtimeConfig({
      thinkingPolicies: [{ providerId: 'qoder', modelId: 'custom-model', level: 'minimum' }],
      thinkingFallbacks: [{ providerId: 'qoder', modelId: 'custom-model', simulatedEfforts: { minimum: 'low', low: 'low', medium: 'medium', high: 'high', maximum: 'high' } }],
      defaultThinkingFallback: { minimum: 'off', low: 'high', medium: 'high', high: 'max', maximum: 'max' },
    })
    const runtime = new ThinkingPolicyRuntime(
      { llm: { resolveModelInfo: vi.fn(async () => ({ provider: 'qoder', id: 'custom-model', name: 'Custom' })) } } as unknown as Context,
      { snapshot: () => ({ applied }) },
    )
    const capability = await runtime.capability('qoder', 'custom-model')
    expect(capability.efforts.map(effort => effort.id)).toEqual(['low', 'low', 'medium', 'high', 'high'])
  })
})