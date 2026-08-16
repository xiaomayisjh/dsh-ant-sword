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
import z from '@deepseek-ai/schemastery';
import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
/** Schemastery validation for {@link McpServerConfig}. */
export const McpServerSchema = z.object({
    enabled: z.boolean().default(true).description('启用此 MCP 服务器；关闭则不挂载，其 mcp__* 工具不出现。'),
    serverName: z.string().required().description('工具命名空间，模型看到的是 mcp__<serverName>__<tool>。'),
    transport: z.union(['stdio', 'streamable-http']).required().description('stdio=拉起子进程；streamable-http=连接已在运行的服务。'),
    command: z.string().description('stdio：要启动的可执行文件。'),
    args: z.array(z.string()).description('stdio：命令参数。'),
    env: z.dict(z.string()).description('stdio：额外环境变量（不含密钥，密钥走 secret 字段）。'),
    url: z.string().description('streamable-http：服务器地址。'),
    headers: z.dict(z.string()).description('streamable-http：额外请求头。'),
});
/**
 * The default eight-server catalog, each enabled by default — the bundle's
 * `mcpServers` config row renders one toggleable entry per server in the dsh
 * plugin-config UI; flip `enabled` to false to leave a server unmounted. `env`
 * carries only non-secret routing values; the pentestswarm orchestrator key is
 * a `secret` role on the bundle Config (see index.ts), injected at mount time.
 */
export const DEFAULT_MCP_SERVERS = [
    { enabled: true, serverName: 'kali', transport: 'stdio', command: 'kali-server-mcp', args: ['--port', '5000'] },
    { enabled: true, serverName: 'metasploit', transport: 'stdio', command: 'metasploitmcp', args: ['--transport', 'stdio'] },
    { enabled: true, serverName: 'hexstrike', transport: 'stdio', command: 'hexstrike-ai', args: [] },
    { enabled: true, serverName: 'pentestswarm', transport: 'stdio', command: 'pentestswarm', args: ['mcp', 'serve'] },
    { enabled: true, serverName: 'jshook', transport: 'stdio', command: 'npx', args: ['-y', '@jshookmcp/jshook@latest'], env: { JSHOOK_BASE_PROFILE: 'search' } },
    { enabled: true, serverName: 'anything', transport: 'streamable-http', url: 'http://localhost:23816/mcp' },
    { enabled: true, serverName: 'idapro', transport: 'streamable-http', url: 'http://127.0.0.1:13337/mcp' },
    { enabled: true, serverName: 'ghidra', transport: 'streamable-http', url: 'http://localhost:8765/mcp' },
];
/**
 * Mount one mcp-client instance per enabled server. A server whose initial
 * connection fails is logged and left to its reconnect loop (fail-soft), so
 * one missing tool never blocks the composition.
 * @param ctx - bundle plugin context.
 * @param servers - the resolved server list (defaults merged by the caller).
 * @param pentestswarmApiKey - optional orchestrator key injected into the
 * pentestswarm server's env.
 */
export function applyMcpServers(ctx, servers, pentestswarmApiKey) {
    for (const server of servers) {
        if (server.enabled === false)
            continue;
        const env = { ...server.env };
        if (server.serverName === 'pentestswarm' && pentestswarmApiKey !== undefined && pentestswarmApiKey !== '') {
            env['PENTESTSWARM_ORCHESTRATOR_API_KEY'] = pentestswarmApiKey;
        }
        const config = server.transport === 'stdio'
            ? {
                transport: 'stdio',
                serverName: server.serverName,
                command: server.command ?? '',
                args: server.args ?? [],
                env,
                cwd: '',
                toolCallTimeoutMs: 60_000,
                failOnStartupError: false,
            }
            : {
                transport: 'streamable-http',
                serverName: server.serverName,
                url: server.url ?? '',
                headers: server.headers ?? {},
                toolCallTimeoutMs: 60_000,
                failOnStartupError: false,
            };
        // Mount programmatically; disposal (and the namespace reservation) is
        // effect-scoped to this fiber, so the bundle unload disconnects every server.
        void ctx.plugin(mcpClient, config).await().catch(() => undefined);
    }
}
//# sourceMappingURL=mcp-servers.js.map