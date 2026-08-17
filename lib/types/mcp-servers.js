/**
 * Embedded offensive-security MCP servers: the catalog of eight Kali/reverse
 * MCP servers the autonomous preset bridges in, declared as plugin Config so
 * each server's transport/command/env/credentials is editable in the dsh
 * plugin-config UI (never via environment-variable overrides). `applyMcpServers`
 * mounts one `@deepseek-ai/dsh-mcp-client` instance per enabled and resolvable
 * server. Missing stdio commands remain visible in configuration and runtime
 * status but are not mounted, so no reconnect loop repeatedly invokes them.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/mcp-servers
 */
import { spawnSync } from 'node:child_process';
import z from '@deepseek-ai/schemastery';
import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
/** Schemastery validation for {@link McpServerConfig}. */
export const McpServerSchema = z.object({
    enabled: z.boolean().default(true).description('启用此 MCP 服务器；关闭则不挂载，其 mcp__* 工具不出现。'),
    serverName: z.string().required().description('工具命名空间，模型看到的是 mcp__<serverName>__<tool>。'),
    transport: z.union(['stdio', 'sse', 'streamable-http']).required().description('stdio=拉起子进程；sse=旧版 HTTP+SSE；streamable-http=当前 HTTP MCP。'),
    command: z.string().description('stdio：要启动的可执行文件。'),
    args: z.array(z.string()).description('stdio：命令参数。'),
    cwd: z.string().description('stdio：工作目录；留空使用 Harness 工作目录。'),
    toolCallTimeoutMs: z.number().min(1).max(2_147_483_647).default(60_000).description('单次工具调用超时（毫秒）。'),
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
    { enabled: true, serverName: 'everything', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-everything'] },
    { enabled: false, serverName: 'memory', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] },
    { enabled: false, serverName: 'filesystem', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] },
    { enabled: false, serverName: 'github', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
    { enabled: false, serverName: 'playwright', transport: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
    { enabled: false, serverName: 'remote-http', transport: 'streamable-http', url: 'http://127.0.0.1:3000/mcp' },
];
/** Return whether a stdio command can be resolved without invoking a shell. */
export function commandExists(command) {
    if (command === '')
        return false;
    const locator = process.platform === 'win32' ? 'where.exe' : 'which';
    return spawnSync(locator, [command], { stdio: 'ignore', windowsHide: true }).status === 0;
}
/**
 * Mount one mcp-client instance per enabled and locally resolvable server.
 * Missing stdio commands remain in the runtime-status catalog but are not
 * mounted, preventing the client's reconnect loop from repeatedly spawning
 * an executable that is not installed.
 * @param ctx - bundle plugin context.
 * @param servers - the resolved server list (defaults merged by the caller).
 * @param pentestswarmApiKey - optional orchestrator key injected into the
 * pentestswarm server's env.
 * @param canResolveCommand - executable probe, injectable for deterministic tests.
 */
export function applyMcpServers(ctx, servers, pentestswarmApiKey, canResolveCommand = commandExists) {
    for (const server of servers) {
        if (server.enabled === false)
            continue;
        if (server.transport === 'stdio' && !canResolveCommand(server.command ?? ''))
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
                transport: server.transport,
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