/** Deployment-level runtime status for the red-team bundle. */

import { spawnSync } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { McpServerConfig } from './mcp-servers.ts'
import { skillProvider } from './skills.ts'

export type RuntimeAvailability = 'available' | 'missing' | 'configured' | 'disabled'

export interface McpRuntimeStatus {
  readonly serverName: string
  readonly transport: 'stdio' | 'streamable-http'
  readonly availability: RuntimeAvailability
  readonly target: string
  readonly installCommand?: string
  readonly installHint: string
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

function mcpStatus(server: McpServerConfig): McpRuntimeStatus {
  const guide = INSTALL_GUIDES[server.serverName] ?? { hint: '安装对应 MCP server，并确认配置的命令或 URL 可访问。' }
  const target = server.transport === 'stdio' ? (server.command ?? '') : (server.url ?? '')
  const availability: RuntimeAvailability = server.enabled === false
    ? 'disabled'
    : server.transport === 'stdio'
      ? commandExists(target) ? 'available' : 'missing'
      : 'configured'
  return {
    serverName: server.serverName,
    transport: server.transport,
    availability,
    target,
    ...(guide.command === undefined ? {} : { installCommand: guide.command }),
    installHint: guide.hint,
  }
}

export function applyRuntimeStatus(ctx: Context, servers: readonly McpServerConfig[]): void {
  let disposed = false
  let running = false
  let latest: RedTeamRuntimeStatus = {
    checkedAt: Date.now(),
    skills: { available: 0, provider: skillProvider.name, state: 'ready' },
    mcp: servers.map(mcpStatus),
  }

  const publish = async (): Promise<void> => {
    if (running || disposed) return
    running = true
    let skills: RedTeamRuntimeStatus['skills']
    try {
      const candidates = await skillProvider.list({ signal: new AbortController().signal })
      const available = 'candidates' in candidates ? candidates.candidates.length : candidates.length
      skills = { available, provider: skillProvider.name, state: 'ready' }
    } catch (error) {
      skills = { available: 0, provider: skillProvider.name, state: 'error', error: String(error) }
    }
    if (!disposed) {
      latest = {
        checkedAt: Date.now(),
        skills,
        mcp: servers.map(mcpStatus),
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
  ctx.inject(['webServer'], scope => {
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
  })
  ctx.on('skills/change', () => { void publish() })
}