/**
 * @deepseek-ai/dsh-ant-sword-harness — a security-research profile bundle. Its
 * composition is the `cordis.patch.yml` declared by `dsh.bundle.patch`: this
 * single Cordis plugin row mounts the bundled reverse/CTF skill pack and the
 * self-contained rewind capability, and the patch additionally mounts the
 * third-party agent-teams and plugin-market bundles.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { skillProvider } from './skills.ts'
import { syncRedTeamPreset, syncRedTeamAutoPreset } from './preset-sync.ts'
import { applyRewind, RewindConfigSchema } from './rewind/index.ts'
import type { RewindPluginConfig } from './rewind/index.ts'
import { applyAutoLoop, AutoLoopConfigSchema } from './auto/index.ts'
import type { AutoLoopConfig } from './auto/index.ts'
import { applyMcpServers, DEFAULT_MCP_SERVERS, McpServerSchema } from './mcp-servers.ts'
import type { McpServerConfig } from './mcp-servers.ts'

/** Cordis plugin name. */
export const name = 'ant-sword-harness'

/** Services required by the bundled skill provider, rewind, the auto loop, and MCP tools. */
export const inject = ['skills', 'sessions', 'storageDomain', 'commands', 'tools', 'agents']

/**
 * Plugin config. Every tunable lives here — the dsh plugin-config UI renders
 * and edits this schema. Nothing is read from environment variables.
 */
export interface Config {
  /** Rewind configuration; omitted mounts rewind with its defaults. */
  rewind?: RewindPluginConfig
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
  rewind: RewindConfigSchema,
  autoLoop: AutoLoopConfigSchema,
  mcpServers: z.array(McpServerSchema).description('内嵌渗透 MCP 服务器列表；每台可用 enabled 单独启停，传输/命令/地址均可改。'),
  pentestswarmApiKey: z.string().role('secret').description('Pentest Swarm 编排器 API key，仅注入该服务器的 env。'),
  syncRedTeamPreset: z.boolean(),
})

/**
 * Mount the bundled skill pack, the rewind capability, and the red-team preset.
 * All register on their owning services and dispose with ctx.
 * @param ctx - plugin context carrying skills, sessions, storageDomain, commands.
 * @param config - validated plugin config.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.skills.registerProvider(() => skillProvider)
  applyRewind(ctx, config.rewind ?? {})
  applyAutoLoop(ctx, config.autoLoop ?? {})
  applyMcpServers(ctx, config.mcpServers ?? DEFAULT_MCP_SERVERS, config.pentestswarmApiKey)
  if (config.syncRedTeamPreset ?? true) {
    // Materialize both presets into the harness's writable preset root so the
    // roster discovers them; a sync failure never blocks the composition.
    void syncRedTeamPreset().catch(() => undefined)
    void syncRedTeamAutoPreset().catch(() => undefined)
  }
}
