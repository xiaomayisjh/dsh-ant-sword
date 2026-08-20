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