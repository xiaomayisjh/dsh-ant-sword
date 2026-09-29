/** Dynamic MCP fiber reconciliation for committed runtime settings. */
import type { Context } from '@deepseek-ai/cordis';
import type { McpServerConfig } from './mcp-servers.ts';
import type { AntSwordRuntimeConfig, RuntimePreparedChange, RuntimeReconciler } from './runtime-config.ts';
export type McpMountState = 'disabled' | 'missing-command' | 'pending' | 'mounting' | 'mounted' | 'failed';
export interface McpCallObservation {
    readonly at: number;
    readonly ok: boolean;
    readonly error?: string;
}
/** Facts the bundle can observe without guessing at the MCP client's private reconnect state. */
export interface McpMountSnapshot {
    readonly serverName: string;
    readonly mount: McpMountState;
    readonly toolNames: readonly string[];
    readonly initialConnectedAt?: number;
    readonly lastCall?: McpCallObservation;
    readonly error?: string;
}
export declare class McpReconciler implements RuntimeReconciler {
    private readonly ctx;
    private readonly getPentestswarmApiKey;
    private readonly canResolveCommand;
    readonly name = "mcp";
    private readonly fibers;
    private readonly mounting;
    private readonly initiallyConnected;
    private readonly lastCalls;
    private readonly failures;
    private configs;
    private currentApiKey;
    /** Serializes HTTP reloads with Loader-driven config commits. */
    private tail;
    constructor(ctx: Context, getPentestswarmApiKey?: () => string | undefined, canResolveCommand?: (command: string) => boolean);
    /** Current mount and callable-tool evidence for the committed server list. */
    statusFor(servers: readonly McpServerConfig[]): readonly McpMountSnapshot[];
    isMounted(serverName: string): boolean;
    private enqueue;
    /** Reconnect one configured server without changing its persisted settings. */
    reload(serverName: string): Promise<void>;
    /** Read the mounted tool catalog for the legacy UI probe endpoint. */
    probe(serverName: string): Promise<{
        toolCount: number;
        tools: readonly {
            name: string;
            description?: string;
        }[];
    }>;
    prepare(next: AntSwordRuntimeConfig, _previousConfig: AntSwordRuntimeConfig): RuntimePreparedChange;
}
//# sourceMappingURL=mcp-reconciler.d.ts.map