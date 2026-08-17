import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import type { McpConfig } from './mcp-config-json.ts';
interface RuleConfig {
    id: string;
    title: string;
    enabled: boolean;
    order: number;
    placement: 'before-persona' | 'after-persona' | 'before-tools' | 'after-tools';
    content: string;
}
export interface RuntimeConfigValue {
    mcpServers: McpConfig[];
    disabledSkills: string[];
    rules: RuleConfig[];
}
interface Props {
    configScope: SettingsScope<RuntimeConfigValue>;
}
/** Settings editor for MCP, Skill overlays, and runtime rules. */
export declare function RuntimeConfigEditor({ configScope }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=RuntimeConfigEditor.d.ts.map