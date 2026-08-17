/** Deployment-level runtime status for the red-team bundle. */
import type { Context } from '@deepseek-ai/cordis';
import type { McpServerConfig } from './mcp-servers.ts';
export type RuntimeAvailability = 'available' | 'missing' | 'configured' | 'disabled';
export interface McpProbeSnapshot {
    readonly checkedAt: number;
    readonly toolCount: number;
    readonly tools: readonly {
        readonly name: string;
        readonly description?: string;
    }[];
}
export interface McpRuntimeStatus {
    readonly serverName: string;
    readonly transport: 'stdio' | 'sse' | 'streamable-http';
    readonly availability: RuntimeAvailability;
    readonly target: string;
    readonly installCommand?: string;
    readonly installHint: string;
    readonly mounted: boolean;
    readonly lastProbe?: McpProbeSnapshot;
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
}
declare module '@deepseek-ai/cordis' {
    interface Events {
        /**
         * Publishes the latest Ant Sword skill and MCP availability snapshot.
         * @mode emit
         * @param snapshot - Complete runtime status observed by WebUI consumers.
         */
        'ant-sword/runtime-status'(snapshot: RedTeamRuntimeStatus): void;
    }
}
export declare function applyRuntimeStatus(ctx: Context, getServers: () => readonly McpServerConfig[], reloadMcp: (serverName: string) => Promise<void>, probeMcp: (serverName: string) => Promise<{
    toolCount: number;
    tools: readonly {
        name: string;
        description?: string;
    }[];
}>, isMcpMounted: (serverName: string) => boolean): void;
//# sourceMappingURL=runtime-status.d.ts.map