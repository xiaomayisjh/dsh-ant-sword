/**
 * Persisted runtime configuration and transactional hot-apply coordination.
 * The controller deliberately knows nothing about MCP fibers, skill storage,
 * or prompt sections; those concerns implement reconcilers behind one shared
 * commit boundary.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/runtime-config
 */
import z from '@deepseek-ai/schemastery';
import type { SettingsScope } from '@deepseek-ai/dsh-settings';
import type { McpServerConfig } from './mcp-servers.ts';
export declare const ANT_SWORD_SETTINGS_NAMESPACE = "ant-sword-runtime";
export declare const SERVER_NAME_PATTERN: RegExp;
export declare const SKILL_NAME_PATTERN: RegExp;
export declare const RULE_ID_PATTERN: RegExp;
export declare const MAX_RULE_TITLE_BYTES = 256;
export declare const MAX_RULE_CONTENT_BYTES: number;
export declare const MAX_PROVIDER_ID_BYTES = 128;
export declare const MAX_MODEL_ID_BYTES = 256;
export type ThinkingLevel = 'minimum' | 'low' | 'medium' | 'high' | 'maximum';
export interface ChannelThinkingPolicy {
    providerId: string;
    modelId: string;
    level: ThinkingLevel;
}
export type RulePlacement = 'before-persona' | 'after-persona' | 'before-tools' | 'after-tools';
export interface RuntimeRuleConfig {
    id: string;
    title: string;
    enabled: boolean;
    order: number;
    placement: RulePlacement;
    content: string;
}
export interface AntSwordRuntimeConfig {
    mcpServers: McpServerConfig[];
    disabledSkills: string[];
    rules: RuntimeRuleConfig[];
    thinkingPolicies: ChannelThinkingPolicy[];
}
export declare const ChannelThinkingPolicySchema: z<ChannelThinkingPolicy>;
export declare const RuntimeRuleSchema: z<RuntimeRuleConfig>;
export declare const AntSwordRuntimeConfigSchema: z<AntSwordRuntimeConfig>;
export declare const DEFAULT_RUNTIME_CONFIG: AntSwordRuntimeConfig;
export declare function validateRuntimeConfig(config: AntSwordRuntimeConfig): void;
export interface RuntimeReconciler {
    readonly name: string;
    prepare(next: AntSwordRuntimeConfig, previous: AntSwordRuntimeConfig): Promise<RuntimePreparedChange> | RuntimePreparedChange;
}
export interface RuntimePreparedChange {
    commit(): Promise<void> | void;
    rollback(): Promise<void> | void;
}
export interface RuntimeApplyFailure {
    reconciler: string;
    message: string;
    generation: number;
}
export interface RuntimeControllerSnapshot {
    generation: number;
    desiredGeneration: number;
    applying: boolean;
    desired: AntSwordRuntimeConfig;
    applied: AntSwordRuntimeConfig;
    lastFailure?: RuntimeApplyFailure;
}
type SnapshotListener = (snapshot: RuntimeControllerSnapshot) => void;
/** Serializes settings commits and publishes desired and applied generations independently. */
export declare class RuntimeController {
    private readonly scope;
    private readonly reconcilers;
    private desired;
    private applied;
    private generation;
    private desiredGeneration;
    private applying;
    private lastFailure;
    private tail;
    private stopped;
    private readonly listeners;
    constructor(scope: SettingsScope<AntSwordRuntimeConfig>, reconcilers: readonly RuntimeReconciler[]);
    start(): () => Promise<void>;
    subscribe(listener: SnapshotListener): () => void;
    snapshot(): RuntimeControllerSnapshot;
    whenIdle(): Promise<void>;
    private enqueue;
    private apply;
    private emit;
}
export {};
//# sourceMappingURL=runtime-config.d.ts.map