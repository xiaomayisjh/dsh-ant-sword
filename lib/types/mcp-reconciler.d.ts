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
    private configs;
    constructor(ctx: Context, pentestswarmApiKey?: string | undefined, canResolveCommand?: (command: string) => boolean);
    /** Whether one server currently owns an active plugin fiber. */
    isMounted(serverName: string): boolean;
    /** Probe one server without replacing its live tool registrations. */
    probe(serverName: string): Promise<mcpClient.McpProbeResult>;
    /** Force one configured server through a dispose/connect cycle. */
    reload(serverName: string): Promise<void>;
    prepare(next: AntSwordRuntimeConfig, _previousConfig: AntSwordRuntimeConfig): RuntimePreparedChange;
}
//# sourceMappingURL=mcp-reconciler.d.ts.map