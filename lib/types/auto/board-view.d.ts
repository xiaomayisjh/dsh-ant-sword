/** Bounded model-facing views of the durable blackboard. */
import type { BoardSnapshot } from './types.ts';
export interface BoardViewBudget {
    readonly boardChars: number;
    readonly evidenceChars: number;
    readonly contextTier: 'compact' | 'standard' | 'wide';
}
export interface BoardReadRequest {
    /** Decimal offset for a chronological page. Omit for a priority overview. */
    readonly cursor?: string;
    /** Retrieve one node, including a chunk of its full detail. */
    readonly nodeId?: string;
    /** Character offset into one node's detail. */
    readonly detailOffset?: number;
}
export interface BoardReadResult {
    readonly summary: string;
    readonly nextCursor?: string;
    readonly nextDetailOffset?: number;
}
/** Preserve important live decisions while bounding output for small windows. */
export declare function readBoard(snapshot: BoardSnapshot, request: BoardReadRequest, budget: BoardViewBudget): BoardReadResult;
//# sourceMappingURL=board-view.d.ts.map