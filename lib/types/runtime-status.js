/** Deployment-level runtime status for the red-team bundle. */
import { spawnSync } from 'node:child_process';
import { skillProvider } from "./skills.js";
const INSTALL_GUIDES = {
    kali: { command: 'pip install kali-server-mcp', hint: '安装 kali-server-mcp，并确保命令已加入 PATH。' },
    metasploit: { command: 'pip install metasploit-mcp', hint: '安装 Metasploit MCP bridge，并先完成 Metasploit 初始化。' },
    hexstrike: { command: 'pip install hexstrike-ai', hint: '安装 HexStrike AI MCP 服务并将 hexstrike-ai 加入 PATH。' },
    pentestswarm: { command: 'pip install pentestswarm', hint: '安装 PentestSwarm，并在配置中填写编排器 API key。' },
    jshook: { command: 'npm install -g @jshookmcp/jshook', hint: '需要 Node.js；也可保留 npx 按需下载模式。' },
    anything: { hint: '启动 AnythingLLM MCP 服务，并确认 http://localhost:23816/mcp 可访问。' },
    idapro: { hint: '在 IDA Pro 中启动 MCP 插件，并确认 http://127.0.0.1:13337/mcp 可访问。' },
    ghidra: { hint: '在 Ghidra 中启动 MCP 插件，并确认 http://localhost:8765/mcp 可访问。' },
};
function commandExists(command) {
    if (command === '')
        return false;
    const locator = process.platform === 'win32' ? 'where.exe' : 'which';
    return spawnSync(locator, [command], { stdio: 'ignore', windowsHide: true }).status === 0;
}
function mcpStatus(server, probes, isMounted) {
    const guide = INSTALL_GUIDES[server.serverName] ?? { hint: '安装对应 MCP server，并确认配置的命令或 URL 可访问。' };
    const target = server.transport === 'stdio' ? (server.command ?? '') : (server.url ?? '');
    const availability = server.enabled === false
        ? 'disabled'
        : server.transport === 'stdio'
            ? commandExists(target) ? 'available' : 'missing'
            : 'configured';
    const lastProbe = probes.get(server.serverName);
    return {
        serverName: server.serverName,
        transport: server.transport,
        availability,
        target,
        ...(guide.command === undefined ? {} : { installCommand: guide.command }),
        installHint: guide.hint,
        mounted: isMounted(server.serverName),
        ...(lastProbe === undefined ? {} : { lastProbe }),
    };
}
async function readJsonBody(req) {
    const chunks = [];
    for await (const chunk of req)
        chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function applyRuntimeStatus(ctx, getServers, reloadMcp, probeMcp, isMcpMounted) {
    const lifecycle = { disposed: false };
    const isActive = () => !lifecycle.disposed;
    let running = false;
    const probes = new Map();
    let latest = {
        checkedAt: Date.now(),
        skills: { available: 0, provider: skillProvider.name, state: 'ready' },
        mcp: getServers().map(server => mcpStatus(server, probes, isMcpMounted)),
    };
    const publish = async () => {
        if (running || lifecycle.disposed)
            return;
        running = true;
        let skills;
        try {
            const candidates = await ctx.skills.list({ signal: new AbortController().signal });
            const available = candidates.length;
            skills = { available, provider: skillProvider.name, state: 'ready' };
        }
        catch (error) {
            skills = { available: 0, provider: skillProvider.name, state: 'error', error: String(error) };
        }
        if (isActive()) {
            latest = {
                checkedAt: Date.now(),
                skills,
                mcp: getServers().map(server => mcpStatus(server, probes, isMcpMounted)),
            };
            ctx.emit('ant-sword/runtime-status', latest);
        }
        running = false;
    };
    void publish();
    const timer = setInterval(() => { void publish(); }, 5_000);
    timer.unref();
    ctx.effect(() => () => {
        lifecycle.disposed = true;
        clearInterval(timer);
    }, 'ant-sword-runtime-status: publisher');
    ctx.inject(['webServer'], (scope) => {
        scope.effect(() => scope.webServer.register({
            kind: 'exact',
            path: '/ant-sword/runtime-status',
            handler: (req, res) => {
                if (req.method !== 'GET' && req.method !== 'HEAD') {
                    res.writeHead(405);
                    res.end();
                    return;
                }
                const body = JSON.stringify(latest);
                res.writeHead(200, {
                    'content-type': 'application/json; charset=utf-8',
                    'cache-control': 'no-store',
                });
                res.end(req.method === 'HEAD' ? undefined : body);
            },
        }), 'ant-sword-runtime-status: HTTP endpoint');
        scope.effect(() => scope.webServer.register({
            kind: 'exact',
            path: '/ant-sword/mcp/reload',
            handler: async (req, res) => {
                if (req.method !== 'POST') {
                    res.writeHead(405);
                    res.end();
                    return;
                }
                try {
                    const body = await readJsonBody(req);
                    if (typeof body.serverName !== 'string' || body.serverName === '')
                        throw new TypeError('serverName is required');
                    await reloadMcp(body.serverName);
                    await publish();
                    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                    res.end(JSON.stringify({ ok: true, serverName: body.serverName }));
                }
                catch (error) {
                    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                    res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
                }
            },
        }), 'ant-sword-runtime-status: MCP reload endpoint');
        scope.effect(() => scope.webServer.register({
            kind: 'exact',
            path: '/ant-sword/mcp/probe',
            handler: async (req, res) => {
                if (req.method !== 'POST') {
                    res.writeHead(405);
                    res.end();
                    return;
                }
                try {
                    const body = await readJsonBody(req);
                    if (typeof body.serverName !== 'string' || body.serverName === '')
                        throw new TypeError('serverName is required');
                    const result = await probeMcp(body.serverName);
                    probes.set(body.serverName, { checkedAt: Date.now(), toolCount: result.toolCount, tools: result.tools });
                    await publish();
                    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                    res.end(JSON.stringify({ ok: true, serverName: body.serverName, toolCount: result.toolCount, tools: result.tools }));
                }
                catch (error) {
                    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                    res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
                }
            },
        }), 'ant-sword-runtime-status: MCP probe endpoint');
    });
    ctx.on('skills/change', () => { void publish(); });
}
//# sourceMappingURL=runtime-status.js.map