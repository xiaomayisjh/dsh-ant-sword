import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { RuntimeConfigEditorScope } from './RuntimeConfigEditor.tsx';
export type RuntimeAvailability = 'available' | 'degraded' | 'missing' | 'configured' | 'disabled' | 'pending' | 'unavailable';
export type McpMountState = 'disabled' | 'missing-command' | 'pending' | 'mounting' | 'mounted' | 'failed';
export interface McpRuntimeStatus {
    readonly serverName: string;
    readonly transport: 'stdio' | 'sse' | 'streamable-http';
    readonly availability: RuntimeAvailability;
    readonly mount?: McpMountState;
    readonly toolNames?: readonly string[];
    readonly toolCount?: number;
    readonly lastCall?: {
        readonly at: number;
        readonly ok: boolean;
        readonly error?: string;
    };
    readonly error?: string;
    readonly target: string;
    readonly installCommand?: string;
    readonly installHint: string;
    readonly mounted?: boolean;
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
    readonly runtimeConfig?: {
        readonly generation: number;
        readonly applying: boolean;
        readonly lastFailure?: {
            readonly reconciler: string;
            readonly message: string;
        };
    };
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
export declare function RuntimeStatus({ runtimeStatus, configScope, compact }: RuntimeStatusProps): import("react").JSX.Element;
//# sourceMappingURL=RuntimeStatus.d.ts.map