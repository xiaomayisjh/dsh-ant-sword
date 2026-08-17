/** Deployment-level runtime status for the red-team bundle. */

import { spawnSync } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { McpServerConfig } from './mcp-servers.ts'
import { skillProvider } from './skills.ts'

export type RuntimeAvailability = 'available' | 'missing' | 'configured' | 'disabled'

export interface McpProbeSnapshot {
  readonly checkedAt: number
  readonly toolCount: number
  readonly tools: readonly { readonly name: string; readonly description?: string }[]
}

export interface McpRuntimeStatus {
  readonly serverName: string
  readonly transport: 'stdio' | 'sse' | 'streamable-http'
  readonly availability: RuntimeAvailability
  readonly target: string
  readonly installCommand?: string
  readonly installHint: string
  readonly mounted: boolean
  readonly lastProbe?: McpProbeSnapshot
}

export interface RedTeamRuntimeStatus {
  readonly checkedAt: number
  readonly skills: {
    readonly available: number
    readonly provider: string
    readonly state: 'ready' | 'error'
    readonly error?: string
  }
  readonly mcp: readonly McpRuntimeStatus[]
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Publishes the latest Ant Sword skill and MCP availability snapshot.
     * @mode emit
     * @param snapshot - Complete runtime status observed by WebUI consumers.
     */
    'ant-sword/runtime-status'(snapshot: RedTeamRuntimeStatus): void
  }
}

const INSTALL_GUIDES: Readonly<Record<string, { command?: string; hint: string }>> = {
  kali: { command: 'pip install kali-server-mcp', hint: '安装 kali-server-mcp，并确保命令已加入 PATH。' },
  metasploit: { command: 'pip install metasploit-mcp', hint: '安装 Metasploit MCP bridge，并先完成 Metasploit 初始化。' },
  hexstrike: { command: 'pip install hexstrike-ai', hint: '安装 HexStrike AI MCP 服务并将 hexstrike-ai 加入 PATH。' },
  pentestswarm: { command: 'pip install pentestswarm', hint: '安装 PentestSwarm，并在配置中填写编排器 API key。' },
  jshook: { command: 'npm install -g @jshookmcp/jshook', hint: '需要 Node.js；也可保留 npx 按需下载模式。' },
  anything: { hint: '启动 AnythingLLM MCP 服务，并确认 http://localhost:23816/mcp 可访问。' },
  idapro: { hint: '在 IDA Pro 中启动 MCP 插件，并确认 http://127.0.0.1:13337/mcp 可访问。' },
  ghidra: { hint: '在 Ghidra 中启动 MCP 插件，并确认 http://localhost:8765/mcp 可访问。' },
}

function commandExists(command: string): boolean {
  if (command === '') return false
  const locator = process.platform === 'win32' ? 'where.exe' : 'which'
  return spawnSync(locator, [command], { stdio: 'ignore', windowsHide: true }).status === 0
}

function mcpStatus(
  server: McpServerConfig,
  probes: ReadonlyMap<string, McpProbeSnapshot>,
  isMounted: (serverName: string) => boolean,
): McpRuntimeStatus {
  const guide = INSTALL_GUIDES[server.serverName] ?? { hint: '安装对应 MCP server，并确认配置的命令或 URL 可访问。' }
  const target = server.transport === 'stdio' ? (server.command ?? '') : (server.url ?? '')
  const availability: RuntimeAvailability = server.enabled === false
    ? 'disabled'
    : server.transport === 'stdio'
      ? commandExists(target) ? 'available' : 'missing'
      : 'configured'
  const lastProbe = probes.get(server.serverName)
  return {
    serverName: server.serverName,
    transport: server.transport,
    availability,
    target,
    ...(guide.command === undefined ? {} : { installCommand: guide.command }),
    installHint: guide.hint,
    mounted: isMounted(server.serverName),
    ...(lastProbe === undefined ? {} : { lastProbe }),
  }
}

async function readJsonBody(req: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

export function applyRuntimeStatus(
  ctx: Context,
  getServers: () => readonly McpServerConfig[],
  reloadMcp: (serverName: string) => Promise<void>,
  probeMcp: (serverName: string) => Promise<{ toolCount: number; tools: readonly { name: string; description?: string }[] }>,
  isMcpMounted: (serverName: string) => boolean,
): void {
  let disposed = false
  let running = false
  const probes = new Map<string, McpProbeSnapshot>()
  let latest: RedTeamRuntimeStatus = {
    checkedAt: Date.now(),
    skills: { available: 0, provider: skillProvider.name, state: 'ready' },
    mcp: getServers().map(server => mcpStatus(server, probes, isMcpMounted)),
  }

  const publish = async (): Promise<void> => {
    if (running || disposed) return
    running = true
    let skills: RedTeamRuntimeStatus['skills']
    try {
      const candidates = await ctx.skills.list({ signal: new AbortController().signal })
      const available = candidates.length
      skills = { available, provider: skillProvider.name, state: 'ready' }
    } catch (error) {
      skills = { available: 0, provider: skillProvider.name, state: 'error', error: String(error) }
    }
    if (!disposed) {
      latest = {
        checkedAt: Date.now(),
        skills,
        mcp: getServers().map(server => mcpStatus(server, probes, isMcpMounted)),
      }
      ctx.emit('ant-sword/runtime-status', latest)
    }
    running = false
  }

  void publish()
  const timer = setInterval(() => { void publish() }, 5_000)
  timer.unref()
  ctx.effect(() => () => {
    disposed = true
    clearInterval(timer)
  }, 'ant-sword-runtime-status: publisher')
  ctx.inject(['webServer'], (scope) => {
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: '/ant-sword/runtime-status',
      handler: (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405)
          res.end()
          return
        }
        const body = JSON.stringify(latest)
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(req.method === 'HEAD' ? undefined : body)
      },
    }), 'ant-sword-runtime-status: HTTP endpoint')
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: '/ant-sword/mcp/reload',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end()
          return
        }
        try {
          const body = await readJsonBody(req as AsyncIterable<Uint8Array>) as { serverName?: unknown }
          if (typeof body.serverName !== 'string' || body.serverName === '') throw new TypeError('serverName is required')
          await reloadMcp(body.serverName)
          await publish()
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ ok: true, serverName: body.serverName }))
        } catch (error) {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }))
        }
      },
    }), 'ant-sword-runtime-status: MCP reload endpoint')
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: '/ant-sword/mcp/probe',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end()
          return
        }
        try {
          const body = await readJsonBody(req as AsyncIterable<Uint8Array>) as { serverName?: unknown }
          if (typeof body.serverName !== 'string' || body.serverName === '') throw new TypeError('serverName is required')
          const result = await probeMcp(body.serverName)
          probes.set(body.serverName, { checkedAt: Date.now(), toolCount: result.toolCount, tools: result.tools })
          await publish()
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ ok: true, serverName: body.serverName, toolCount: result.toolCount, tools: result.tools }))
        } catch (error) {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }))
        }
      },
    }), 'ant-sword-runtime-status: MCP probe endpoint')
  })
  ctx.on('skills/change', () => { void publish() })
}
