/** Five-level reasoning policy mapped onto adapter-owned model capabilities. */
import type { Context } from '@deepseek-ai/cordis';
import type { LlmCallConfig, LlmReasoningEffortInfo } from '@deepseek-ai/dsh-llm';
import type { AntSwordRuntimeConfig, ChannelThinkingPolicy, ThinkingLevel } from './runtime-config.ts';
export declare const THINKING_LEVELS: readonly ["minimum", "low", "medium", "high", "maximum"];
export interface ThinkingCapability {
    providerId: string;
    modelId: string;
    supported: boolean;
    efforts: readonly LlmReasoningEffortInfo[];
    defaultEffort?: LlmReasoningEffortInfo['id'];
}
export interface ThinkingPolicySource {
    snapshot(): {
        applied: AntSwordRuntimeConfig;
    };
}
export declare function mapThinkingLevel(level: ThinkingLevel, efforts: readonly LlmReasoningEffortInfo[]): LlmReasoningEffortInfo | undefined;
export declare function findThinkingPolicy(policies: readonly ChannelThinkingPolicy[], providerId: string, modelId: string): ChannelThinkingPolicy | undefined;
export declare class ThinkingPolicyRuntime {
    private readonly ctx;
    private readonly source;
    private readonly capabilityCache;
    private readonly installedAgents;
    constructor(ctx: Context, source: ThinkingPolicySource);
    start(): () => void;
    private install;
    clearCapabilities(): void;
    capability(providerId: string, modelId: string, signal?: AbortSignal): Promise<ThinkingCapability>;
    applyPolicy(base: LlmCallConfig, signal?: AbortSignal): Promise<LlmCallConfig>;
}
//# sourceMappingURL=thinking-policy.d.ts.map