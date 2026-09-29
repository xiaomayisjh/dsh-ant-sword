/** Deployment-level runtime status for the red-team bundle. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { McpReconciler } from './mcp-reconciler.ts'
import type { McpCallObservation, McpMountSnapshot, McpMountState } from './mcp-reconciler.ts'
import { commandExists } from './mcp-servers.ts'
import type { McpServerConfig } from './mcp-servers.ts'
import type { RuntimeController, RuntimeControllerSnapshot } from './runtime-config.ts'
import { skillProvider } from './skills.ts'

export type RuntimeAvailability = 'available' | 'degraded' | 'missing' | 'configured' | 'disabled' | 'pending' | 'unavailable'

export interface McpRuntimeStatus {
  readonly serverName: string
  readonly transport: 'stdio' | 'streamable-http'
  readonly availability: RuntimeAvailability
  readonly mount: McpMountState
  readonly toolNames: readonly string[]
  readonly toolCount: number
  readonly mounted: boolean
  readonly lastProbe?: McpProbeSnapshot
  readonly initialConnectedAt?: number
  readonly lastCall?: McpCallObservation
  readonly error?: string
  readonly target: string
  readonly installCommand?: string
  readonly installHint: string
}

export interface McpProbeSnapshot {
  readonly checkedAt: number
  readonly toolCount: number
  readonly tools: readonly { readonly name: string; readonly description?: string }[]
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
  readonly runtimeConfig: Pick<RuntimeControllerSnapshot, 'generation' | 'applying' | 'lastFailure'>
}

declare module '@deepseek-ai/cordis' {
  interface Events {
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

export function mcpAvailability(mount: McpMountState, toolCount: number, lastCall?: McpCallObservation): RuntimeAvailability {
  if (mount === 'disabled') return 'disabled'
  if (mount === 'missing-command') return 'missing'
  if (mount === 'pending' || mount === 'mounting') return 'pending'
  if (mount === 'failed' || toolCount === 0) return 'unavailable'
  return lastCall?.ok === false ? 'degraded' : 'available'
}

type ContextTier = 'compact' | 'standard' | 'wide'

interface CapabilityBudget {
  readonly boardChars: number
  readonly evidenceChars: number
  readonly contextTier: ContextTier
}

interface CapabilityServer {
  readonly serverName: string
  readonly mount: McpMountState
  readonly availability: RuntimeAvailability
  readonly toolCount: number
  readonly toolNames: string[]
  readonly hasMoreTools: boolean
  readonly initialConnectedAt?: number
  readonly lastCallOk?: boolean
  readonly lastCallAt?: number
}

interface CapabilityResult {
  readonly checkedAt: number
  readonly page: number
  readonly totalServers: number
  readonly servers: CapabilityServer[]
  readonly selectedServer?: string
  readonly nextPage?: number
}

const FALLBACK_CAPABILITY_BUDGET: CapabilityBudget = {
  boardChars: 1_200,
  evidenceChars: 160,
  contextTier: 'compact',
}

async function capabilityBudget(ctx: Context, agent: unknown): Promise<CapabilityBudget> {
  const service = ctx.get?.('modelAdaptation') as {
    profile(agent: unknown): Promise<Partial<CapabilityBudget>> | Partial<CapabilityBudget>
  } | undefined
  const profile = agent === undefined ? undefined : await service?.profile(agent)
  const bounded = (value: number | undefined, fallback: number, minimum: number, maximum: number): number =>
    value !== undefined && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, Math.floor(value))) : fallback
  return {
    boardChars: bounded(profile?.boardChars, FALLBACK_CAPABILITY_BUDGET.boardChars, 512, 8_192),
    evidenceChars: bounded(profile?.evidenceChars, FALLBACK_CAPABILITY_BUDGET.evidenceChars, 40, 1_024),
    contextTier: profile?.contextTier === 'standard' || profile?.contextTier === 'wide'
      ? profile.contextTier : 'compact',
  }
}

function capabilityServer(
  status: McpRuntimeStatus,
  visibleNames: readonly string[],
  shownNames: readonly string[],
  detailed = false,
  hasMoreTools = shownNames.length < visibleNames.length,
): CapabilityServer {
  return {
    serverName: status.serverName,
    mount: status.mount,
    availability: mcpAvailability(status.mount, visibleNames.length, status.lastCall),
    toolCount: visibleNames.length,
    toolNames: [...shownNames],
    hasMoreTools,
    ...(detailed && status.initialConnectedAt !== undefined ? { initialConnectedAt: status.initialConnectedAt } : {}),
    ...(detailed && status.lastCall !== undefined ? { lastCallOk: status.lastCall.ok, lastCallAt: status.lastCall.at } : {}),
  }
}

function capabilityPages(
  statuses: readonly { status: McpRuntimeStatus; names: readonly string[] }[],
  budget: CapabilityBudget,
  checkedAt: number,
  selectedServer?: string,
): CapabilityResult[] {
  const limits = {
    compact: { servers: 4, preview: 2, focused: 8 },
    standard: { servers: 8, preview: 4, focused: 16 },
    wide: { servers: 12, preview: 8, focused: 32 },
  }[budget.contextTier]
  const result = (servers: readonly CapabilityServer[], page: number, hasNext: boolean): CapabilityResult => ({
    checkedAt, page, totalServers: statuses.length, servers: [...servers],
    ...(selectedServer === undefined ? {} : { selectedServer }),
    ...(hasNext ? { nextPage: page + 1 } : {}),
  })
  const fits = (servers: readonly CapabilityServer[], page: number): boolean =>
    JSON.stringify(result(servers, page, true)).length <= budget.boardChars

  if (selectedServer !== undefined) {
    const found = statuses.find(item => item.status.serverName === selectedServer)
    if (found === undefined) throw new TypeError('unknown MCP serverName')
    const pages: CapabilityServer[][] = []
    let offset = 0
    do {
      const page = pages.length + 1
      const names: string[] = []
      while (offset < found.names.length && names.length < limits.focused) {
        const candidate = [...names, found.names[offset]!]
        const server = capabilityServer(found.status, found.names, candidate, true, offset + 1 < found.names.length)
        if (names.length > 0 && !fits([server], page)) break
        names.push(found.names[offset]!)
        offset++
      }
      pages.push([capabilityServer(found.status, found.names, names, true, offset < found.names.length)])
    } while (offset < found.names.length)
    return pages.map((servers, index) => result(servers, index + 1, index + 1 < pages.length))
  }

  const pages: CapabilityServer[][] = [[]]
  for (const { status, names } of statuses) {
    const preview: string[] = []
    let previewChars = 0
    for (const name of names) {
      if (preview.length >= limits.preview) break
      if (previewChars + name.length > budget.evidenceChars) continue
      preview.push(name)
      previewChars += name.length
    }
    let current = pages[pages.length - 1]!
    let page = pages.length
    let server = capabilityServer(status, names, preview)
    if (current.length >= limits.servers || (current.length > 0 && !fits([...current, server], page))) {
      current = []
      pages.push(current)
      page++
    }
    while (server.toolNames.length > 0 && !fits([...current, server], page)) {
      server = capabilityServer(status, names, server.toolNames.slice(0, -1))
    }
    current.push(server)
  }
  return pages.map((servers, index) => result(servers, index + 1, index + 1 < pages.length))
}

function mcpStatus(server: McpServerConfig, observed?: McpMountSnapshot, lastProbe?: McpProbeSnapshot): McpRuntimeStatus {
  const guide = INSTALL_GUIDES[server.serverName] ?? { hint: '安装对应 MCP server，并确认配置的命令或 URL 可访问。' }
  const target = server.transport === 'stdio' ? (server.command ?? '') : (server.url ?? '')
  const mount = observed?.mount ?? (server.enabled === false ? 'disabled'
    : server.transport === 'stdio' && !commandExists(target) ? 'missing-command' : 'pending')
  const toolNames = observed?.toolNames ?? []
  return {
    serverName: server.serverName,
    transport: server.transport,
    availability: mcpAvailability(mount, toolNames.length, observed?.lastCall),
    mount,
    toolNames,
    toolCount: toolNames.length,
    mounted: mount === 'mounted',
    target,
    ...(lastProbe === undefined ? {} : { lastProbe }),
    ...(observed?.initialConnectedAt === undefined ? {} : { initialConnectedAt: observed.initialConnectedAt }),
    ...(observed?.lastCall === undefined ? {} : { lastCall: observed.lastCall }),
    ...(observed?.error === undefined ? {} : { error: observed.error }),
    ...(guide.command === undefined ? {} : { installCommand: guide.command }),
    installHint: guide.hint,
  }
}

async function readJsonBody(req: AsyncIterable<Uint8Array>): Promise<{ serverName: string }> {
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.byteLength
    if (size > 16_384) throw new TypeError('request body is too large')
    chunks.push(chunk)
  }
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (typeof body !== 'object' || body === null || !('serverName' in body)
    || typeof body.serverName !== 'string' || body.serverName === '') {
    throw new TypeError('serverName is required')
  }
  return { serverName: body.serverName }
}

export function applyRuntimeStatus(ctx: Context, controller: RuntimeController, mcpReconciler: McpReconciler): void {
  let disposed = false
  let running = false
  let pending = false
  const runtimeStatus = ({ generation, applying, lastFailure }: RuntimeControllerSnapshot): Pick<RuntimeControllerSnapshot, 'generation' | 'applying' | 'lastFailure'> => {
    return { generation, applying, ...(lastFailure === undefined ? {} : { lastFailure }) }
  }
  const initialSnapshot = controller.snapshot()
  const probes = new Map<string, McpProbeSnapshot>()
  const mcpStatuses = (servers: readonly McpServerConfig[]): readonly McpRuntimeStatus[] => {
    const observed = new Map(mcpReconciler.statusFor(servers).map(status => [status.serverName, status]))
    return servers.map(server => mcpStatus(server, observed.get(server.serverName), probes.get(server.serverName)))
  }
  let latest: RedTeamRuntimeStatus = {
    checkedAt: Date.now(),
    skills: { available: 0, provider: skillProvider.name, state: 'ready' },
    mcp: mcpStatuses(initialSnapshot.applied.mcpServers),
    runtimeConfig: runtimeStatus(initialSnapshot),
  }

  ctx.tools.register(defineTool({
    name: 'mcp_capabilities',
    description: 'Read MCP mount states and visible tool counts before selecting an MCP-dependent Intent. The default response previews a few tool names per server. Use serverName to page through every tool on one server; page starts at 1 and nextPage indicates more results. A configured URL alone is not evidence of a working server.',
    parameters: {
      serverName: { type: 'string', description: 'Optional exact server name. Select it to enumerate all visible tool names in pages.' },
      page: { type: 'integer', description: 'One-based page number; follows nextPage in the current listing.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          checkedAt: { type: 'integer', required: true },
          page: { type: 'integer', required: true },
          totalServers: { type: 'integer', required: true },
          selectedServer: { type: 'string' },
          nextPage: { type: 'integer' },
          servers: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                serverName: { type: 'string', required: true },
                mount: { type: 'string', required: true },
                availability: { type: 'string', required: true },
                toolCount: { type: 'integer', required: true },
                toolNames: { type: 'array', required: true, items: { type: 'string' } },
                hasMoreTools: { type: 'boolean', required: true },
                initialConnectedAt: { type: 'integer' },
                lastCallOk: { type: 'boolean' },
                lastCallAt: { type: 'integer' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      const page = args.page ?? 1
      if (!Number.isSafeInteger(page) || page < 1) throw new TypeError('page must be a positive integer')
      const visible = new Set(ctx.tools.schemas(exec.agent).map(tool => tool.name))
      const statuses = mcpStatuses(controller.snapshot().applied.mcpServers).map(status => ({
        status,
        names: status.toolNames.filter(name => visible.has(name)).sort(),
      }))
      const pages = capabilityPages(statuses, await capabilityBudget(ctx, exec.agent), Date.now(), args.serverName)
      if (page > pages.length) throw new TypeError('page exceeds available MCP capability pages')
      return pages[page - 1]!
    },
  }))

  const publish = async (): Promise<void> => {
    if (disposed) return
    pending = true
    if (running) return
    running = true
    try {
      while (pending && !disposed) {
        pending = false
        let skills: RedTeamRuntimeStatus['skills']
        try {
          const candidates = await ctx.skills.list({ signal: new AbortController().signal })
          skills = { available: candidates.length, provider: skillProvider.name, state: 'ready' }
        } catch (error) {
          skills = { available: 0, provider: skillProvider.name, state: 'error', error: String(error) }
        }
        if (disposed) return
        const snapshot = controller.snapshot()
        latest = {
          checkedAt: Date.now(),
          skills,
          mcp: mcpStatuses(snapshot.applied.mcpServers),
          runtimeConfig: runtimeStatus(snapshot),
        }
        ctx.emit('ant-sword/runtime-status', latest)
      }
    } finally {
      running = false
    }
  }

  ctx.effect(() => {
    const timer = setInterval(() => { void publish() }, 5_000)
    timer.unref()
    const unsubscribe = controller.subscribe(() => { void publish() })
    return () => {
      disposed = true
      unsubscribe()
      clearInterval(timer)
    }
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
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
        try {
          const { serverName } = await readJsonBody(req)
          await mcpReconciler.reload(serverName)
          await publish()
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ ok: true, serverName }))
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
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
        try {
          const { serverName } = await readJsonBody(req)
          const result = await mcpReconciler.probe(serverName)
          probes.set(serverName, { checkedAt: Date.now(), ...result })
          await publish()
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ ok: true, serverName, ...result }))
        } catch (error) {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }))
        }
      },
    }), 'ant-sword-runtime-status: MCP probe endpoint')
  })
  ctx.on('skills/change', () => { void publish() })
  ctx.on('tools/change', () => { void publish() })
  ctx.on('tools/post-execute', (exec, _result, next) => {
    if (exec.name.startsWith('mcp__')) void publish()
    return next()
  }, { global: true })
}
