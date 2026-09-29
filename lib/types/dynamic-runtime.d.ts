/** Loader-owned runtime reconciliation wiring. */
import type { Context } from '@deepseek-ai/cordis';
import { McpReconciler } from './mcp-reconciler.ts';
import { RuntimeController } from './runtime-config.ts';
import type { AntSwordRuntimeConfig } from './runtime-config.ts';
import { ThinkingPolicyRuntime } from './thinking-policy.ts';
import { SkillsReconciler } from './skill-runtime.ts';
export interface DynamicRuntime {
    controller: RuntimeController;
    mcp: McpReconciler;
    thinking: ThinkingPolicyRuntime;
}
export declare function applyDynamicRuntime(ctx: Context, initialConfig: AntSwordRuntimeConfig, getPentestswarmApiKey?: () => string | undefined, skillsReconciler?: SkillsReconciler): DynamicRuntime;
//# sourceMappingURL=dynamic-runtime.d.ts.map