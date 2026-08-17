import type { McpConfig } from './mcp-config-json.ts';
interface Props {
    servers: readonly McpConfig[];
    savedServers: readonly McpConfig[];
    saving: boolean;
    onChange: (servers: McpConfig[]) => void;
    onSave: () => Promise<void>;
}
/** Rich master-detail MCP editor with safe JSON import and runtime actions. */
export declare function McpConfigEditor({ servers, savedServers, saving, onChange, onSave }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=McpConfigEditor.d.ts.map