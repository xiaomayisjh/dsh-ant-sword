/**
 * Persisted runtime configuration and transactional hot-apply coordination.
 * The controller deliberately knows nothing about MCP fibers, skill storage,
 * or prompt sections; those concerns implement reconcilers behind one shared
 * commit boundary.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/runtime-config
 */

import z from '@deepseek-ai/schemastery'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import { DEFAULT_MCP_SERVERS, McpServerSchema } from './mcp-servers.ts'
import type { McpServerConfig } from './mcp-servers.ts'

export const ANT_SWORD_SETTINGS_NAMESPACE = 'ant-sword-runtime'
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/
export const RULE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
export const MAX_RULE_TITLE_BYTES = 256
export const MAX_RULE_CONTENT_BYTES = 32 * 1024

export type RulePlacement = 'before-persona' | 'after-persona' | 'before-tools' | 'after-tools'

export interface RuntimeRuleConfig {
  id: string
  title: string
  enabled: boolean
  order: number
  placement: RulePlacement
  content: string
}

export interface AntSwordRuntimeConfig {
  mcpServers: McpServerConfig[]
  disabledSkills: string[]
  rules: RuntimeRuleConfig[]
}

export const RuntimeRuleSchema: z<RuntimeRuleConfig> = z.object({
  id: z.string().required(),
  title: z.string().required(),
  enabled: z.boolean().default(true),
  order: z.number().default(0),
  placement: z.union(['before-persona', 'after-persona', 'before-tools', 'after-tools'] as const).required(),
  content: z.string().required(),
})

export const AntSwordRuntimeConfigSchema: z<AntSwordRuntimeConfig> = z.object({
  mcpServers: z.array(McpServerSchema).default(DEFAULT_MCP_SERVERS.map(server => ({ ...server }))),
  disabledSkills: z.array(z.string()).default([]),
  rules: z.array(RuntimeRuleSchema).default([]),
})

export const DEFAULT_RUNTIME_CONFIG: AntSwordRuntimeConfig = AntSwordRuntimeConfigSchema({
  mcpServers: DEFAULT_MCP_SERVERS.map(server => ({ ...server })),
  disabledSkills: [],
  rules: [],
})

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) throw new TypeError(`${label} contains duplicate "${value}"`)
    seen.add(value)
  }
}

function validateMcpServer(server: McpServerConfig): void {
  if (!SERVER_NAME_PATTERN.test(server.serverName)) {
    throw new TypeError(`MCP serverName "${server.serverName}" must match ${String(SERVER_NAME_PATTERN)}`)
  }
  if (server.transport === 'stdio') {
    if (server.command === undefined || server.command.trim() === '') {
      throw new TypeError(`stdio MCP server "${server.serverName}" requires command`)
    }
    if (server.url !== undefined) throw new TypeError(`stdio MCP server "${server.serverName}" cannot define url`)
    return
  }
  const hasStdioFields = (server.command !== undefined && server.command !== '')
    || (server.args !== undefined && server.args.length > 0)
    || (server.cwd !== undefined && server.cwd !== '')
    || (server.env !== undefined && Object.keys(server.env).length > 0)
  if (hasStdioFields) {
    throw new TypeError(`streamable-http MCP server "${server.serverName}" cannot define stdio fields`)
  }
  let url: URL
  try {
    url = new URL(server.url ?? '')
  } catch {
    throw new TypeError(`streamable-http MCP server "${server.serverName}" requires a valid URL`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError(`streamable-http MCP server "${server.serverName}" URL must use http or https`)
  }
}

function validateRule(rule: RuntimeRuleConfig): void {
  if (!RULE_ID_PATTERN.test(rule.id)) throw new TypeError(`rule id "${rule.id}" must match ${String(RULE_ID_PATTERN)}`)
  if (!Number.isSafeInteger(rule.order)) throw new TypeError(`rule "${rule.id}" order must be a safe integer`)
  if (rule.title.trim() === '') throw new TypeError(`rule "${rule.id}" title cannot be empty`)
  if (byteLength(rule.title) > MAX_RULE_TITLE_BYTES) throw new TypeError(`rule "${rule.id}" title exceeds ${String(MAX_RULE_TITLE_BYTES)} UTF-8 bytes`)
  if (rule.content.includes('\0')) throw new TypeError(`rule "${rule.id}" content cannot contain NUL`)
  if (byteLength(rule.content) > MAX_RULE_CONTENT_BYTES) throw new TypeError(`rule "${rule.id}" content exceeds ${String(MAX_RULE_CONTENT_BYTES)} UTF-8 bytes`)
}

export function validateRuntimeConfig(config: AntSwordRuntimeConfig): void {
  assertUnique(config.mcpServers.map(server => server.serverName), 'mcpServers')
  for (const server of config.mcpServers) validateMcpServer(server)

  assertUnique(config.disabledSkills, 'disabledSkills')
  for (const name of config.disabledSkills) {
    if (!SKILL_NAME_PATTERN.test(name)) throw new TypeError(`disabled skill "${name}" must match ${String(SKILL_NAME_PATTERN)}`)
  }

  assertUnique(config.rules.map(rule => rule.id), 'rules')
  for (const rule of config.rules) validateRule(rule)
}

export interface RuntimeReconciler {
  readonly name: string
  prepare(next: AntSwordRuntimeConfig, previous: AntSwordRuntimeConfig): Promise<RuntimePreparedChange> | RuntimePreparedChange
}

export interface RuntimePreparedChange {
  commit(): Promise<void> | void
  rollback(): Promise<void> | void
}

export interface RuntimeApplyFailure {
  reconciler: string
  message: string
}

export interface RuntimeControllerSnapshot {
  generation: number
  applying: boolean
  config: AntSwordRuntimeConfig
  lastFailure?: RuntimeApplyFailure
}

type SnapshotListener = (snapshot: RuntimeControllerSnapshot) => void

function cloneConfig(config: AntSwordRuntimeConfig): AntSwordRuntimeConfig {
  return structuredClone(config)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Serializes settings commits and publishes only fully reconciled generations. */
export class RuntimeController {
  private current: AntSwordRuntimeConfig
  private generation = 0
  private applying = false
  private lastFailure: RuntimeApplyFailure | undefined
  private tail: Promise<void> = Promise.resolve()
  private stopped = false
  private readonly listeners = new Set<SnapshotListener>()

  constructor(
    private readonly scope: SettingsScope<AntSwordRuntimeConfig>,
    private readonly reconcilers: readonly RuntimeReconciler[],
  ) {
    this.current = cloneConfig(scope.get())
    validateRuntimeConfig(this.current)
  }

  start(): () => Promise<void> {
    const unwatch = this.scope.watch(next => this.enqueue(next))
    void this.enqueue(this.current)
    return async () => {
      this.stopped = true
      unwatch()
      await this.tail
      this.listeners.clear()
    }
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  snapshot(): RuntimeControllerSnapshot {
    return {
      generation: this.generation,
      applying: this.applying,
      config: cloneConfig(this.current),
      ...(this.lastFailure === undefined ? {} : { lastFailure: { ...this.lastFailure } }),
    }
  }

  whenIdle(): Promise<void> {
    return this.tail
  }

  private enqueue(next: AntSwordRuntimeConfig): Promise<void> {
    const candidate = cloneConfig(next)
    const run = this.tail.then(() => this.apply(candidate))
    this.tail = run.catch(() => undefined)
    return run
  }

  private async apply(next: AntSwordRuntimeConfig): Promise<void> {
    if (this.stopped) return
    this.applying = true
    this.emit()
    const prepared: Array<{ reconciler: RuntimeReconciler; change: RuntimePreparedChange }> = []
    try {
      validateRuntimeConfig(next)
      for (const reconciler of this.reconcilers) {
        prepared.push({ reconciler, change: await reconciler.prepare(next, this.current) })
      }
      const committed: typeof prepared = []
      try {
        for (const entry of prepared) {
          await entry.change.commit()
          committed.push(entry)
        }
      } catch (error) {
        await Promise.allSettled(committed.reverse().map(entry => entry.change.rollback()))
        throw error
      }
      this.current = cloneConfig(next)
      this.generation += 1
      this.lastFailure = undefined
    } catch (error) {
      const failedAt = prepared.at(-1)?.reconciler.name ?? 'validation'
      this.lastFailure = { reconciler: failedAt, message: errorMessage(error) }
    } finally {
      this.applying = false
      this.emit()
    }
  }

  private emit(): void {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) listener(snapshot)
  }
}
