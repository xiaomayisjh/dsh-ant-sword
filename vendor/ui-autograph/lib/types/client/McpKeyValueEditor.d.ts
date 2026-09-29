import type { McpConfig } from './mcp-config-json.ts';
interface Props {
    label: string;
    value: Record<string, string>;
    onChange: (value: Record<string, string>) => void;
}
/** Edit string key/value maps used by MCP environment variables and headers. */
export declare function McpKeyValueEditor({ label, value, onChange }: Props): import("react").JSX.Element;
/** Update one optional map field without widening MCP configuration types. */
export declare function withMcpMap(server: McpConfig, field: 'env' | 'headers', value: Record<string, string>): McpConfig;
export {};
//# sourceMappingURL=McpKeyValueEditor.d.ts.map