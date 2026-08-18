import type { Context } from '@deepseek-ai/cordis';
import { type SkillProvider, type SkillProviderControl } from '@deepseek-ai/dsh-skill';
import type { AntSwordRuntimeConfig, RuntimePreparedChange, RuntimeReconciler } from './runtime-config.ts';
export declare class SkillsReconciler implements RuntimeReconciler {
    readonly name = "skills";
    private disabled;
    private invalidate;
    private readonly catalog;
    constructor(root?: string);
    provider(control: SkillProviderControl): SkillProvider;
    prepare(next: AntSwordRuntimeConfig, _previousConfig: AntSwordRuntimeConfig): RuntimePreparedChange;
    refresh(): void;
}
export declare function applySkillApi(ctx: Context, reconciler: SkillsReconciler, root?: string): void;
//# sourceMappingURL=skill-runtime.d.ts.map