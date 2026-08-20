/**
 * Format-aware reasoning bootstrap for custom pi-ai channels.
 *
 * The composer's native thinking-intensity selector is driven by the host
 * model catalog, which asks each adapter to resolve reasoning capability. The
 * pi-ai adapter reports a hand-declared route model as reasoning-capable ONLY
 * when its route config carries `reasoningEfforts`; without it the model is
 * `reasoning: false`, so no selector shows and — critically — pi-ai's own
 * dispatch rejects any chosen effort with UNSUPPORTED_REASONING_EFFORT.
 *
 * Each pi-ai wire protocol expresses thinking differently, so a single effort
 * vocabulary cannot fit them all:
 *   - openai-responses  → `reasoning.effort` ∈ {minimal, low, medium, high}
 *   - anthropic-messages → adaptive `output_config.effort` / budget thinking,
 *                          driven by {low, medium, high}
 *   - openai-completions → `reasoning_effort`, {low, medium, high}
 * pi-ai translates a harness thinking level to the wire shape from the route's
 * `api` plus the model's `thinkingLevelMap` (derived from `reasoningEfforts`).
 * This reconciler fills a format-correct `reasoningEfforts` into every model
 * that lacks one, so pi-ai reports reasoning natively and dispatches it in the
 * right wire format. Models that already declare `reasoningEfforts` (or set it
 * to `false`) are left untouched — the user's explicit choice always wins.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/pi-ai-reasoning
 */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

/** The pi-ai plugin's settings namespace. */
export const PI_AI_SETTINGS_NAMESPACE = 'llm-pi-ai'

/** A `reasoningEfforts` map: harness thinking level → wire spelling, or null. */
export type ReasoningEffortsMap = Record<string, string | null>

/**
 * Format-correct default `reasoningEfforts` per pi-ai wire protocol. `off:
 * null` declares the level as "supported, send nothing" (pi-ai keeps it out of
 * the wire map), the rest carry the exact spelling each protocol accepts.
 * Only levels a protocol actually honors are listed, so pi-ai never offers a
 * button whose value the endpoint would reject.
 */
export const REASONING_EFFORTS_BY_API: Record<string, ReasoningEffortsMap> = {
  // OpenAI Responses: minimal/low/medium/high — the effort enum the API defines
  // (no xhigh/max; those are not Responses values).
  'openai-responses': { off: null, minimal: 'minimal', low: 'low', medium: 'medium', high: 'high' },
  // Anthropic Messages (adaptive thinking): the full effort ladder. `max` is
  // accepted by every adaptive-thinking Claude model; `xhigh` by the newest.
  // Custom Anthropic-compatible relays (GLM/Kimi/etc.) expose the same ladder,
  // so offer it and let dispatch send the chosen effort verbatim. Requires
  // forceAdaptiveThinking (installPiAiAdaptiveThinking) so these are real
  // effort levels, not budget-clamped down to `high`.
  'anthropic-messages': { off: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  // OpenAI Chat Completions reasoning models: low/medium/high.
  'openai-completions': { off: null, low: 'low', medium: 'medium', high: 'high' },
}

/** pi-ai wire protocols that use Anthropic adaptive thinking (effort, not budget). */
export const ADAPTIVE_THINKING_APIS: ReadonlySet<string> = new Set(['anthropic-messages'])

/**
 * Effort maps this reconciler wrote in earlier versions, keyed by api. A model
 * carrying exactly one of these is a prior *default* (not a user edit), so the
 * reconciler may upgrade it to the current {@link REASONING_EFFORTS_BY_API}
 * value. A map that differs from every entry here is treated as a deliberate
 * user customization and left untouched.
 */
export const SUPERSEDED_DEFAULTS_BY_API: Record<string, readonly ReasoningEffortsMap[]> = {
  // rc.21 anthropic-messages default (before the adaptive xhigh/max ladder).
  'anthropic-messages': [{ off: null, low: 'low', medium: 'medium', high: 'high' }],
}

/** Deep-equal two reasoning-effort maps by their key/value pairs. */
function effortsEqual(a: ReasoningEffortsMap, b: ReasoningEffortsMap): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every(key => key in b && a[key] === b[key])
}

/**
 * Whether `current` is a default this reconciler wrote in an earlier version
 * for `api` — safe to upgrade — as opposed to a user's own map.
 */
function isSupersededDefault(api: string, current: ReasoningEffortsMap): boolean {
  return (SUPERSEDED_DEFAULTS_BY_API[api] ?? []).some(old => effortsEqual(old, current))
}

/** One model entry inside a pi-ai route's `models` list (partial shape). */
export interface PiAiModelEntry {
  id: string
  reasoningEfforts?: ReasoningEffortsMap | false
  [key: string]: unknown
}

/** One pi-ai provider route (partial shape). */
export interface PiAiRoute {
  api?: string
  models?: PiAiModelEntry[]
  [key: string]: unknown
}

/** The `llm-pi-ai` namespace value (partial shape). */
export interface PiAiConfig {
  providers?: Record<string, PiAiRoute>
}

/**
 * Compute the next `providers` map with a format-correct `reasoningEfforts`
 * filled into every model that has none. Pure: returns the augmented map plus
 * the count of models changed, or `undefined` when nothing needed a change (so
 * the caller can skip the settings write entirely).
 * @param providers - the current pi-ai `providers` map.
 * @returns the next providers map and change count, or undefined when unchanged.
 */
export function fillReasoningEfforts(
  providers: Record<string, PiAiRoute>,
): { providers: Record<string, PiAiRoute>; changed: number } | undefined {
  let changed = 0
  const next: Record<string, PiAiRoute> = {}
  for (const [routeId, route] of Object.entries(providers)) {
    const efforts = route.api === undefined ? undefined : REASONING_EFFORTS_BY_API[route.api]
    const models = route.models
    if (efforts === undefined || models === undefined || models.length === 0) {
      next[routeId] = route
      continue
    }
    const nextModels = models.map(model => {
      const declared = model.reasoningEfforts
      // No declaration yet → fill the current format-correct default.
      if (declared === undefined) {
        changed += 1
        return { ...model, reasoningEfforts: { ...efforts } }
      }
      // `false` (opt-out) or a genuine user map is left untouched — the user's
      // decision always wins. The one exception: a map this reconciler itself
      // wrote in an earlier version is a stale default, safe to upgrade.
      if (declared !== false && isSupersededDefault(route.api!, declared) && !effortsEqual(declared, efforts)) {
        changed += 1
        return { ...model, reasoningEfforts: { ...efforts } }
      }
      return model
    })
    next[routeId] = { ...route, models: nextModels }
  }
  return changed === 0 ? undefined : { providers: next, changed }
}

/**
 * Fill format-correct `reasoningEfforts` into every unconfigured pi-ai model
 * once, so custom channels expose (and correctly dispatch) the native
 * thinking-intensity selector. Reads and writes the `llm-pi-ai` namespace
 * through the shared settings service; an empty catalog or an already-complete
 * config is a silent no-op.
 *
 * pi-ai registers its namespace inside a deferred `ctx.inject(['settings'])`
 * callback, so at the moment this bundle's `apply()` runs the namespace may not
 * exist yet (`get` returns `undefined`). `attempts`/`delayMs` poll briefly for
 * it to appear before giving up, which turns the load-order race into a bounded
 * wait rather than a silent miss.
 * @param ctx - plugin context carrying the settings service.
 * @param attempts - how many times to look for the namespace (>=1).
 * @param delayMs - delay between attempts in milliseconds.
 * @returns the number of models updated (0 when nothing changed).
 */
export async function reconcilePiAiReasoning(ctx: Context, attempts = 20, delayMs = 250): Promise<number> {
  const ns = settingsNamespace(PI_AI_SETTINGS_NAMESPACE)
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    const current = ctx.settings.get(ns) as PiAiConfig | undefined
    const providers = current?.providers
    if (providers !== undefined && Object.keys(providers).length > 0) {
      const result = fillReasoningEfforts(providers)
      if (result === undefined) return 0
      await ctx.settings.update(ns, { providers: result.providers })
      return result.changed
    }
    if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, delayMs))
  }
  return 0
}

/** Minimal shape of the pi-ai model descriptor `modelOf` returns. */
interface PiAiResolvedModel {
  api?: string
  reasoning?: boolean
  compat?: Record<string, unknown>
  [key: string]: unknown
}

/** The pi-ai adapter instance exposes a synchronous `modelOf(snapshot, provider, model)`. */
interface PiAiAdapterLike {
  modelOf?: (snapshot: unknown, provider: string, model: string) => PiAiResolvedModel
}

/** The registration object the llm runtime passes to `resolveModelInfoFor`. */
interface AdapterRegistrationLike {
  provider: { id: string }
  adapter: PiAiAdapterLike
}

/**
 * Force Anthropic **adaptive** thinking on custom pi-ai channels that speak an
 * adaptive protocol, so a chosen effort dispatches as the real
 * `output_config.effort` (e.g. `max`) instead of pi-ai's budget-mode path,
 * which clamps `xhigh`/`max` down to `high`.
 *
 * `forceAdaptiveThinking` lives on the pi-ai model descriptor's `compat`, which
 * the `llm-pi-ai` settings schema does not expose — so it cannot be set through
 * configuration. Instead we wrap `ctx.llm.resolveModelInfoFor` to reach the
 * adapter registration, then patch that adapter's own `modelOf` once so every
 * resolved model on an adaptive route (both the catalog/selector path and the
 * dispatch path go through `modelOf`) carries
 * `compat.forceAdaptiveThinking = true`. The descriptor is cloned, never
 * mutated in pi-ai's snapshot cache. A model with no reasoning is left as-is.
 *
 * @param ctx - plugin context carrying the llm runtime.
 * @param adaptiveApis - the set of pi-ai `api`s that use adaptive thinking.
 * @returns a disposer that restores the original methods.
 */
export function installPiAiAdaptiveThinking(ctx: Context, adaptiveApis: ReadonlySet<string> = ADAPTIVE_THINKING_APIS): () => void {
  const llm = ctx.llm as unknown as {
    resolveModelInfoFor?: (registration: AdapterRegistrationLike, model: string, signal?: AbortSignal) => Promise<unknown>
  }
  const original = llm.resolveModelInfoFor
  if (typeof original !== 'function') return () => undefined

  const patchedAdapters = new WeakSet<object>()
  const restores: Array<() => void> = []

  function patchAdapter(adapter: PiAiAdapterLike): void {
    if (typeof adapter.modelOf !== 'function' || patchedAdapters.has(adapter)) return
    patchedAdapters.add(adapter)
    const originalModelOf = adapter.modelOf.bind(adapter)
    const patchedModelOf = (snapshot: unknown, provider: string, model: string): PiAiResolvedModel => {
      const resolved = originalModelOf(snapshot, provider, model)
      if (resolved.api === undefined || !adaptiveApis.has(resolved.api)) return resolved
      if (resolved.reasoning !== true) return resolved
      if (resolved.compat?.forceAdaptiveThinking === true) return resolved
      // Clone (never mutate pi-ai's cached descriptor) and force adaptive effort.
      return { ...resolved, compat: { ...resolved.compat, forceAdaptiveThinking: true } }
    }
    Object.defineProperty(adapter, 'modelOf', { value: patchedModelOf, writable: true, configurable: true })
    restores.push(() => {
      const current = (adapter as { modelOf?: unknown }).modelOf
      if (current === patchedModelOf) {
        Object.defineProperty(adapter, 'modelOf', { value: originalModelOf, writable: true, configurable: true })
      }
    })
  }

  const wrapped = async function (this: unknown, registration: AdapterRegistrationLike, model: string, signal?: AbortSignal): Promise<unknown> {
    if (registration?.adapter !== undefined) patchAdapter(registration.adapter)
    return original.call(this, registration, model, signal)
  }
  Object.defineProperty(llm, 'resolveModelInfoFor', { value: wrapped, writable: true, configurable: true })

  return () => {
    if ((llm as { resolveModelInfoFor?: unknown }).resolveModelInfoFor === wrapped) {
      Object.defineProperty(llm, 'resolveModelInfoFor', { value: original, writable: true, configurable: true })
    }
    for (const restore of restores) restore()
  }
}
