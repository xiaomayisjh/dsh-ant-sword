/** Ordered system-prompt sections backed by runtime rules. */
import type { Context } from '@deepseek-ai/cordis';
import type { AntSwordRuntimeConfig, RuntimePreparedChange, RuntimeReconciler } from './runtime-config.ts';
export declare function escapeRuleContent(content: string): string;
export declare class RulesReconciler implements RuntimeReconciler {
    private readonly ctx;
    readonly name = "rules";
    private disposers;
    private rules;
    constructor(ctx: Context);
    prepare(next: AntSwordRuntimeConfig, _previousConfig: AntSwordRuntimeConfig): RuntimePreparedChange;
}
//# sourceMappingURL=rules-reconciler.d.ts.map