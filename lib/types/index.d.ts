/**
 * @deepseek-ai/dsh-ant-sword-harness — a security-research profile bundle. Its
 * composition is the `cordis.patch.yml` declared by `dsh.bundle.patch`: this
 * single Cordis plugin row mounts the bundled reverse/CTF skill pack and the
 * self-contained rewind capability, and the patch additionally mounts the
 * third-party agent-teams and plugin-market bundles.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { RewindPluginConfig } from './rewind/index.ts';
import type { AutoLoopConfig } from './auto/index.ts';
import type { McpServerConfig } from './mcp-servers.ts';
/** Cordis plugin name. */
export declare const name = "ant-sword-harness";
/** Services required by the bundled skill provider, rewind, the auto loop, and MCP tools. */
export declare const inject: string[];
/**
 * Plugin config. Every tunable lives here — the dsh plugin-config UI renders
 * and edits this schema. Nothing is read from environment variables.
 */
export interface Config {
    /** Rewind configuration; omitted mounts rewind with its defaults. */
    rewind?: RewindPluginConfig;
    /** Auto-loop configuration; omitted mounts the loop with its defaults. */
    autoLoop?: AutoLoopConfig;
    /**
     * Embedded offensive-security MCP servers. Omitted mounts the default
     * eight-server catalog; each entry's transport/command/env/url is editable.
     */
    mcpServers?: McpServerConfig[];
    /** Pentest Swarm orchestrator API key, injected into that server's env. */
    pentestswarmApiKey?: string;
    /** Sync the bundled presets into the user preset root. Default true. */
    syncRedTeamPreset?: boolean;
}
/** Schemastery validation for {@link Config}. */
export declare const Config: z<Config>;
/**
 * Mount the bundled skill pack, the rewind capability, and the red-team preset.
 * All register on their owning services and dispose with ctx.
 * @param ctx - plugin context carrying skills, sessions, storageDomain, commands.
 * @param config - validated plugin config.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map