import type { RuntimeApplySnapshot, RuntimeConfigForm } from './runtime-config-scope.ts';
export interface RuntimeConfigEditorScope extends RuntimeConfigForm {
    getRuntimeSnapshot(): RuntimeApplySnapshot;
    subscribeRuntime(listener: () => void): () => void;
}
interface Props {
    configScope: RuntimeConfigEditorScope;
}
/** Settings editor for MCP, Skill overlays, runtime rules, and thinking policies. */
export declare function RuntimeConfigEditor({ configScope }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=RuntimeConfigEditor.d.ts.map