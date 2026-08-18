/** Dynamic MCP fiber reconciliation for committed runtime settings. */
import type { Context } from '@deepseek-ai/cordis';
import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
import type { AntSwordRuntimeConfig, RuntimePreparedChange, RuntimeReconciler } from './runtime-config.ts';
export declare class McpReconciler implements RuntimeReconciler {
    private readonly ctx;
    private readonly pentestswarmApiKey?;
    private readonly canResolveCommand;
    readonly name = "mcp";
    private readonly fibers;
    /** Only successfully committed configurations are kept here. */
    private configs;
    /** Serializes every lifecycle operation, including API probe/reload calls. */
    private tail;
    constructor(ctx: Context, pentestswarmApiKey?: string | undefined, canResolveCommand?: (command: string) => boolean);
    isMounted(serverName: string): boolean;
    private enqueue;
    private assertUsable;
    private mount;
    /** Probe the applied server configuration, serialized with lifecycle changes. */
    probe(serverName: string): Promise<mcpClient.McpProbeResult>;
    /** Reload an applied server without losing its previous live fiber on failure. */
    reload(serverName: string): Promise<void>;
    prepare(next: AntSwordRuntimeConfig, _previousConfig: AntSwordRuntimeConfig): RuntimePreparedChange;
}
//# sourceMappingURL=mcp-reconciler.d.ts.map