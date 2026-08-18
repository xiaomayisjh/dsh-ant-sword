import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { RuntimeConfigEditorScope } from './RuntimeConfigEditor.tsx';
export type RuntimeAvailability = 'available' | 'missing' | 'configured' | 'disabled';
export interface McpRuntimeStatus {
    readonly serverName: string;
    readonly transport: 'stdio' | 'sse' | 'streamable-http';
    readonly availability: RuntimeAvailability;
    readonly target: string;
    readonly installCommand?: string;
    readonly installHint: string;
    readonly mounted: boolean;
    readonly lastProbe?: {
        readonly checkedAt: number;
        readonly toolCount: number;
        readonly tools: readonly {
            readonly name: string;
            readonly description?: string;
        }[];
    };
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
export interface RuntimeStatusProps {
    readonly runtimeStatus: SnapshotStore<RedTeamRuntimeStatus>;
    readonly configScope?: RuntimeConfigEditorScope;
    readonly compact?: boolean;
}
export declare const INITIAL_RUNTIME_STATUS: RedTeamRuntimeStatus;
export declare function RuntimeStatus({ runtimeStatus, configScope, compact }: RuntimeStatusProps): any;
//# sourceMappingURL=RuntimeStatus.d.ts.map