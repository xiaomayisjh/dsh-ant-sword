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
  // OpenAI Responses: minimal/low/medium/high (no max, no off wire value).
  'openai-responses': { off: null, minimal: 'minimal', low: 'low', medium: 'medium', high: 'high' },
  // Anthropic Messages: adaptive effort / budget thinking keyed by low/medium/high.
  'anthropic-messages': { off: null, low: 'low', medium: 'medium', high: 'high' },
  // OpenAI Chat Completions reasoning models: low/medium/high.
  'openai-completions': { off: null, low: 'low', medium: 'medium', high: 'high' },
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
      // A model that already declares reasoningEfforts (a map, or `false` to
      // opt out) keeps its own choice — the user's decision always wins.
      if (model.reasoningEfforts !== undefined) return model
      changed += 1
      return { ...model, reasoningEfforts: { ...efforts } }
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
