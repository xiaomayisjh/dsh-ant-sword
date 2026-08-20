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
import type { Context } from '@deepseek-ai/cordis';
/** The pi-ai plugin's settings namespace. */
export declare const PI_AI_SETTINGS_NAMESPACE = "llm-pi-ai";
/** A `reasoningEfforts` map: harness thinking level → wire spelling, or null. */
export type ReasoningEffortsMap = Record<string, string | null>;
/**
 * Format-correct default `reasoningEfforts` per pi-ai wire protocol. `off:
 * null` declares the level as "supported, send nothing" (pi-ai keeps it out of
 * the wire map), the rest carry the exact spelling each protocol accepts.
 * Only levels a protocol actually honors are listed, so pi-ai never offers a
 * button whose value the endpoint would reject.
 */
export declare const REASONING_EFFORTS_BY_API: Record<string, ReasoningEffortsMap>;
/** pi-ai wire protocols that use Anthropic adaptive thinking (effort, not budget). */
export declare const ADAPTIVE_THINKING_APIS: ReadonlySet<string>;
/**
 * Effort maps this reconciler wrote in earlier versions, keyed by api. A model
 * carrying exactly one of these is a prior *default* (not a user edit), so the
 * reconciler may upgrade it to the current {@link REASONING_EFFORTS_BY_API}
 * value. A map that differs from every entry here is treated as a deliberate
 * user customization and left untouched.
 */
export declare const SUPERSEDED_DEFAULTS_BY_API: Record<string, readonly ReasoningEffortsMap[]>;
/** One model entry inside a pi-ai route's `models` list (partial shape). */
export interface PiAiModelEntry {
    id: string;
    reasoningEfforts?: ReasoningEffortsMap | false;
    [key: string]: unknown;
}
/** One pi-ai provider route (partial shape). */
export interface PiAiRoute {
    api?: string;
    models?: PiAiModelEntry[];
    [key: string]: unknown;
}
/** The `llm-pi-ai` namespace value (partial shape). */
export interface PiAiConfig {
    providers?: Record<string, PiAiRoute>;
}
/**
 * Compute the next `providers` map with a format-correct `reasoningEfforts`
 * filled into every model that has none. Pure: returns the augmented map plus
 * the count of models changed, or `undefined` when nothing needed a change (so
 * the caller can skip the settings write entirely).
 * @param providers - the current pi-ai `providers` map.
 * @returns the next providers map and change count, or undefined when unchanged.
 */
export declare function fillReasoningEfforts(providers: Record<string, PiAiRoute>): {
    providers: Record<string, PiAiRoute>;
    changed: number;
} | undefined;
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
export declare function reconcilePiAiReasoning(ctx: Context, attempts?: number, delayMs?: number): Promise<number>;
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
export declare function installPiAiAdaptiveThinking(ctx: Context, adaptiveApis?: ReadonlySet<string>): () => void;
//# sourceMappingURL=pi-ai-reasoning.d.ts.map