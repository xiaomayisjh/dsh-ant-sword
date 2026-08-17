/** MCP runtime configuration JSON conversion for the WebUI editor. */
/** One normalized MCP entry edited by the WebUI. */
export interface McpConfig {
    enabled?: boolean;
    serverName: string;
    transport: 'stdio' | 'sse' | 'streamable-http';
    command?: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    toolCallTimeoutMs?: number;
}
/** A user-actionable import failure that leaves the visual draft unchanged. */
export declare class McpJsonError extends Error {
    readonly name = "McpJsonError";
}
/**
 * Parse native arrays, named `mcpServers` objects or arrays, and Claude-style catalogs.
 * @param source - JSON text pasted into the editor.
 * @returns Normalized runtime MCP entries.
 */
export declare function parseMcpJson(source: string): McpConfig[];
/**
 * Serialize the visual editor state to a named `mcpServers` catalog.
 * @param servers - Current visual editor entries.
 * @returns Stable, indented JSON text.
 */
export declare function formatMcpJson(servers: readonly McpConfig[]): string;
//# sourceMappingURL=mcp-config-json.d.ts.map