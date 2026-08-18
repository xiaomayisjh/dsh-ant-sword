/** Ordered system-prompt sections backed by runtime rules. */
import type { Context } from '@deepseek-ai/cordis';
import type { AntSwordRuntimeConfig, RuntimePreparedChange, RuntimeReconciler, RuntimeRuleConfig } from './runtime-config.ts';
export declare function escapeRuleContent(content: string): string;
/** Generates a backend-owned id; callers must persist it and reuse it on edits/copies. */
export declare function createStableRuleId(existing?: Iterable<string>): string;
/** Adds ids to imported/legacy rules while preserving every existing id. */
export declare function ensureStableRuleIds(rules: readonly RuntimeRuleConfig[]): RuntimeRuleConfig[];
export declare class RulesReconciler implements RuntimeReconciler {
    private readonly ctx;
    readonly name = "rules";
    private disposers;
    private rules;
    constructor(ctx: Context);
    prepare(next: AntSwordRuntimeConfig, _previousConfig: AntSwordRuntimeConfig): RuntimePreparedChange;
}
//# sourceMappingURL=rules-reconciler.d.ts.map