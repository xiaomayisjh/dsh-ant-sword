/** Pure MCP editor state and validation helpers. */
import type { McpConfig } from './mcp-config-json.ts';
/** One validation problem associated with a server or the whole list. */
export interface McpValidationIssue {
    serverName?: string;
    message: string;
}
/** Create a new editable stdio server with a collision-free name. */
export declare function createMcpServer(servers: readonly McpConfig[]): McpConfig;
/** Copy a server and assign a collision-free name. */
export declare function copyMcpServer(server: McpConfig, servers: readonly McpConfig[]): McpConfig;
/** Replace transport-specific fields while preserving common fields. */
export declare function switchMcpTransport(server: McpConfig, transport: McpConfig['transport']): McpConfig;
/** Return validation problems that prevent a useful runtime save. */
export declare function validateMcpServers(servers: readonly McpConfig[]): McpValidationIssue[];
/** Compare serializable server drafts without depending on object identity. */
export declare function mcpServersEqual(left: readonly McpConfig[], right: readonly McpConfig[]): boolean;
//# sourceMappingURL=mcp-editor-state.d.ts.map