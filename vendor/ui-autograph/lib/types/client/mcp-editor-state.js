/** Create a new editable stdio server with a collision-free name. */
export function createMcpServer(servers) {
    const names = new Set(servers.map(server => server.serverName));
    let suffix = servers.length + 1;
    while (names.has(`server-${suffix}`))
        suffix += 1;
    return { enabled: true, serverName: `server-${suffix}`, transport: 'stdio', command: '', args: [], env: {}, toolCallTimeoutMs: 60_000 };
}
/** Copy a server and assign a collision-free name. */
export function copyMcpServer(server, servers) {
    const names = new Set(servers.map(item => item.serverName));
    const base = `${server.serverName}-copy`;
    let name = base;
    let suffix = 2;
    while (names.has(name))
        name = `${base}-${suffix++}`;
    return { ...structuredClone(server), serverName: name };
}
/** Replace transport-specific fields while preserving common fields. */
export function switchMcpTransport(server, transport) {
    const common = {
        serverName: server.serverName,
        enabled: server.enabled ?? true,
        transport,
        toolCallTimeoutMs: server.toolCallTimeoutMs ?? 60_000,
    };
    return transport === 'stdio'
        ? { ...common, command: '', args: [], cwd: '', env: {} }
        : { ...common, url: '', headers: {} };
}
/** Return validation problems that prevent a useful runtime save. */
export function validateMcpServers(servers) {
    const issues = [];
    const names = new Set();
    for (const server of servers) {
        const name = server.serverName.trim();
        if (name === '')
            issues.push({ message: '服务器名称不能为空。' });
        else if (names.has(name))
            issues.push({ serverName: name, message: `服务器名称“${name}”重复。` });
        else
            names.add(name);
        if (server.transport === 'stdio' && (server.command ?? '').trim() === '') {
            issues.push({ serverName: name, message: `MCP“${name || '未命名'}”需要启动命令。` });
        }
        if (server.transport !== 'stdio' && (server.url ?? '').trim() === '') {
            issues.push({ serverName: name, message: `MCP“${name || '未命名'}”需要 URL。` });
        }
        if ((server.toolCallTimeoutMs ?? 0) <= 0) {
            issues.push({ serverName: name, message: `MCP“${name || '未命名'}”的工具超时必须大于 0。` });
        }
    }
    return issues;
}
/** Compare serializable server drafts without depending on object identity. */
export function mcpServersEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}
//# sourceMappingURL=mcp-editor-state.js.map