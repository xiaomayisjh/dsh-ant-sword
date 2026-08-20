import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import {
  REASONING_EFFORTS_BY_API,
  fillReasoningEfforts,
  reconcilePiAiReasoning,
} from '../src/pi-ai-reasoning.ts'
import type { PiAiRoute } from '../src/pi-ai-reasoning.ts'

describe('fillReasoningEfforts', () => {
  it('fills format-correct efforts per api and counts changes', () => {
    const providers: Record<string, PiAiRoute> = {
      qoder: { api: 'openai-responses', models: [{ id: 'deepseek-v4-flash' }, { id: 'mimo-v2.5' }] },
      zgonline: { api: 'anthropic-messages', models: [{ id: 'glm-5.3' }] },
    }
    const result = fillReasoningEfforts(providers)
    expect(result?.changed).toBe(3)
    expect(result?.providers.qoder!.models![0]!.reasoningEfforts).toEqual(REASONING_EFFORTS_BY_API['openai-responses'])
    // openai-responses carries minimal; anthropic-messages does not.
    expect(result?.providers.qoder!.models![0]!.reasoningEfforts).toHaveProperty('minimal')
    expect(result?.providers.zgonline!.models![0]!.reasoningEfforts).toEqual(REASONING_EFFORTS_BY_API['anthropic-messages'])
    expect(result?.providers.zgonline!.models![0]!.reasoningEfforts).not.toHaveProperty('minimal')
  })

  it('never overwrites a model that already declares reasoningEfforts (map or false)', () => {
    const providers: Record<string, PiAiRoute> = {
      qoder: {
        api: 'openai-responses',
        models: [
          { id: 'custom', reasoningEfforts: { off: null, high: 'high' } },
          { id: 'plain', reasoningEfforts: false },
          { id: 'fresh' },
        ],
      },
    }
    const result = fillReasoningEfforts(providers)
    expect(result?.changed).toBe(1)
    expect(result?.providers.qoder!.models![0]!.reasoningEfforts).toEqual({ off: null, high: 'high' })
    expect(result?.providers.qoder!.models![1]!.reasoningEfforts).toBe(false)
    expect(result?.providers.qoder!.models![2]!.reasoningEfforts).toEqual(REASONING_EFFORTS_BY_API['openai-responses'])
  })

  it('leaves routes with an unknown or missing api untouched', () => {
    const providers: Record<string, PiAiRoute> = {
      weird: { api: 'some-future-protocol', models: [{ id: 'x' }] },
      noapi: { models: [{ id: 'y' }] },
    }
    expect(fillReasoningEfforts(providers)).toBeUndefined()
  })

  it('returns undefined when every model is already configured', () => {
    const providers: Record<string, PiAiRoute> = {
      qoder: { api: 'openai-responses', models: [{ id: 'a', reasoningEfforts: false }] },
    }
    expect(fillReasoningEfforts(providers)).toBeUndefined()
  })

  it('preserves other model and route fields', () => {
    const providers: Record<string, PiAiRoute> = {
      zgonline: {
        api: 'anthropic-messages',
        baseURL: 'https://api.example',
        models: [{ id: 'glm-5.3', name: 'GLM', contextWindow: 1000000, maxTokens: 128000 }],
      },
    }
    const result = fillReasoningEfforts(providers)
    const model = result?.providers.zgonline!.models![0]!
    expect(model.name).toBe('GLM')
    expect(model.contextWindow).toBe(1000000)
    expect(result?.providers.zgonline!.baseURL).toBe('https://api.example')
  })
})

describe('reconcilePiAiReasoning', () => {
  function ctxWith(config: unknown, update = vi.fn(async () => undefined)): { ctx: Context; update: typeof update } {
    const ctx = { settings: { get: () => config, update } } as unknown as Context
    return { ctx, update }
  }

  it('writes the augmented providers and returns the change count', async () => {
    const { ctx, update } = ctxWith({
      providers: { qoder: { api: 'openai-responses', models: [{ id: 'deepseek-v4-flash' }] } },
    })
    const changed = await reconcilePiAiReasoning(ctx)
    expect(changed).toBe(1)
    expect(update).toHaveBeenCalledOnce()
    const [, patch] = update.mock.calls[0]!
    expect((patch as { providers: Record<string, PiAiRoute> }).providers.qoder!.models![0]!.reasoningEfforts)
      .toEqual(REASONING_EFFORTS_BY_API['openai-responses'])
  })

  it('no-ops when the namespace is unregistered (bounded, no long poll)', async () => {
    const { ctx, update } = ctxWith(undefined)
    // attempts=1 so the test does not wait through the real retry budget.
    expect(await reconcilePiAiReasoning(ctx, 1, 0)).toBe(0)
    expect(update).not.toHaveBeenCalled()
  })

  it('retries until the namespace appears, then reconciles', async () => {
    let calls = 0
    const config = { providers: { qoder: { api: 'openai-responses', models: [{ id: 'deepseek-v4-flash' }] } } }
    const update = vi.fn(async () => undefined)
    const ctx = {
      settings: {
        get: () => (++calls >= 3 ? config : undefined),
        update,
      },
    } as unknown as Context
    const changed = await reconcilePiAiReasoning(ctx, 5, 0)
    expect(changed).toBe(1)
    expect(update).toHaveBeenCalledOnce()
  })

  it('no-ops when nothing needs a change', async () => {
    const { ctx, update } = ctxWith({
      providers: { qoder: { api: 'openai-responses', models: [{ id: 'a', reasoningEfforts: false }] } },
    })
    expect(await reconcilePiAiReasoning(ctx)).toBe(0)
    expect(update).not.toHaveBeenCalled()
  })
})
