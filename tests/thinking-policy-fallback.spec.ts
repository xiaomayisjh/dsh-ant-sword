import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm'
import { ThinkingPolicyRuntime, findThinkingFallback, THINKING_LEVELS } from '../src/thinking-policy.ts'
import type { ThinkingPolicySource } from '../src/thinking-policy.ts'
import { AntSwordRuntimeConfigSchema } from '../src/runtime-config.ts'
import type { AntSwordRuntimeConfig, ThinkingFallbackPolicy } from '../src/runtime-config.ts'

function createMockContext(resolveModelInfo: (provider: string, model: string) => Promise<LlmResolvedModelInfo>): Context {
  return {
    llm: {
      resolveModelInfo: vi.fn(resolveModelInfo),
    },
    agents: {
      list: () => [],
    },
    on: vi.fn(() => () => undefined),
  } as unknown as Context
}

function createSource(config: AntSwordRuntimeConfig): ThinkingPolicySource {
  return {
    snapshot: () => ({ applied: config }),
  }
}

function baseConfig(overrides: Partial<AntSwordRuntimeConfig> = {}): AntSwordRuntimeConfig {
  return AntSwordRuntimeConfigSchema({
    mcpServers: [],
    disabledSkills: [],
    rules: [],
    thinkingPolicies: [],
    thinkingFallbacks: [],
    // Default off in this suite so each test opts into the exact fallback it
    // exercises; the default-fallback behaviour is covered in thinking-policy.spec.ts.
    defaultThinkingFallback: null,
    ...overrides,
  })
}

describe('ThinkingPolicy Fallback', () => {
  it('uses native reasoning when available', async () => {
    const ctx = createMockContext(async () => ({
      provider: 'deepseek',
      id: 'deepseek-chat',
      name: 'DeepSeek Chat',
      reasoning: {
        efforts: [
          { id: 'low' as any, name: 'Low', description: 'Low effort' },
          { id: 'medium' as any, name: 'Medium', description: 'Medium effort' },
          { id: 'high' as any, name: 'High', description: 'High effort' },
        ],
        defaultEffort: 'medium' as any,
      },
    }))

    const source = createSource(baseConfig())
    const runtime = new ThinkingPolicyRuntime(ctx, source)

    const capability = await runtime.capability('deepseek', 'deepseek-chat')

    expect(capability.supported).toBe(true)
    expect(capability.efforts).toHaveLength(3)
    expect(capability.defaultEffort).toBe('medium')
    expect(capability.fallback).toBeUndefined()
  })

  it('falls back to configured synthetic efforts when native unsupported', async () => {
    const ctx = createMockContext(async () => ({
      provider: 'custom-openai',
      id: 'o1-preview',
      name: 'OpenAI o1 Preview',
      // No reasoning field
    }))

    const config = baseConfig()
    config.thinkingFallbacks = [
      {
        providerId: 'custom-openai',
        modelId: 'o1-preview',
        simulatedEfforts: {
          minimum: 'low',
          low: 'medium',
          medium: 'medium',
          high: 'high',
          maximum: 'high',
        },
      },
    ]

    const source = createSource(config)
    const runtime = new ThinkingPolicyRuntime(ctx, source)

    const capability = await runtime.capability('custom-openai', 'o1-preview')

    expect(capability.supported).toBe(true)
    expect(capability.efforts).toHaveLength(5)
    expect(capability.efforts[0]?.name).toBe('Minimum')
    expect(capability.efforts[0]?.id).toBe('low')
    expect(capability.fallback).toBe(true)
  })

  it('reports unsupported when both native and fallback unavailable', async () => {
    const ctx = createMockContext(async () => ({
      provider: 'unknown',
      id: 'unknown-model',
      name: 'Unknown Model',
      // No reasoning field
    }))

    const source = createSource(baseConfig())
    const runtime = new ThinkingPolicyRuntime(ctx, source)

    const capability = await runtime.capability('unknown', 'unknown-model')

    expect(capability.supported).toBe(false)
    expect(capability.efforts).toHaveLength(0)
    expect(capability.fallback).toBeUndefined()
  })

  it('uses the config-wide default fallback when no native support and no explicit fallback', async () => {
    const ctx = createMockContext(async () => ({
      provider: 'qoder',
      id: 'deepseek-v4-flash',
      name: 'DeepSeek V4 Flash',
      // No reasoning field, no explicit fallback entry
    }))

    const source = createSource(baseConfig({
      defaultThinkingFallback: { minimum: 'off', low: 'high', medium: 'high', high: 'max', maximum: 'max' },
    }))
    const runtime = new ThinkingPolicyRuntime(ctx, source)

    const capability = await runtime.capability('qoder', 'deepseek-v4-flash')

    expect(capability.supported).toBe(true)
    expect(capability.fallback).toBe(true)
    expect(capability.efforts.map(effort => effort.id)).toEqual(['off', 'high', 'high', 'max', 'max'])
  })

  it('supports wildcard matching in fallback policies', async () => {
    const ctx = createMockContext(async () => ({
      provider: 'custom-openai',
      id: 'o1-mini',
      name: 'OpenAI o1 Mini',
    }))

    const config = baseConfig()
    config.thinkingFallbacks = [
      {
        providerId: 'custom-openai',
        modelId: 'o1-*',
        simulatedEfforts: {
          minimum: 'low',
          low: 'medium',
          medium: 'medium',
          high: 'high',
          maximum: 'high',
        },
      },
    ]

    const source = createSource(config)
    const runtime = new ThinkingPolicyRuntime(ctx, source)

    const capability = await runtime.capability('custom-openai', 'o1-mini')

    expect(capability.supported).toBe(true)
    expect(capability.fallback).toBe(true)
  })

  it('prefers exact match over wildcard match', async () => {
    const ctx = createMockContext(async () => ({
      provider: 'custom-openai',
      id: 'o1-preview',
      name: 'OpenAI o1 Preview',
    }))

    const config = baseConfig()
    config.thinkingFallbacks = [
      {
        providerId: 'custom-openai',
        modelId: 'o1-*',
        simulatedEfforts: {
          minimum: 'wildcard-min',
          low: 'wildcard-low',
          medium: 'wildcard-med',
          high: 'wildcard-high',
          maximum: 'wildcard-max',
        },
      },
      {
        providerId: 'custom-openai',
        modelId: 'o1-preview',
        simulatedEfforts: {
          minimum: 'exact-min',
          low: 'exact-low',
          medium: 'exact-med',
          high: 'exact-high',
          maximum: 'exact-max',
        },
      },
    ]

    const source = createSource(config)
    const runtime = new ThinkingPolicyRuntime(ctx, source)

    const capability = await runtime.capability('custom-openai', 'o1-preview')

    expect(capability.supported).toBe(true)
    expect(capability.efforts[0]?.id).toBe('exact-min')
  })

  it('uses fallback when adapter query throws', async () => {
    const ctx = createMockContext(async () => {
      throw new Error('Adapter unavailable')
    })

    const config = baseConfig()
    config.thinkingFallbacks = [
      {
        providerId: 'offline',
        modelId: 'test-model',
        simulatedEfforts: {
          minimum: 'low',
          low: 'medium',
          medium: 'medium',
          high: 'high',
          maximum: 'high',
        },
      },
    ]

    const source = createSource(config)
    const runtime = new ThinkingPolicyRuntime(ctx, source)

    const capability = await runtime.capability('offline', 'test-model')

    expect(capability.supported).toBe(true)
    expect(capability.fallback).toBe(true)
  })

  it('throws when adapter query fails and no fallback exists', async () => {
    const ctx = createMockContext(async () => {
      throw new Error('Adapter unavailable')
    })

    const source = createSource(baseConfig())
    const runtime = new ThinkingPolicyRuntime(ctx, source)

    await expect(runtime.capability('offline', 'no-fallback')).rejects.toThrow('Adapter unavailable')
  })

  it('caches capability results including fallback', async () => {
    const resolveModelInfo = vi.fn(async () => ({
      provider: 'custom',
      id: 'model',
      name: 'Model',
    }))

    const ctx = createMockContext(resolveModelInfo)
    const config = baseConfig()
    config.thinkingFallbacks = [
      {
        providerId: 'custom',
        modelId: 'model',
        simulatedEfforts: {
          minimum: 'low',
          low: 'medium',
          medium: 'medium',
          high: 'high',
          maximum: 'high',
        },
      },
    ]

    const source = createSource(config)
    const runtime = new ThinkingPolicyRuntime(ctx, source)

    await runtime.capability('custom', 'model')
    await runtime.capability('custom', 'model')
    await runtime.capability('custom', 'model')

    expect(resolveModelInfo).toHaveBeenCalledTimes(1)
  })
})

describe('findThinkingFallback', () => {
  const fallbacks: ThinkingFallbackPolicy[] = [
    {
      providerId: 'provider-a',
      modelId: 'exact-model',
      simulatedEfforts: {
        minimum: 'min',
        low: 'low',
        medium: 'med',
        high: 'high',
        maximum: 'max',
      },
    },
    {
      providerId: 'provider-b',
      modelId: 'prefix-*',
      simulatedEfforts: {
        minimum: 'min',
        low: 'low',
        medium: 'med',
        high: 'high',
        maximum: 'max',
      },
    },
  ]

  it('returns exact match', () => {
    const result = findThinkingFallback(fallbacks, 'provider-a', 'exact-model')
    expect(result).toBeDefined()
    expect(result?.modelId).toBe('exact-model')
  })

  it('returns wildcard match', () => {
    const result = findThinkingFallback(fallbacks, 'provider-b', 'prefix-test')
    expect(result).toBeDefined()
    expect(result?.modelId).toBe('prefix-*')
  })

  it('returns undefined when no match', () => {
    const result = findThinkingFallback(fallbacks, 'provider-c', 'no-match')
    expect(result).toBeUndefined()
  })

  it('returns undefined when provider matches but model does not', () => {
    const result = findThinkingFallback(fallbacks, 'provider-b', 'other-model')
    expect(result).toBeUndefined()
  })
})
