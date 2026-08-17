import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import type { RuntimeConfigValue } from './runtime-config-types.ts';
interface Props {
    configScope: SettingsScope<RuntimeConfigValue>;
}
/** Settings editor for MCP, Skill overlays, and runtime rules. */
export declare function RuntimeConfigEditor({ configScope }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=RuntimeConfigEditor.d.ts.map