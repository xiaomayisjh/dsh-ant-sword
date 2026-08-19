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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function clientConfig(server: McpServerConfig, pentestswarmApiKey?: string): McpClientConfig {
  if (server.transport === 'stdio') {
    const env = { ...server.env }
    if (server.serverName === 'pentestswarm' && pentestswarmApiKey !== undefined && pentestswarmApiKey !== '') {
      env.PENTESTSWARM_ORCHESTRATOR_API_KEY = pentestswarmApiKey
    }
    return {
      transport: 'stdio', serverName: server.serverName, command: server.command ?? '', args: server.args ?? [], env,
      cwd: server.cwd ?? '', toolCallTimeoutMs: server.toolCallTimeoutMs ?? 60_000, failOnStartupError: false,
      reconnect: { enabled: true, initialDelayMs: 1_000, maxDelayMs: 30_000, maxAttempts: 5 },
    }
  }
  return {
    transport: server.transport, serverName: server.serverName, url: server.url ?? '', headers: server.headers ?? {},
    toolCallTimeoutMs: server.toolCallTimeoutMs ?? 60_000, failOnStartupError: false,
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

  /** Report one server failure without making it a bundle-level failure. */
  private reportFailure(serverName: string, phase: string, error: unknown): void {
    const logger = this.ctx.logger
    if (logger === undefined || typeof logger.warn !== 'function') return
    logger.warn(`MCP server "${serverName}" ${phase}; skipping this server: ${errorMessage(error)}`)
  }

  /** Dispose one fiber and remove only that server from the live set. */
  private async disposeServer(serverName: string, fiber: PluginFiber): Promise<void> {
    try {
      await fiber.dispose()
    } catch (error) {
      this.reportFailure(serverName, 'failed to unload', error)
    } finally {
      // A disposal failure still must not prevent another server from being
      // reconciled. Cordis has already transitioned the fiber out of the
      // active lifecycle by the time dispose() settles.
      if (this.fibers.get(serverName) === fiber) this.fibers.delete(serverName)
    }
  }

  /** Reconcile one changed server; failures are intentionally isolated. */
  private async reconcileServer(
    serverName: string,
    desired: McpServerConfig | undefined,
  ): Promise<void> {
    const current = this.fibers.get(serverName)
    if (current !== undefined) await this.disposeServer(serverName, current)
    if (desired === undefined || desired.enabled === false) return
    if (desired.transport === 'stdio' && !this.canResolveCommand(desired.command ?? '')) return
    try {
      const fiber = await this.mount(desired)
      this.fibers.set(serverName, fiber)
    } catch (error) {
      this.reportFailure(serverName, 'failed to load', error)
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
        // Each MCP server owns an independent plugin fiber. A failed mount or
        // disposal is contained to that name so healthy servers still become
        // available and the runtime controller can commit the catalog.
        await Promise.all(changed.map(name => this.reconcileServer(name, desired.get(name))))
        this.configs = desired
      }),
      rollback: () => this.enqueue(async () => {
        const current = [...this.fibers.values()]
        await Promise.allSettled(current.map(fiber => fiber.dispose()))
        this.fibers.clear()
        await Promise.all([...previous.entries()].map(([name, config]) => this.reconcileServer(name, config)))
        this.configs = previous
      }),
    }
  }
}
