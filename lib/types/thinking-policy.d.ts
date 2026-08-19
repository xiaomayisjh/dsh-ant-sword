/** Five-level reasoning policy mapped onto adapter-owned model capabilities. */
import type { Context } from '@deepseek-ai/cordis';
import type { LlmCallConfig, LlmReasoningEffortInfo } from '@deepseek-ai/dsh-llm';
import type { AntSwordRuntimeConfig, ChannelThinkingPolicy, ThinkingFallbackPolicy, ThinkingLevel } from './runtime-config.ts';
export declare const THINKING_LEVELS: readonly ["minimum", "low", "medium", "high", "maximum"];
export interface ThinkingCapability {
    providerId: string;
    modelId: string;
    supported: boolean;
    efforts: readonly LlmReasoningEffortInfo[];
    defaultEffort?: LlmReasoningEffortInfo['id'];
    fallback?: boolean;
}
export interface ThinkingPolicySource {
    snapshot(): {
        applied: AntSwordRuntimeConfig;
    };
}
export declare function mapThinkingLevel(level: ThinkingLevel, efforts: readonly LlmReasoningEffortInfo[]): LlmReasoningEffortInfo | undefined;
export declare function findThinkingPolicy(policies: readonly ChannelThinkingPolicy[], providerId: string, modelId: string): ChannelThinkingPolicy | undefined;
export declare function findThinkingFallback(fallbacks: readonly ThinkingFallbackPolicy[], providerId: string, modelId: string): ThinkingFallbackPolicy | undefined;
export declare class ThinkingPolicyRuntime {
    private readonly ctx;
    private readonly source;
    private readonly capabilityCache;
    private readonly installedAgents;
    constructor(ctx: Context, source: ThinkingPolicySource);
    start(): () => void;
    /**
     * Make custom-channel models surface the SAME native reasoning-effort selector
     * the official adapter shows in the composer. The host builds its model
     * catalog (and validates a chosen effort, and materializes it on dispatch) by
     * calling `ctx.llm.resolveModelInfoFor(registration, model)`; a model whose
     * adapter returns no `reasoning` gets no selector and rejects any effort. We
     * wrap that one internal method so a model with no native reasoning is
     * augmented with synthetic reasoning derived from the same fallback config
     * used by {@link resolveFallbackCapability} — one patch that the selector,
     * the effort validation, and the request dispatch all read consistently.
     */
    private installModelInfoInjection;
    /**
     * Synthetic native-reasoning metadata for a model with no adapter reasoning:
     * an explicit per-model fallback wins, else the config-wide default
     * (`undefined` => built-in DeepSeek default; `null` => disabled → no
     * injection). The efforts are the distinct ids the level map targets, so the
     * selector matches the official three-button layout.
     */
    private syntheticReasoningFor;
    private install;
    clearCapabilities(): void;
    /**
     * Resolve a synthetic capability for a model with no native reasoning support:
     * an explicit per-model {@link ThinkingFallbackPolicy} wins, otherwise the
     * config-wide `defaultThinkingFallback` (when not disabled) makes every
     * custom-channel model surface the same five-level thinking UI as the
     * official adapter, with no per-model configuration.
     */
    private resolveFallbackCapability;
    capability(providerId: string, modelId: string, signal?: AbortSignal): Promise<ThinkingCapability>;
    applyPolicy(base: LlmCallConfig, signal?: AbortSignal): Promise<LlmCallConfig>;
}
//# sourceMappingURL=thinking-policy.d.ts.map