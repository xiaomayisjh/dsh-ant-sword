/** Dynamic MCP fiber reconciliation for committed runtime settings. */

import type { Context } from '@deepseek-ai/cordis'
import * as mcpClient from '@deepseek-ai/dsh-mcp-client'
import type { Config as McpClientConfig } from '@deepseek-ai/dsh-mcp-client'
import { commandExists } from './mcp-servers.ts'
import type { McpServerConfig } from './mcp-servers.ts'
import type { AntSwordRuntimeConfig, RuntimePreparedChange, RuntimeReconciler } from './runtime-config.ts'

type PluginFiber = ReturnType<Context['plugin']>

function sameConfig(left: McpServerConfig, right: McpServerConfig): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function clientConfig(server: McpServerConfig, pentestswarmApiKey?: string): McpClientConfig {
  if (server.transport === 'stdio') {
    const env = { ...server.env }
    if (server.serverName === 'pentestswarm' && pentestswarmApiKey !== undefined && pentestswarmApiKey !== '') {
      env.PENTESTSWARM_ORCHESTRATOR_API_KEY = pentestswarmApiKey
    }
    return {
      transport: 'stdio', serverName: server.serverName, command: server.command ?? '', args: server.args ?? [], env,
      cwd: server.cwd ?? '', toolCallTimeoutMs: server.toolCallTimeoutMs ?? 60_000, failOnStartupError: true,
      reconnect: { enabled: true, initialDelayMs: 1_000, maxDelayMs: 30_000, maxAttempts: 5 },
    }
  }
  return {
    transport: server.transport, serverName: server.serverName, url: server.url ?? '', headers: server.headers ?? {},
    toolCallTimeoutMs: server.toolCallTimeoutMs ?? 60_000, failOnStartupError: true,
    reconnect: { enabled: true, initialDelayMs: 1_000, maxDelayMs: 30_000, maxAttempts: 5 },
  }
}

export class McpReconciler implements RuntimeReconciler {
  readonly name = 'mcp'
  private readonly fibers = new Map<string, PluginFiber>()
  private configs = new Map<string, McpServerConfig>()

  constructor(
    private readonly ctx: Context,
    private readonly pentestswarmApiKey?: string,
    private readonly canResolveCommand: (command: string) => boolean = commandExists,
  ) {}

  /** Whether one server currently owns an active plugin fiber. */
  isMounted(serverName: string): boolean {
    return this.fibers.has(serverName)
  }

  /** Probe one server without replacing its live tool registrations. */
  async probe(serverName: string): Promise<mcpClient.McpProbeResult> {
    const config = this.configs.get(serverName)
    if (config === undefined) throw new TypeError(`unknown MCP server "${serverName}"`)
    if (config.enabled === false) throw new TypeError(`MCP server "${serverName}" is disabled`)
    if (config.transport === 'stdio' && !this.canResolveCommand(config.command ?? '')) {
      throw new TypeError(`MCP server "${serverName}" command is not available`)
    }
    return mcpClient.probeMcpServer(clientConfig(config, this.pentestswarmApiKey))
  }

  /** Force one configured server through a dispose/connect cycle. */
  async reload(serverName: string): Promise<void> {
    const config = this.configs.get(serverName)
    if (config === undefined) throw new TypeError(`unknown MCP server "${serverName}"`)
    const current = this.fibers.get(serverName)
    if (current !== undefined) {
      await current.dispose()
      this.fibers.delete(serverName)
    }
    if (config.enabled === false) throw new TypeError(`MCP server "${serverName}" is disabled`)
    if (config.transport === 'stdio' && !this.canResolveCommand(config.command ?? '')) {
      throw new TypeError(`MCP server "${serverName}" command is not available`)
    }
    const fiber = this.ctx.plugin(mcpClient, clientConfig(config, this.pentestswarmApiKey))
    try {
      await fiber.await()
      this.fibers.set(serverName, fiber)
    } catch (error) {
      await fiber.dispose()
      throw error
    }
  }

  prepare(next: AntSwordRuntimeConfig, _previousConfig: AntSwordRuntimeConfig): RuntimePreparedChange {
    const desired = new Map(next.mcpServers.map(server => [server.serverName, server]))
    const previous = new Map(this.configs)
    return {
      commit: async () => {
        const changed = new Set<string>([...previous.keys(), ...desired.keys()].filter((name) => {
          const before = previous.get(name)
          const after = desired.get(name)
          return before === undefined || after === undefined || !sameConfig(before, after)
        }))
        const disposed: Array<[string, McpServerConfig]> = []
        const mounted: string[] = []
        try {
          for (const name of changed) {
            const fiber = this.fibers.get(name)
            const config = previous.get(name)
            if (fiber !== undefined) {
              await fiber.dispose()
              this.fibers.delete(name)
              if (config !== undefined) disposed.push([name, config])
            }
          }
          for (const name of changed) {
            const config = desired.get(name)
            if (config === undefined || config.enabled === false) continue
            if (config.transport === 'stdio' && !this.canResolveCommand(config.command ?? '')) continue
            const fiber = this.ctx.plugin(mcpClient, clientConfig(config, this.pentestswarmApiKey))
            await fiber.await()
            this.fibers.set(name, fiber)
            mounted.push(name)
          }
          this.configs = desired
        } catch (error) {
          await Promise.allSettled(mounted.map(async (name) => {
            await this.fibers.get(name)?.dispose()
            this.fibers.delete(name)
          }))
          for (const [name, config] of disposed) {
            const fiber = this.ctx.plugin(mcpClient, clientConfig(config, this.pentestswarmApiKey))
            await fiber.await()
            this.fibers.set(name, fiber)
          }
          this.configs = previous
          throw error
        }
      },
      rollback: async () => {
        const current = [...this.fibers.values()]
        await Promise.allSettled(current.map(fiber => fiber.dispose()))
        this.fibers.clear()
        for (const [name, config] of previous) {
          if (config.enabled === false || (config.transport === 'stdio' && !this.canResolveCommand(config.command ?? ''))) continue
          const fiber = this.ctx.plugin(mcpClient, clientConfig(config, this.pentestswarmApiKey))
          await fiber.await()
          this.fibers.set(name, fiber)
        }
        this.configs = previous
      },
    }
  }
}
