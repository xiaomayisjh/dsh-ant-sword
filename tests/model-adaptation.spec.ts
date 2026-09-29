import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LlmRuntime, {
  LlmAdapter, ReasoningEffortId,
} from '@deepseek-ai/dsh-llm'
import type { LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { EpochHeader, RequestContext, Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { ModelAdaptationService } from '../src/auto/model-adaptation.ts'

type ModelFacts = {
  window?: number
  efforts?: readonly { id: string; name: string }[]
  defaultEffort?: string
}

class Adapter extends LlmAdapter {
  facts = new Map<string, ModelFacts>()
  calls: string[] = []
  fail = false

  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    this.calls.push(`${provider}/${model}`)
    if (this.fail) throw new Error('temporary metadata failure')
    const facts = this.facts.get(`${provider}/${model}`) ?? {}
    return {
      provider,
      id: model,
      name: model,
      ...(facts.window === undefined ? {} : { context: { contextWindow: facts.window } }),
      ...(facts.efforts === undefined ? {} : {
        reasoning: {
          efforts: facts.efforts.map(item => ({ id: ReasoningEffortId(item.id), name: item.name })),
          ...(facts.defaultEffort === undefined ? {} : { defaultEffort: ReasoningEffortId(facts.defaultEffort) }),
        },
      }),
    }
  }

  override async *stream(): AsyncIterable<StreamChunk> {
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

function fakeAgent(
  provider?: string,
  model?: string,
  effort?: string,
  context?: RequestContext,
): {
  agent: Agent
  setHeader: (provider: string, model: string, effort?: string) => void
  setContext: (value: RequestContext | undefined) => void
  session: Session
  header: () => EpochHeader | undefined
} {
  let currentHeader: EpochHeader | undefined = provider && model ? {
    config: { provider, model, ...(effort === undefined ? {} : { reasoningEffort: ReasoningEffortId(effort) }) },
  } : undefined
  let currentContext = context
  const session = {
    requestHeader: () => currentHeader,
    requestContext: () => currentContext,
  } as Session
  return {
    agent: { session, options: {} } as Agent,
    setHeader: (nextProvider, nextModel, nextEffort) => {
      currentHeader = {
        config: {
          provider: nextProvider,
          model: nextModel,
          ...(nextEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(nextEffort) }),
        },
      }
    },
    setContext: value => { currentContext = value },
    session,
    header: () => currentHeader,
  }
}

async function harness() {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(ModelAdaptationService)
  const adapter = new Adapter()
  const registration = ctx.llm.registerAdapter(['route-a', 'route-b'], adapter)
  return { ctx, adapter, registration, service: ctx.modelAdaptation }
}

describe('model adaptation', () => {
  it('uses exact-route model capacity and conservative compact fallback', async () => {
    const { adapter, service } = await harness()
    adapter.facts.set('route-a/small', { window: 16_384 })
    adapter.facts.set('route-a/medium', { window: 65_536 })
    adapter.facts.set('route-b/large', { window: 200_000 })

    const small = await service.profile(fakeAgent('route-a', 'small').agent)
    expect(small).toMatchObject({ contextTier: 'compact', contextWindow: 16_384, boardChars: 2_000, evidenceChars: 500, lessonCount: 2 })
    const medium = await service.profile(fakeAgent('route-a', 'medium').agent)
    expect(medium).toMatchObject({ contextTier: 'standard', contextWindow: 65_536, boardChars: 5_000, evidenceChars: 1_000, lessonCount: 4 })
    const large = await service.profile(fakeAgent('route-b', 'large').agent)
    expect(large).toMatchObject({ contextTier: 'wide', contextWindow: 200_000, boardChars: 10_000, evidenceChars: 2_000, lessonCount: 6 })
    const unknown = await service.profile(fakeAgent('route-a', 'undisclosed').agent)
    expect(unknown).toMatchObject({ contextTier: 'compact', boardChars: 2_000 })
    expect(unknown).not.toHaveProperty('contextWindow')
    expect(JSON.stringify(large)).not.toMatch(/route-b|large/)
  })

  it('maps only recognized selected effort ids or names and keeps the request unchanged', async () => {
    const { adapter, service } = await harness()
    adapter.facts.set('route-a/reasoning', {
      window: 65_536,
      efforts: [
        { id: 'opaque-a', name: 'Low' },
        { id: 'opaque-b', name: 'High' },
        { id: 'opaque-c', name: 'Proprietary' },
      ],
    })
    const selected = fakeAgent('route-a', 'reasoning', 'opaque-a')
    const before = structuredClone(selected.header())
    expect(await service.profile(selected.agent)).toMatchObject({ reasoningMode: 'guided', effort: 'opaque-a' })
    selected.setHeader('route-a', 'reasoning', 'opaque-b')
    expect(await service.profile(selected.agent)).toMatchObject({ reasoningMode: 'deep', effort: 'opaque-b' })
    selected.setHeader('route-a', 'reasoning', 'opaque-c')
    expect(await service.profile(selected.agent)).toMatchObject({ reasoningMode: 'balanced', effort: 'opaque-c' })
    expect(before?.config.reasoningEffort).toBe(ReasoningEffortId('opaque-a'))
    expect(selected.header()?.config.reasoningEffort).toBe(ReasoningEffortId('opaque-c'))
    expect(adapter.calls).toEqual(['route-a/reasoning'])
  })

  it('handles model switches, route-matched context hints, and adapter updates', async () => {
    const { adapter, registration, service } = await harness()
    adapter.facts.set('route-a/first', { window: 16_384 })
    adapter.facts.set('route-b/second', { window: 200_000 })
    const state = fakeAgent('route-a', 'first', undefined, {
      provider: 'route-b', model: 'second', contextWindow: 200_000,
    })
    expect((await service.profile(state.agent)).contextTier).toBe('compact')
    state.setHeader('route-b', 'second')
    expect((await service.profile(state.agent)).contextTier).toBe('wide')
    adapter.facts.set('route-b/second', { window: 40_000 })
    expect((await service.profile(state.agent)).contextTier).toBe('wide')
    registration.replace(['route-a', 'route-b'])
    expect((await service.profile(state.agent)).contextTier).toBe('standard')
    expect(adapter.calls).toEqual(['route-a/first', 'route-b/second', 'route-b/second'])
  })

  it('uses matching persisted request context when metadata lookup fails and retries later', async () => {
    const { adapter, service } = await harness()
    adapter.fail = true
    const state = fakeAgent('route-a', 'intermittent', undefined, {
      provider: 'route-a', model: 'intermittent', contextWindow: 65_536,
    })
    expect(await service.profile(state.agent)).toMatchObject({ contextTier: 'standard', contextWindow: 65_536 })
    state.setContext({ provider: 'route-b', model: 'different', contextWindow: 200_000 })
    expect(await service.profile(state.agent)).toMatchObject({ contextTier: 'compact' })
    adapter.fail = false
    adapter.facts.set('route-a/intermittent', { window: 200_000 })
    expect(await service.profile(state.agent)).toMatchObject({ contextTier: 'wide', contextWindow: 200_000 })
    expect(adapter.calls).toHaveLength(3)
  })

  it('profiles an assembly route before a request header exists', async () => {
    const { adapter, service } = await harness()
    adapter.facts.set('route-a/new', {
      efforts: [{ id: 'custom', name: 'High' }],
    })
    expect(await service.forRoute('route-a', 'new', ReasoningEffortId('custom'), 65_536))
      .toMatchObject({ contextTier: 'standard', reasoningMode: 'deep', effort: 'custom' })
    expect(await service.forRoute('route-a', 'new', undefined, 0))
      .toMatchObject({ contextTier: 'compact', reasoningMode: 'balanced' })
    expect(adapter.calls).toEqual(['route-a/new'])
  })

  it('reduces context budgets as observed input approaches the route window', async () => {
    const { adapter, ctx, service } = await harness()
    adapter.facts.set('route-a/big', { window: 200_000 })
    adapter.facts.set('route-b/other', { window: 200_000 })
    const state = fakeAgent('route-a', 'big')
    expect((await service.profile(state.agent)).contextTier).toBe('wide')

    const report = (inputTokens: number) => {
      ctx.emit('session/event', state.session, {
        type: 'assistant/message', data: {
          usage: { inputTokens, outputTokens: 100 },
        },
      } as SessionEvent)
    }
    report(160_000)
    expect((await service.profile(state.agent)).contextTier).toBe('standard')
    report(185_000)
    expect((await service.profile(state.agent)).contextTier).toBe('compact')
    state.setHeader('route-b', 'other')
    expect((await service.profile(state.agent)).contextTier).toBe('wide')
  })
})
