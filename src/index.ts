/**
 * @deepseek-ai/dsh-ant-sword-harness — a security-research profile bundle. Its
 * composition is the `cordis.patch.yml` declared by `dsh.bundle.patch`: the
 * main Cordis row mounts the bundled reverse/CTF skill pack, a dedicated row
 * mounts the self-contained rewind capability, and the patch additionally
 * mounts the UI, agent-teams, and plugin-market bundles.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { syncRedTeamPreset, syncRedTeamAutoPreset } from './preset-sync.ts'
import { applyAutoLoop, AutoLoopConfigSchema } from './auto/index.ts'
import type { AutoLoopConfig } from './auto/index.ts'
import { applyRuntimeStatus } from './runtime-status.ts'
import { applyRuntimeConfigApi } from './runtime-config-api.ts'
import { applyThinkingPolicyApi } from './thinking-policy-api.ts'
import { applyInstallApi } from './installer/api.ts'
import { DEFAULT_MCP_SERVERS, McpServerSchema } from './mcp-servers.ts'
import { applyDynamicRuntime } from './dynamic-runtime.ts'
import { applySkillApi, SkillsReconciler } from './skill-runtime.ts'
import type { McpServerConfig } from './mcp-servers.ts'

/** Cordis plugin name. */
export const name = 'ant-sword-harness'

/** Services required by the bundled skill provider, the auto loop, and MCP tools. */
export const inject = ['skills', 'sessions', 'storageDomain', 'commands', 'tools', 'agents', 'llm', 'webServer', 'subprocess', 'settings', 'systemPrompt']

/**
 * Plugin config. Every tunable lives here — the dsh plugin-config UI renders
 * and edits this schema. Nothing is read from environment variables.
 */
export interface Config {
  /** Auto-loop configuration; omitted mounts the loop with its defaults. */
  autoLoop?: AutoLoopConfig
  /**
   * Embedded offensive-security MCP servers. Omitted mounts the default
   * eight-server catalog; each entry's transport/command/env/url is editable.
   */
  mcpServers?: McpServerConfig[]
  /** Pentest Swarm orchestrator API key, injected into that server's env. */
  pentestswarmApiKey?: string
  /** Sync the bundled presets into the user preset root. Default true. */
  syncRedTeamPreset?: boolean
}

/** Schemastery validation for {@link Config}. */
export const Config: z<Config> = z.object({
  autoLoop: AutoLoopConfigSchema,
  mcpServers: z.array(McpServerSchema).description('内嵌渗透 MCP 服务器列表；每台可用 enabled 单独启停，传输/命令/地址均可改。'),
  pentestswarmApiKey: z.string().role('secret').description('Pentest Swarm 编排器 API key，仅注入该服务器的 env。'),
  syncRedTeamPreset: z.boolean(),
})

/**
 * Mount the bundled skill pack, the auto loop, and the red-team preset.
 * Workspace snapshots and `/rewind` mount through their own row
 * (`./rewind-plugin.ts`); this row mounts no rewind listeners.
 * @param ctx - plugin context carrying skills, sessions, storageDomain, commands.
 * @param config - validated plugin config.
 */
export function apply(ctx: Context, config: Config): void {
  const skillsReconciler = new SkillsReconciler()
  ctx.skills.registerProvider(control => skillsReconciler.provider(control))
  applyAutoLoop(ctx, config.autoLoop ?? {})
  const mcpServers = config.mcpServers === undefined || config.mcpServers.length === 0
    ? DEFAULT_MCP_SERVERS
    : config.mcpServers
  const runtime = applyDynamicRuntime(ctx, mcpServers, config.pentestswarmApiKey, skillsReconciler)
  applyRuntimeStatus(
    ctx,
    () => runtime.controller.snapshot().applied.mcpServers,
    serverName => runtime.mcp.reload(serverName),
    serverName => runtime.mcp.probe(serverName),
    serverName => runtime.mcp.isMounted(serverName),
  )
  applyRuntimeConfigApi(ctx, runtime.controller)
  applyThinkingPolicyApi(ctx, runtime.thinking)
  applyInstallApi(ctx)
  applySkillApi(ctx, skillsReconciler)
  if (config.syncRedTeamPreset ?? true) {
    // Materialize both presets into the harness's writable preset root so the
    // roster discovers them; a sync failure never blocks the composition.
    void syncRedTeamPreset().catch(() => undefined)
    void syncRedTeamAutoPreset().catch(() => undefined)
  }
}
