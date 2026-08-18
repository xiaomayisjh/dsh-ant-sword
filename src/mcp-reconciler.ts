/** Dynamic MCP fiber reconciliation for committed runtime settings. */

import type { Context, Fiber } from '@deepseek-ai/cordis'
import * as mcpClient from '@deepseek-ai/dsh-mcp-client'
import type { Config as McpClientConfig } from '@deepseek-ai/dsh-mcp-client'
import { commandExists } from './mcp-servers.ts'
import type { McpServerConfig } from './mcp-servers.ts'
import type { AntSwordRuntimeConfig, RuntimePreparedChange, RuntimeReconciler } from './runtime-config.ts'

type PluginFiber = Fiber

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
  /** Only successfully committed configurations are kept here. */
  private configs = new Map<string, McpServerConfig>()
  /** Serializes every lifecycle operation, including API probe/reload calls. */
  private tail: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly ctx: Context,
    private readonly pentestswarmApiKey?: string,
    private readonly canResolveCommand: (command: string) => boolean = commandExists,
  ) {}

  isMounted(serverName: string): boolean {
    return this.fibers.has(serverName)
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation)
    this.tail = run.catch(() => undefined)
    return run
  }

  private assertUsable(config: McpServerConfig): void {
    if (config.enabled === false) throw new TypeError(`MCP server "${config.serverName}" is disabled`)
    if (config.transport === 'stdio' && !this.canResolveCommand(config.command ?? '')) {
      throw new TypeError(`MCP server "${config.serverName}" command is not available`)
    }
  }

  private async mount(config: McpServerConfig): Promise<PluginFiber> {
    this.assertUsable(config)
    const fiber = this.ctx.plugin(mcpClient, clientConfig(config, this.pentestswarmApiKey))
    try {
      await fiber.await()
      return fiber
    } catch (error) {
      await fiber.dispose().catch(() => undefined)
      throw error
    }
  }

  /** Probe the applied server configuration, serialized with lifecycle changes. */
  async probe(serverName: string): Promise<mcpClient.McpProbeResult> {
    return this.enqueue(async () => {
      const config = this.configs.get(serverName)
      if (config === undefined) throw new TypeError(`unknown MCP server "${serverName}"`)
      this.assertUsable(config)
      return mcpClient.probeMcpServer(clientConfig(config, this.pentestswarmApiKey))
    })
  }

  /** Reload an applied server without losing its previous live fiber on failure. */
  async reload(serverName: string): Promise<void> {
    return this.enqueue(async () => {
      const config = this.configs.get(serverName)
      if (config === undefined) throw new TypeError(`unknown MCP server "${serverName}"`)
      this.assertUsable(config)
      const previous = this.fibers.get(serverName)
      if (previous !== undefined) {
        await previous.dispose()
        this.fibers.delete(serverName)
      }
      try {
        const replacement = await this.mount(config)
        this.fibers.set(serverName, replacement)
      } catch (error) {
        if (previous !== undefined) {
          const restored = await this.mount(config)
          this.fibers.set(serverName, restored)
        }
        throw error
      }
    })
  }

  prepare(next: AntSwordRuntimeConfig, _previousConfig: AntSwordRuntimeConfig): RuntimePreparedChange {
    const desired = new Map(next.mcpServers.map(server => [server.serverName, server] as const))
    const previous = new Map(this.configs)
    return {
      commit: () => this.enqueue(async () => {
        const changed = [...new Set([...previous.keys(), ...desired.keys()])].filter(name => {
          const before = previous.get(name)
          const after = desired.get(name)
          return before === undefined || after === undefined || !sameConfig(before, after)
        })
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
            // Missing stdio commands are valid persisted configuration, but
            // remain unmounted just like the initial catalog path.
            if (config.transport === 'stdio' && !this.canResolveCommand(config.command ?? '')) continue
            const fiber = await this.mount(config)
            this.fibers.set(name, fiber)
            mounted.push(name)
          }
          this.configs = desired
        } catch (error) {
          await Promise.allSettled(mounted.map(async name => {
            await this.fibers.get(name)?.dispose()
            this.fibers.delete(name)
          }))
          // Restore the exact applied set before exposing the failure.
          for (const [name, config] of disposed) {
            const fiber = await this.mount(config)
            this.fibers.set(name, fiber)
          }
          this.configs = previous
          throw error
        }
      }),
      rollback: () => this.enqueue(async () => {
        const current = [...this.fibers.values()]
        await Promise.allSettled(current.map(fiber => fiber.dispose()))
        this.fibers.clear()
        for (const [name, config] of previous) {
          if (config.enabled === false || (config.transport === 'stdio' && !this.canResolveCommand(config.command ?? ''))) continue
          const fiber = await this.mount(config)
          this.fibers.set(name, fiber)
        }
        this.configs = previous
      }),
    }
  }
}