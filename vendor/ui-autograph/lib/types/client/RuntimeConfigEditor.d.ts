import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import type { RuntimeApplySnapshot } from './runtime-config-scope.ts';
import type { RuntimeConfigValue } from './runtime-config-types.ts';
export interface RuntimeConfigEditorScope extends SettingsScope<RuntimeConfigValue> {
    getRuntimeSnapshot(): RuntimeApplySnapshot;
    subscribeRuntime(listener: () => void): () => void;
}
interface Props {
    configScope: RuntimeConfigEditorScope;
}
/** Settings editor for MCP, Skill overlays, and runtime rules. */
export declare function RuntimeConfigEditor({ configScope }: Props): any;
export {};
//# sourceMappingURL=RuntimeConfigEditor.d.ts.map