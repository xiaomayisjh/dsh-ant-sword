/** MCP runtime configuration JSON conversion for the WebUI editor. */
function normalizeImportedMcp(serverName, value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new TypeError(`MCP "${serverName}" must be an object`);
    const input = value;
    const requested = input.transport ?? input.type;
    const transport = requested === 'sse'
        ? 'sse'
        : requested === 'streamable-http' || requested === 'http'
            ? 'streamable-http'
            : requested === 'stdio' || typeof input.command === 'string'
                ? 'stdio'
                : typeof input.url === 'string'
                    ? 'streamable-http'
                    : (() => { throw new TypeError(`MCP "${serverName}" requires command or url`); })();
    const common = {
        serverName,
        enabled: input.enabled ?? true,
        transport,
        toolCallTimeoutMs: input.toolCallTimeoutMs ?? 60_000,
    };
    return transport === 'stdio'
        ? { ...common, command: input.command ?? '', args: input.args ?? [], cwd: input.cwd ?? '', env: input.env ?? {} }
        : { ...common, url: input.url ?? '', headers: input.headers ?? {} };
}
/**
 * Parse native arrays, named `mcpServers` objects, and Claude-style catalogs.
 * @param source - JSON text pasted into the editor.
 * @returns Normalized runtime MCP entries.
 */
export function parseMcpJson(source) {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) {
        return parsed.map((value, index) => {
            const serverName = value !== null && typeof value === 'object' && typeof value.serverName === 'string'
                ? value.serverName
                : `server-${index + 1}`;
            return normalizeImportedMcp(serverName, value);
        });
    }
    if (parsed === null || typeof parsed !== 'object')
        throw new TypeError('MCP JSON must be an array or object');
    const root = parsed;
    const catalog = root.mcpServers ?? parsed;
    if (typeof catalog !== 'object' || Array.isArray(catalog))
        throw new TypeError('mcpServers must be an object');
    return Object.entries(catalog).map(([serverName, value]) => normalizeImportedMcp(serverName, value));
}
/**
 * Serialize the visual editor state to a named `mcpServers` catalog.
 * @param servers - Current visual editor entries.
 * @returns Stable, indented JSON text.
 */
export function formatMcpJson(servers) {
    return JSON.stringify({
        mcpServers: Object.fromEntries(servers.map(({ serverName, ...config }) => [serverName, config])),
    }, undefined, 2);
}
//# sourceMappingURL=mcp-config-json.js.map