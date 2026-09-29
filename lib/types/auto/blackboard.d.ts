/**
 * Session blackboard. Domain writes are durable before their corresponding
 * board/change event is appended to the session projection stream.
 * @module @deepseek-ai/dsh-ant-sword-harness/auto/blackboard
 */
import { Service } from '@deepseek-ai/cordis';
import type { Context } from '@deepseek-ai/cordis';
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
import type { DomainFacility } from '@deepseek-ai/dsh-storage-domain';
import type { BoardNode, BoardNodeKind, BoardRunState, BoardSnapshot, IntentStatus } from './types.ts';
export declare const BOARD_CHANGE = "board/change";
declare module '@deepseek-ai/cordis' {
    interface Context {
        blackboard: BlackboardService;
    }
    interface Events {
        /** Emitted after each committed blackboard mutation, with the owning session. */
        'board/changed'(session: Session, snapshot: BoardSnapshot): void;
    }
}
/** Input accepted by add; the service fills id, creation time, and cycle. */
export interface AddNodeInput {
    readonly kind: BoardNodeKind;
    readonly label: string;
    readonly detail?: string;
    readonly parentId?: string;
    readonly status?: IntentStatus;
}
/** Optional claim identity and duration for a transition to `claimed`. */
export interface ClaimOptions {
    readonly owner?: string;
    readonly leaseMs?: number;
    readonly now?: number;
}
/** One durable graph and controller state per session. */
export declare class BlackboardService extends Service {
    static inject: string[];
    private readonly domainReady;
    /** Serializes validation with writes, including concurrent same-session calls. */
    private mutationTail;
    constructor(ctx: Context, facility?: DomainFacility);
    private static sessionId;
    private enqueue;
    private stateFrom;
    private nodesFrom;
    private snapshotFrom;
    private publish;
    /** All nodes for one session, creation order. */
    nodes(session: Session): Promise<BoardNode[]>;
    /** Durable run state; startedAt is zero until the first cycle begins. */
    runState(session: Session): Promise<BoardRunState>;
    /** A consistent point-in-time read of one session's board. */
    snapshot(session: Session): Promise<BoardSnapshot>;
    /** Add one graph node after validating goal uniqueness and parent ownership. */
    add(session: Session, input: AddNodeInput): Promise<BoardNode>;
    /** Transition an Intent: open -> claimed -> done or abandoned. */
    setStatus(session: Session, nodeId: string, status: IntentStatus, options?: ClaimOptions): Promise<void>;
    private recover;
    /** Explicitly reopen all claims left in flight after a confirmed restart. */
    recoverClaimed(session: Session): Promise<number>;
    /** Reopen only expired claims; older claimed nodes without a lease are stale. */
    recoverExpiredClaims(session: Session, now?: number): Promise<number>;
    /** Archive the current run by advancing its generation in one durable write. */
    resetRun(session: Session): Promise<number>;
    /** Start the wall-clock budget once, before the first admitted Goal round. */
    startRun(session: Session, now?: number): Promise<number>;
    /** Advance to a scheduler-owned cycle without incrementing twice. */
    advanceToCycle(session: Session, target: number): Promise<number>;
    /** Advance the OODA cycle by one. */
    nextCycle(session: Session): Promise<number>;
    /** Persist the operator pause flag. Repeating the same value is a no-op. */
    setPaused(session: Session, paused: boolean): Promise<void>;
    isPaused(session: Session): Promise<boolean>;
    /** Persist completion. Repeated calls remain idempotent across restarts. */
    markComplete(session: Session): Promise<void>;
    isComplete(session: Session): Promise<boolean>;
}
/** Rebuild the Web board projection from session board/change events. */
export declare function applyBoardProjection(state: BoardSnapshot | null, event: SessionEvent): BoardSnapshot | null;
//# sourceMappingURL=blackboard.d.ts.map