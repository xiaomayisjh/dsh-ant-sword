/**
 * Provider-neutral presentation budgets for the autonomous preset. The DSH
 * request header is the route that actually produced the current tool call;
 * adapter metadata and usage only tune how much board context to show. This
 * service never changes the selected model, effort, or call configuration.
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { LlmResolvedModelInfo, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'

export type ContextTier = 'compact' | 'standard' | 'wide'
export type ReasoningMode = 'guided' | 'balanced' | 'deep'

/** Deliberately contains no provider or model identity for model-facing use. */
export interface ModelAdaptationProfile {
  contextTier: ContextTier
  reasoningMode: ReasoningMode
  boardChars: number
  evidenceChars: number
  lessonCount: number
  contextWindow?: number
  /** Exact selected adapter effort; informational only, never rewritten. */
  effort?: string
}

interface Route {
  provider: string
  model: string
  effort?: string
}

interface ObservedInput {
  provider: string
  model: string
  tokens: number
}

const BUDGETS: Record<ContextTier, Pick<ModelAdaptationProfile, 'boardChars' | 'evidenceChars' | 'lessonCount'>> = {
  compact: { boardChars: 2_000, evidenceChars: 500, lessonCount: 2 },
  standard: { boardChars: 5_000, evidenceChars: 1_000, lessonCount: 4 },
  wide: { boardChars: 10_000, evidenceChars: 2_000, lessonCount: 6 },
}

function validWindow(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function tierFor(window: number | undefined): ContextTier {
  if (window === undefined || window <= 32_768) return 'compact'
  if (window <= 131_072) return 'standard'
  return 'wide'
}

function effortMode(effort: string | undefined, info: LlmResolvedModelInfo | undefined): ReasoningMode {
  if (effort === undefined) return 'balanced'
  const named = info?.reasoning?.efforts.find(item => item.id === effort)?.name
  const words = `${effort} ${named ?? ''}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  if (words.some(word => /^(high|xhigh|ultra|max|deep|extended|intense|heavy)$/.test(word))) return 'deep'
  if (words.some(word => /^(minimal|none|off|low|light|fast)$/.test(word))) return 'guided'
  return 'balanced'
}

function routeFor(agent: Agent): Route | undefined {
  const header = agent.session.requestHeader()
  const config = header?.config ?? agent.options
  if (!config.provider || !config.model) return undefined
  const effort = config.reasoningEffort
  return {
    provider: config.provider,
    model: config.model,
    ...(effort === undefined ? {} : { effort: String(effort) }),
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    modelAdaptation: ModelAdaptationService
  }
}

/** Read-only adaptation over DSH's selected route and observed input size. */
export class ModelAdaptationService extends Service {
  static inject = ['llm']

  private readonly metadata = new Map<string, Promise<LlmResolvedModelInfo | undefined>>()
  private readonly observedInput = new WeakMap<Session, ObservedInput>()
  private generation = 0

  constructor(ctx: Context) {
    super(ctx, 'modelAdaptation')

    ctx.on('llm/adapters-updated', () => {
      this.generation++
      this.metadata.clear()
    })

    ctx.on('session/event', (session, event) => {
      if (event.type !== 'assistant/message' || event.data.usage === undefined) return
      const header = session.requestHeader()?.config
      if (header === undefined) return
      const usage = event.data.usage
      // DSH cache counters are disjoint from inputTokens. Only valid positive
      // reports can reduce a presentation budget; malformed telemetry is ignored.
      const parts = [usage.inputTokens, usage.cacheReadTokens ?? 0, usage.cacheWriteTokens ?? 0]
      if (!parts.every(value => Number.isSafeInteger(value) && value >= 0)) return
      const tokens = parts.reduce((sum, value) => sum + value, 0)
      if (Number.isSafeInteger(tokens) && tokens > 0) {
        this.observedInput.set(session, { provider: header.provider, model: header.model, tokens })
      }
    })
  }

  private resolve(route: Route): Promise<LlmResolvedModelInfo | undefined> {
    const key = JSON.stringify([route.provider, route.model])
    const cached = this.metadata.get(key)
    if (cached !== undefined) return cached

    // A failed lookup is not cached: a temporarily unavailable adapter can
    // recover on the next call without a registry topology event.
    let pending: Promise<LlmResolvedModelInfo | undefined>
    pending = Promise.resolve()
      .then(() => this.ctx.llm.resolveModelInfo(route.provider, route.model))
      .catch(() => undefined)
      .then(info => {
        if (info === undefined && this.metadata.get(key) === pending) this.metadata.delete(key)
        return info
      })
    this.metadata.set(key, pending)
    return pending
  }

  async profile(agent: Agent): Promise<ModelAdaptationProfile> {
    const route = routeFor(agent)
    if (route === undefined) return { contextTier: 'compact', reasoningMode: 'balanced', ...BUDGETS.compact }

    const requestContext = agent.session.requestContext()
    const recordedWindow = requestContext?.provider === route.provider && requestContext.model === route.model
      && validWindow(requestContext.contextWindow) ? requestContext.contextWindow : undefined
    return this.profileFor(route, recordedWindow, this.observedInput.get(agent.session))
  }

  /** Resolve the route captured by prompt assembly before a header exists. */
  async forRoute(
    provider: string,
    model: string,
    effort?: ReasoningEffortId,
    contextWindowHint?: number,
  ): Promise<ModelAdaptationProfile> {
    if (!provider || !model) return { contextTier: 'compact', reasoningMode: 'balanced', ...BUDGETS.compact }
    return this.profileFor({
      provider, model,
      ...(effort === undefined ? {} : { effort: String(effort) }),
    }, validWindow(contextWindowHint) ? contextWindowHint : undefined)
  }

  private async profileFor(
    route: Route,
    contextWindowHint?: number,
    observed?: ObservedInput,
  ): Promise<ModelAdaptationProfile> {

    const generation = this.generation
    let info = await this.resolve(route)
    if (this.generation !== generation) info = await this.resolve(route)

    const liveWindow = info?.context?.contextWindow
    const contextWindow = validWindow(liveWindow) ? liveWindow : contextWindowHint
    const effort = route.effort ?? (info?.reasoning?.defaultEffort === undefined
      ? undefined : String(info.reasoning.defaultEffort))

    let contextTier = tierFor(contextWindow)
    if (contextWindow !== undefined && observed?.provider === route.provider && observed.model === route.model) {
      const pressure = observed.tokens / contextWindow
      if (pressure >= 0.9) contextTier = 'compact'
      else if (pressure >= 0.75 && contextTier === 'wide') contextTier = 'standard'
      else if (pressure >= 0.75 && contextTier === 'standard') contextTier = 'compact'
    }

    return {
      contextTier,
      reasoningMode: effortMode(effort, info),
      ...BUDGETS[contextTier],
      ...(contextWindow === undefined ? {} : { contextWindow }),
      ...(effort === undefined ? {} : { effort }),
    }
  }
}

/** Mount the optional model-profile service under the Host plugin fiber. */
export function applyModelAdaptation(ctx: Context): void {
  ctx.plugin(ModelAdaptationService)
}
