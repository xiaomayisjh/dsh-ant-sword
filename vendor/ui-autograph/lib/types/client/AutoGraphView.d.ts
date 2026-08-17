/**
 * AutoGraphView: the live decision-graph panel for an autonomous (red-team-auto)
 * run. It folds the `board` session projection into React Flow nodes/edges —
 * a node per Fact/Intent/Hint/Goal, an edge from each node to the node it
 * derives from — and renders the operator's control bar (Pause / Resume /
 * Inject-hint) wired to the injected verbs. Live state arrives as the
 * projected whole snapshot; the panel renders nothing when the session has no
 * blackboard (capability absent / not an autonomous run).
 */
import type { Edge } from '@xyflow/react';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { RedTeamRuntimeStatus } from './RuntimeStatus.tsx';
import { type BoardFlowNode } from './BoardGraphNode.tsx';
import type { BoardSnapshot } from './board.ts';
/** Operator verbs the panel's control bar invokes (injected by the plugin). */
export interface AutoGraphActions {
    /** Shared deployment-level Skill/MCP status source. */
    runtimeStatus: SnapshotStore<RedTeamRuntimeStatus>;
    /** Whether the session was composed from the autonomous red-team preset. */
    isAutoMode: boolean;
    /** Pause the loop after the current step. */
    onPause: () => Promise<string | null>;
    /** Resume a paused loop. */
    onResume: () => Promise<string | null>;
    /** Inject an operator hint mid-run. */
    onHint: (text: string) => Promise<string | null>;
}
export interface AutoGraphViewProps extends AutoGraphActions {
    /** Current board snapshot; undefined = loading, null = no board (renders nothing). */
    board: BoardSnapshot | null | undefined;
}
/** Lay out each block kind in a fixed column and give sibling edges separate lanes. */
export declare function toFlow(board: BoardSnapshot): {
    nodes: BoardFlowNode[];
    edges: Edge[];
};
export declare function AutoGraphView({ isAutoMode, runtimeStatus, onPause, onResume, onHint, useProjection, t }: ConvViewProps & AutoGraphActions & PropsLocale<'autograph'>): import("react").JSX.Element | null;
//# sourceMappingURL=AutoGraphView.d.ts.map