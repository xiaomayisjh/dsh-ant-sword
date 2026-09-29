/** Deployment-level runtime status for the red-team bundle. */
import type { Context } from '@deepseek-ai/cordis';
import type { McpReconciler } from './mcp-reconciler.ts';
import type { McpCallObservation, McpMountState } from './mcp-reconciler.ts';
import type { RuntimeController, RuntimeControllerSnapshot } from './runtime-config.ts';
export type RuntimeAvailability = 'available' | 'degraded' | 'missing' | 'configured' | 'disabled' | 'pending' | 'unavailable';
export interface McpRuntimeStatus {
    readonly serverName: string;
    readonly transport: 'stdio' | 'streamable-http';
    readonly availability: RuntimeAvailability;
    readonly mount: McpMountState;
    readonly toolNames: readonly string[];
    readonly toolCount: number;
    readonly mounted: boolean;
    readonly lastProbe?: McpProbeSnapshot;
    readonly initialConnectedAt?: number;
    readonly lastCall?: McpCallObservation;
    readonly error?: string;
    readonly target: string;
    readonly installCommand?: string;
    readonly installHint: string;
}
export interface McpProbeSnapshot {
    readonly checkedAt: number;
    readonly toolCount: number;
    readonly tools: readonly {
        readonly name: string;
        readonly description?: string;
    }[];
}
export interface RedTeamRuntimeStatus {
    readonly checkedAt: number;
    readonly skills: {
        readonly available: number;
        readonly provider: string;
        readonly state: 'ready' | 'error';
        readonly error?: string;
    };
    readonly mcp: readonly McpRuntimeStatus[];
    readonly runtimeConfig: Pick<RuntimeControllerSnapshot, 'generation' | 'applying' | 'lastFailure'>;
}
declare module '@deepseek-ai/cordis' {
    interface Events {
        'ant-sword/runtime-status'(snapshot: RedTeamRuntimeStatus): void;
    }
}
export declare function mcpAvailability(mount: McpMountState, toolCount: number, lastCall?: McpCallObservation): RuntimeAvailability;
export declare function applyRuntimeStatus(ctx: Context, controller: RuntimeController, mcpReconciler: McpReconciler): void;
//# sourceMappingURL=runtime-status.d.ts.map