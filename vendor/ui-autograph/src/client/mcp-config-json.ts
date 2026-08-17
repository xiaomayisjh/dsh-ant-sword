/** MCP runtime configuration JSON conversion for the WebUI editor. */

/** One normalized MCP entry edited by the WebUI. */
export interface McpConfig {
  enabled?: boolean
  serverName: string
  transport: 'stdio' | 'sse' | 'streamable-http'
  command?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  toolCallTimeoutMs?: number
}

/** A user-actionable import failure that leaves the visual draft unchanged. */
export class McpJsonError extends Error {
  override readonly name = 'McpJsonError'
}

function fail(message: string): never {
  throw new McpJsonError(`${message} 请修正 JSON 后重试；当前可视化配置不会被覆盖。`)
}

function stringRecord(value: unknown, field: string, serverName: string): Record<string, string> {
  if (value === undefined) return {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`MCP“${serverName}”的 ${field} 必须是键值对象。`)
  const entries = Object.entries(value)
  if (entries.some(([, item]) => typeof item !== 'string')) fail(`MCP“${serverName}”的 ${field} 值必须全部是字符串。`)
  return Object.fromEntries(entries)
}

function stringArray(value: unknown, serverName: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) fail(`MCP“${serverName}”的 args 必须是字符串数组。`)
  return value as string[]
}

function normalizeImportedMcp(fallbackName: string, value: unknown): McpConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`MCP“${fallbackName}”必须是对象。`)
  const input = value as Record<string, unknown>
  const serverName = typeof input.serverName === 'string'
    ? input.serverName
    : typeof input.name === 'string'
      ? input.name
      : fallbackName
  if (serverName.trim() === '') fail('每个 MCP 都需要非空名称。')
  const requested = input.transport ?? input.type
  const transport: McpConfig['transport'] = requested === 'sse'
    ? 'sse'
    : requested === 'streamable-http' || requested === 'http'
      ? 'streamable-http'
      : requested === 'stdio' || typeof input.command === 'string'
        ? 'stdio'
        : typeof input.url === 'string'
          ? 'streamable-http'
          : fail(`MCP“${serverName}”需要 command（stdio）或 url（HTTP）。`)
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') fail(`MCP“${serverName}”的 enabled 必须是布尔值。`)
  if (input.toolCallTimeoutMs !== undefined && (typeof input.toolCallTimeoutMs !== 'number' || input.toolCallTimeoutMs <= 0)) {
    fail(`MCP“${serverName}”的 toolCallTimeoutMs 必须是正数。`)
  }
  const common = {
    serverName,
    enabled: input.enabled ?? true,
    transport,
    toolCallTimeoutMs: input.toolCallTimeoutMs ?? 60_000,
  }
  if (transport === 'stdio') {
    if (input.command !== undefined && typeof input.command !== 'string') fail(`MCP“${serverName}”的 command 必须是字符串。`)
    if (input.cwd !== undefined && typeof input.cwd !== 'string') fail(`MCP“${serverName}”的 cwd 必须是字符串。`)
    return {
      ...common,
      command: input.command ?? '',
      args: stringArray(input.args, serverName),
      cwd: input.cwd ?? '',
      env: stringRecord(input.env, 'env', serverName),
    }
  }
  if (input.url !== undefined && typeof input.url !== 'string') fail(`MCP“${serverName}”的 url 必须是字符串。`)
  return { ...common, url: input.url ?? '', headers: stringRecord(input.headers, 'headers', serverName) }
}

function normalizeArray(values: unknown[]): McpConfig[] {
  return values.map((value, index) => normalizeImportedMcp(`server-${index + 1}`, value))
}

/**
 * Parse native arrays, named `mcpServers` objects or arrays, and Claude-style catalogs.
 * @param source - JSON text pasted into the editor.
 * @returns Normalized runtime MCP entries.
 */
export function parseMcpJson(source: string): McpConfig[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(source) as unknown
  } catch (error) {
    const detail = error instanceof SyntaxError ? error.message : String(error)
    fail(`JSON 解析失败：${detail}`)
  }
  if (Array.isArray(parsed)) return normalizeArray(parsed)
  if (parsed === null || typeof parsed !== 'object') fail('MCP JSON 顶层必须是对象或数组。')
  const root = parsed as { mcpServers?: unknown }
  const catalog = root.mcpServers ?? parsed
  if (Array.isArray(catalog)) return normalizeArray(catalog)
  if (typeof catalog !== 'object') fail('mcpServers 必须是命名对象或数组。')
  return Object.entries(catalog).map(([serverName, value]) => normalizeImportedMcp(serverName, value))
}

/**
 * Serialize the visual editor state to a named `mcpServers` catalog.
 * @param servers - Current visual editor entries.
 * @returns Stable, indented JSON text.
 */
export function formatMcpJson(servers: readonly McpConfig[]): string {
  return JSON.stringify({
    mcpServers: Object.fromEntries(servers.map(({ serverName, ...config }) => [serverName, config])),
  }, undefined, 2)
}
