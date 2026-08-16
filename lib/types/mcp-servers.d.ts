/**
 * Embedded offensive-security MCP servers: the catalog of eight Kali/reverse
 * MCP servers the autonomous preset bridges in, declared as plugin Config so
 * each server's transport/command/env/credentials is editable in the dsh
 * plugin-config UI (never via environment-variable overrides). `applyMcpServers`
 * mounts one `@deepseek-ai/dsh-mcp-client` instance per enabled server;
 * a server that is absent fails soft (`failOnStartupError: false`), so the
 * loop notes the gap and continues.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/mcp-servers
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** One embedded MCP server's editable configuration. */
export interface McpServerConfig {
    /** Mount this server. Default true. */
    enabled?: boolean;
    /** Namespace for the model-facing tool names (`mcp__<serverName>__<tool>`). */
    serverName: string;
    /** Transport: spawned stdio child or a running Streamable HTTP server. */
    transport: 'stdio' | 'streamable-http';
    /** stdio: executable to spawn. */
    command?: string;
    /** stdio: arguments. */
    args?: string[];
    /** stdio: extra env merged over the scrubbed ambient env. */
    env?: Record<string, string>;
    /** streamable-http: server URL. */
    url?: string;
    /** streamable-http: extra headers. */
    headers?: Record<string, string>;
}
/** Schemastery validation for {@link McpServerConfig}. */
export declare const McpServerSchema: z<McpServerConfig>;
/**
 * The default eight-server catalog, each enabled by default — the bundle's
 * `mcpServers` config row renders one toggleable entry per server in the dsh
 * plugin-config UI; flip `enabled` to false to leave a server unmounted. `env`
 * carries only non-secret routing values; the pentestswarm orchestrator key is
 * a `secret` role on the bundle Config (see index.ts), injected at mount time.
 */
export declare const DEFAULT_MCP_SERVERS: readonly McpServerConfig[];
/**
 * Mount one mcp-client instance per enabled server. A server whose initial
 * connection fails is logged and left to its reconnect loop (fail-soft), so
 * one missing tool never blocks the composition.
 * @param ctx - bundle plugin context.
 * @param servers - the resolved server list (defaults merged by the caller).
 * @param pentestswarmApiKey - optional orchestrator key injected into the
 * pentestswarm server's env.
 */
export declare function applyMcpServers(ctx: Context, servers: readonly McpServerConfig[], pentestswarmApiKey?: string): void;
//# sourceMappingURL=mcp-servers.d.ts.map