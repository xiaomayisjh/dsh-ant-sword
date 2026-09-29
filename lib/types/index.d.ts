/** Ant Sword Host plugin for DSH 0.2 scoped agent presets. */
import type { Context, Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { AutoLoopConfig } from './auto/index.ts';
import type { McpServerConfig } from './mcp-servers.ts';
import type { ChannelThinkingPolicy, RuntimeRuleConfig, SimulatedEfforts, ThinkingFallbackPolicy } from './runtime-config.ts';
export declare const name = "ant-sword-harness";
export declare const inject: string[];
/** Loader-owned fields are editable through DSH 0.2 SettingsForms. */
export interface Config {
    autoLoop?: AutoLoopConfig;
    mcpServers: Volatile<McpServerConfig[]>;
    disabledSkills: Volatile<string[]>;
    rules: Volatile<RuntimeRuleConfig[]>;
    thinkingPolicies: Volatile<ChannelThinkingPolicy[]>;
    thinkingFallbacks: Volatile<ThinkingFallbackPolicy[]>;
    defaultThinkingFallback: Volatile<SimulatedEfforts | null | undefined>;
    pentestswarmApiKey: Volatile<string | undefined>;
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    autoLoop: z<AutoLoopConfig>;
    mcpServers: z<NoInfer<McpServerConfig[]>, NoInfer<McpServerConfig[]>, "volatile-defined">;
    disabledSkills: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    rules: z<NoInfer<RuntimeRuleConfig[]>, NoInfer<RuntimeRuleConfig[]>, "volatile-defined">;
    thinkingPolicies: z<NoInfer<ChannelThinkingPolicy[]>, NoInfer<ChannelThinkingPolicy[]>, "volatile-defined">;
    thinkingFallbacks: z<NoInfer<ThinkingFallbackPolicy[]>, NoInfer<ThinkingFallbackPolicy[]>, "volatile-defined">;
    defaultThinkingFallback: z<NoInfer<SimulatedEfforts | null>, NoInfer<SimulatedEfforts | null>, "volatile">;
    pentestswarmApiKey: z<string, string, "volatile">;
}>>, Schemastery.ObjectT<NoInfer<{
    autoLoop: z<AutoLoopConfig>;
    mcpServers: z<NoInfer<McpServerConfig[]>, NoInfer<McpServerConfig[]>, "volatile-defined">;
    disabledSkills: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    rules: z<NoInfer<RuntimeRuleConfig[]>, NoInfer<RuntimeRuleConfig[]>, "volatile-defined">;
    thinkingPolicies: z<NoInfer<ChannelThinkingPolicy[]>, NoInfer<ChannelThinkingPolicy[]>, "volatile-defined">;
    thinkingFallbacks: z<NoInfer<ThinkingFallbackPolicy[]>, NoInfer<ThinkingFallbackPolicy[]>, "volatile-defined">;
    defaultThinkingFallback: z<NoInfer<SimulatedEfforts | null>, NoInfer<SimulatedEfforts | null>, "volatile">;
    pentestswarmApiKey: z<string, string, "volatile">;
}>>, "plain">;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map