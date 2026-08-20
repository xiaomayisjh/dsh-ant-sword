/** Five-level reasoning policy mapped onto adapter-owned model capabilities. */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { LlmCallConfig, LlmReasoningEffortInfo } from '@deepseek-ai/dsh-llm'
import { DEFAULT_THINKING_FALLBACK } from './runtime-config.ts'
import type { AntSwordRuntimeConfig, ChannelThinkingPolicy, SimulatedEfforts, ThinkingFallbackPolicy, ThinkingLevel } from './runtime-config.ts'

export const THINKING_LEVELS = ['minimum', 'low', 'medium', 'high', 'maximum'] as const satisfies readonly ThinkingLevel[]

export interface ThinkingCapability {
  providerId: string
  modelId: string
  supported: boolean
  efforts: readonly LlmReasoningEffortInfo[]
  defaultEffort?: LlmReasoningEffortInfo['id']
  fallback?: boolean
}

export interface ThinkingPolicySource {
  snapshot(): { applied: AntSwordRuntimeConfig }
}

function policyKey(providerId: string, modelId: string): string {
  return `${providerId}\0${modelId}`
}

export function mapThinkingLevel(
  level: ThinkingLevel,
  efforts: readonly LlmReasoningEffortInfo[],
): LlmReasoningEffortInfo | undefined {
  if (efforts.length === 0) return undefined
  const levelIndex = THINKING_LEVELS.indexOf(level)
  const effortIndex = Math.round(levelIndex * (efforts.length - 1) / (THINKING_LEVELS.length - 1))
  return efforts[effortIndex]
}

export function findThinkingPolicy(
  policies: readonly ChannelThinkingPolicy[],
  providerId: string,
  modelId: string,
): ChannelThinkingPolicy | undefined {
  return policies.find(policy => policy.providerId === providerId && policy.modelId === modelId)
}

export function findThinkingFallback(
  fallbacks: readonly ThinkingFallbackPolicy[],
  providerId: string,
  modelId: string,
): ThinkingFallbackPolicy | undefined {
  // Exact match first
  const exactMatch = fallbacks.find(fb => fb.providerId === providerId && fb.modelId === modelId)
  if (exactMatch !== undefined) return exactMatch

  // Wildcard match: support patterns like "o1-*"
  return fallbacks.find(fb => {
    if (fb.providerId !== providerId) return false
    if (fb.modelId.endsWith('*')) {
      const prefix = fb.modelId.slice(0, -1)
      return modelId.startsWith(prefix)
    }
    return false
  })
}

function syntheticEffortsFromEfforts(efforts: SimulatedEfforts): readonly LlmReasoningEffortInfo[] {
  return [
    { id: efforts.minimum as any, name: 'Minimum', description: 'Fallback minimum effort' },
    { id: efforts.low as any, name: 'Low', description: 'Fallback low effort' },
    { id: efforts.medium as any, name: 'Medium', description: 'Fallback medium effort' },
    { id: efforts.high as any, name: 'High', description: 'Fallback high effort' },
    { id: efforts.maximum as any, name: 'Maximum', description: 'Fallback maximum effort' },
  ]
}

function syntheticEffortsFromFallback(fallback: ThinkingFallbackPolicy): readonly LlmReasoningEffortInfo[] {
  return syntheticEffortsFromEfforts(fallback.simulatedEfforts)
}

export class ThinkingPolicyRuntime {
  private readonly capabilityCache = new Map<string, Promise<ThinkingCapability>>()
  private readonly installedAgents = new WeakSet<object>()

  constructor(
    private readonly ctx: Context,
    private readonly source: ThinkingPolicySource,
  ) {}

  start(): () => void {
    for (const agent of this.ctx.agents.list()) this.install(agent)
    return this.ctx.on('agent/created', ({ agent }) => this.install(agent))
  }

  private install(agent: Agent): void {
    if (this.installedAgents.has(agent)) return
    this.installedAgents.add(agent)
    agent.ctx.effect(() => agent.ctx.on('agent/request', async (payload, next) => {
      const base = await next()
      return this.applyPolicy(base, payload.signal)
    }), 'ant-sword-runtime.thinking-policy')
  }

  clearCapabilities(): void {
    this.capabilityCache.clear()
  }

  /**
   * Resolve a synthetic capability for a model with no native reasoning support:
   * an explicit per-model {@link ThinkingFallbackPolicy} wins, otherwise the
   * config-wide `defaultThinkingFallback` (when not disabled) makes every
   * custom-channel model surface the same five-level thinking UI as the
   * official adapter, with no per-model configuration.
   */
  private resolveFallbackCapability(providerId: string, modelId: string): ThinkingCapability | undefined {
    const applied = this.source.snapshot().applied
    const explicit = findThinkingFallback(applied.thinkingFallbacks, providerId, modelId)
    if (explicit !== undefined) {
      return {
        providerId,
        modelId,
        supported: true,
        efforts: syntheticEffortsFromFallback(explicit),
        fallback: true,
      }
    }
    // `null` explicitly disables the config-wide default; `undefined`
    // (omitted / legacy config) means "use the built-in DeepSeek default".
    const fallbackDefault = applied.defaultThinkingFallback === undefined
      ? DEFAULT_THINKING_FALLBACK
      : applied.defaultThinkingFallback
    if (fallbackDefault !== null) {
      return {
        providerId,
        modelId,
        supported: true,
        efforts: syntheticEffortsFromEfforts(fallbackDefault),
        fallback: true,
      }
    }
    return undefined
  }

  capability(providerId: string, modelId: string, signal?: AbortSignal): Promise<ThinkingCapability> {
    const key = policyKey(providerId, modelId)
    const cached = this.capabilityCache.get(key)
    if (cached !== undefined) return cached

    const pending = this.ctx.llm.resolveModelInfo(providerId, modelId, signal).then(info => {
      // If the adapter reports native reasoning support, use it
      if ((info.reasoning?.efforts.length ?? 0) > 0) {
        return {
          providerId,
          modelId,
          supported: true,
          efforts: info.reasoning?.efforts ?? [],
          ...(info.reasoning?.defaultEffort === undefined ? {} : { defaultEffort: info.reasoning.defaultEffort }),
        }
      }

      // Otherwise, check for a fallback configuration (explicit, then default)
      const fallbackCapability = this.resolveFallbackCapability(providerId, modelId)
      if (fallbackCapability !== undefined) return fallbackCapability

      // No native support and no fallback
      return {
        providerId,
        modelId,
        supported: false,
        efforts: [],
      }
    }).catch(error => {
      // If adapter query fails, still try fallback (explicit, then default)
      const fallbackCapability = this.resolveFallbackCapability(providerId, modelId)
      if (fallbackCapability !== undefined) return fallbackCapability

      // Both native and fallback failed
      this.capabilityCache.delete(key)
      throw error
    })

    this.capabilityCache.set(key, pending)
    return pending
  }

  async applyPolicy(base: LlmCallConfig, signal?: AbortSignal): Promise<LlmCallConfig> {
    const policy = findThinkingPolicy(
      this.source.snapshot().applied.thinkingPolicies,
      base.provider,
      base.model,
    )
    if (policy === undefined) return base
    const capability = await this.capability(base.provider, base.model, signal)
    const effort = mapThinkingLevel(policy.level, capability.efforts)
    return effort === undefined ? base : { ...base, reasoningEffort: effort.id }
  }
}