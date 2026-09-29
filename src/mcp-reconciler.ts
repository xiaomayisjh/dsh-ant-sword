/** Dynamic MCP fiber reconciliation for committed runtime settings. */

import type { Context } from '@deepseek-ai/cordis'
import * as mcpClient from '@deepseek-ai/dsh-mcp-client'
import type { Config as McpClientConfig } from '@deepseek-ai/dsh-mcp-client'
import { commandExists } from './mcp-servers.ts'
import type { McpServerConfig } from './mcp-servers.ts'
import type { AntSwordRuntimeConfig, RuntimePreparedChange, RuntimeReconciler } from './runtime-config.ts'

type PluginFiber = ReturnType<Context['plugin']>

export type McpMountState = 'disabled' | 'missing-command' | 'pending' | 'mounting' | 'mounted' | 'failed'

export interface McpCallObservation {
  readonly at: number
  readonly ok: boolean
  readonly error?: string
}

/** Facts the bundle can observe without guessing at the MCP client's private reconnect state. */
export interface McpMountSnapshot {
  readonly serverName: string
  readonly mount: McpMountState
  readonly toolNames: readonly string[]
  readonly initialConnectedAt?: number
  readonly lastCall?: McpCallObservation
  readonly error?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

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
    transport: 'streamable-http', serverName: server.serverName, url: server.url ?? '', headers: server.headers ?? {},
    toolCallTimeoutMs: server.toolCallTimeoutMs ?? 60_000, failOnStartupError: true,
    reconnect: { enabled: true, initialDelayMs: 1_000, maxDelayMs: 30_000, maxAttempts: 5 },
  }
}

export class McpReconciler implements RuntimeReconciler {
  readonly name = 'mcp'
  private readonly fibers = new Map<string, PluginFiber>()
  private readonly mounting = new Set<string>()
  private readonly initiallyConnected = new Map<string, number>()
  private readonly lastCalls = new Map<string, McpCallObservation>()
  private readonly failures = new Map<string, string>()
  private configs = new Map<string, McpServerConfig>()
  private currentApiKey: string | undefined
  /** Serializes HTTP reloads with Loader-driven config commits. */
  private tail: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly ctx: Context,
    private readonly getPentestswarmApiKey: () => string | undefined = () => undefined,
    private readonly canResolveCommand: (command: string) => boolean = commandExists,
  ) {
    // A mounted fiber proves the initial MCP handshake, but the upstream
    // client keeps tool registrations during reconnect. A settled invocation
    // is the only public later observation; expose it separately from mount.
    ctx.on('tools/post-execute', (exec, result, next) => {
      if (exec.name.startsWith('mcp__')) {
        for (const name of this.configs.keys()) {
          if (exec.name.startsWith(`mcp__${name}__`)) {
            this.lastCalls.set(name, {
              at: Date.now(),
              ok: !result.isError,
              ...(result.isError ? { error: result.error.message } : {}),
            })
            break
          }
        }
      }
      return next()
    }, { global: true })
  }

  /** Current mount and callable-tool evidence for the committed server list. */
  statusFor(servers: readonly McpServerConfig[]): readonly McpMountSnapshot[] {
    const toolNames = this.ctx.tools.schemas().map(tool => tool.name)
    return servers.map(server => {
      const name = server.serverName
      const names = toolNames.filter(tool => tool.startsWith(`mcp__${name}__`))
      const mount: McpMountState = server.enabled === false ? 'disabled'
        : this.mounting.has(name) ? 'mounting'
          : this.fibers.has(name) ? 'mounted'
            : server.transport === 'stdio' && !this.canResolveCommand(server.command ?? '') ? 'missing-command'
              : this.failures.has(name) ? 'failed' : 'pending'
      const initialConnectedAt = this.initiallyConnected.get(name)
      const lastCall = this.lastCalls.get(name)
      const error = this.failures.get(name)
      return {
        serverName: name, mount, toolNames: names,
        ...(initialConnectedAt === undefined ? {} : { initialConnectedAt }),
        ...(lastCall === undefined ? {} : { lastCall: { ...lastCall } }),
        ...(error === undefined || mount !== 'failed' ? {} : { error }),
      }
    })
  }

  isMounted(serverName: string): boolean {
    return this.fibers.has(serverName)
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation)
    this.tail = run.catch(() => undefined)
    return run
  }

  /** Reconnect one configured server without changing its persisted settings. */
  reload(serverName: string): Promise<void> {
    return this.enqueue(async () => {
      const config = this.configs.get(serverName)
      if (config === undefined) throw new TypeError(`unknown MCP server "${serverName}"`)
      if (config.enabled === false) throw new TypeError(`MCP server "${serverName}" is disabled`)
      if (config.transport === 'stdio' && !this.canResolveCommand(config.command ?? '')) {
        throw new TypeError(`MCP server "${serverName}" command is not available`)
      }
      const previous = this.fibers.get(serverName)
      if (previous !== undefined) {
        await previous.dispose()
        this.fibers.delete(serverName)
      }
      this.initiallyConnected.delete(serverName)
      this.lastCalls.delete(serverName)
      this.failures.delete(serverName)
      this.mounting.add(serverName)
      let replacement: PluginFiber | undefined
      try {
        replacement = this.ctx.plugin(mcpClient, clientConfig(config, this.currentApiKey))
        await replacement.await()
        this.fibers.set(serverName, replacement)
        this.initiallyConnected.set(serverName, Date.now())
      } catch (error) {
        this.failures.set(serverName, errorMessage(error))
        if (replacement !== undefined) {
          try { await replacement.dispose() }
          catch (disposeError) { this.ctx.logger.warn(`mcp: failed to dispose ${serverName} after reload error: ${errorMessage(disposeError)}`) }
        }
        throw error
      } finally {
        this.mounting.delete(serverName)
      }
    })
  }

  /** Read the mounted tool catalog for the legacy UI probe endpoint. */
  probe(serverName: string): Promise<{ toolCount: number; tools: readonly { name: string; description?: string }[] }> {
    return this.enqueue(async () => {
      const config = this.configs.get(serverName)
      if (config === undefined) throw new TypeError(`unknown MCP server "${serverName}"`)
      if (!this.fibers.has(serverName)) throw new TypeError(`MCP server "${serverName}" is not mounted`)
      const tools = this.ctx.tools.schemas().filter(tool => tool.name.startsWith(`mcp__${serverName}__`))
        .map(tool => ({ name: tool.name.slice(`mcp__${serverName}__`.length), ...(tool.description === undefined ? {} : { description: tool.description }) }))
      return { toolCount: tools.length, tools }
    })
  }

  prepare(next: AntSwordRuntimeConfig, _previousConfig: AntSwordRuntimeConfig): RuntimePreparedChange {
    const desired = new Map(next.mcpServers.map(server => [server.serverName, server]))
    const previous = new Map(this.configs)
    const nextApiKey = this.getPentestswarmApiKey()
    const previousApiKey = this.currentApiKey
    const previousCalls = new Map(this.lastCalls)
    const previousConnected = new Map(this.initiallyConnected)
    const previousFailures = new Map(this.failures)
    const previouslyMounted = new Set(this.fibers.keys())
    return {
      commit: () => this.enqueue(async () => {
        const changed = new Set<string>([...previous.keys(), ...desired.keys()].filter(name => {
          const before = previous.get(name)
          const after = desired.get(name)
          return before === undefined || after === undefined || !sameConfig(before, after)
            || (name === 'pentestswarm' && previousApiKey !== nextApiKey)
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
            this.initiallyConnected.delete(name)
            this.lastCalls.delete(name)
            this.failures.delete(name)
          }
          for (const name of changed) {
            const config = desired.get(name)
            if (config === undefined || config.enabled === false) continue
            if (config.transport === 'stdio' && !this.canResolveCommand(config.command ?? '')) continue
            this.mounting.add(name)
            let fiber: PluginFiber | undefined
            try {
              fiber = this.ctx.plugin(mcpClient, clientConfig(config, nextApiKey))
              await fiber.await()
              this.fibers.set(name, fiber)
              this.initiallyConnected.set(name, Date.now())
              mounted.push(name)
            } catch (error) {
              // A configured but unavailable MCP server is an observed
              // capability gap, not a failure of the whole runtime generation.
              this.failures.set(name, errorMessage(error))
              this.ctx.logger.warn(`mcp: ${name} initial connection failed: ${errorMessage(error)}`)
              if (fiber !== undefined) {
                try { await fiber.dispose() }
                catch (disposeError) {
                  this.ctx.logger.warn(`mcp: failed to dispose ${name} after startup error: ${errorMessage(disposeError)}`)
                }
              }
            } finally {
              this.mounting.delete(name)
            }
          }
          this.configs = desired
          this.currentApiKey = nextApiKey
        } catch (error) {
          await Promise.allSettled(mounted.map(async name => {
            await this.fibers.get(name)?.dispose()
            this.fibers.delete(name)
          }))
          for (const [name, config] of disposed) {
            const fiber = this.ctx.plugin(mcpClient, clientConfig(config, previousApiKey))
            await fiber.await()
            this.fibers.set(name, fiber)
          }
          this.lastCalls.clear()
          for (const [name, call] of previousCalls) this.lastCalls.set(name, call)
          this.initiallyConnected.clear()
          for (const [name, at] of previousConnected) this.initiallyConnected.set(name, at)
          this.configs = previous
          this.currentApiKey = previousApiKey
          throw error
        }
      }),
      rollback: () => this.enqueue(async () => {
        const current = [...this.fibers.values()]
        await Promise.allSettled(current.map(fiber => fiber.dispose()))
        this.fibers.clear()
        for (const [name, config] of previous) {
          if (!previouslyMounted.has(name)) continue
          const fiber = this.ctx.plugin(mcpClient, clientConfig(config, previousApiKey))
          await fiber.await()
          this.fibers.set(name, fiber)
        }
        this.lastCalls.clear()
        for (const [name, call] of previousCalls) this.lastCalls.set(name, call)
        this.initiallyConnected.clear()
        for (const [name, at] of previousConnected) this.initiallyConnected.set(name, at)
        this.failures.clear()
        for (const [name, message] of previousFailures) this.failures.set(name, message)
        this.configs = previous
        this.currentApiKey = previousApiKey
      }),
    }
  }
}
