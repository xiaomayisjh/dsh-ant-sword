/**
 * Blackboard service (`ctx.blackboard`): the Fact/Intent/Hint graph the
 * autonomous loop grows. Built only on forward-stable public primitives —
 * `ctx.storageDomain` for durability, `session.append` for the model- and
 * UI-visible event stream, and the `session/projection` registry so the Web
 * graph view folds the same events live. Every mutation appends a
 * `board/change` event and emits `board/changed`, keeping the durable store,
 * the session log, and the UI projection on one authoritative write path.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/auto/blackboard
 */
import { Service } from '@deepseek-ai/cordis';
import type { Context } from '@deepseek-ai/cordis';
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
import type { DomainFacility } from '@deepseek-ai/dsh-storage-domain';
import type { BoardNode, BoardNodeKind, BoardSnapshot, IntentStatus } from './types.ts';
/** Session event type for a blackboard mutation. */
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
/** Input accepted by {@link BlackboardService.add}; the service fills id/time/cycle. */
export interface AddNodeInput {
    readonly kind: BoardNodeKind;
    readonly label: string;
    readonly detail?: string;
    readonly parentId?: string;
    readonly status?: IntentStatus;
}
/**
 * The blackboard: one graph per session, addressed by the session the caller
 * is operating on. Not a model-facing surface — the loop and the UI drive it;
 * the model reaches it through the loop's tools.
 */
export declare class BlackboardService extends Service {
    static inject: string[];
    private readonly domainReady;
    private readonly cycles;
    private readonly paused;
    private readonly complete;
    /**
     * @param ctx - plugin context.
     * @param facility - optional explicit DomainFacility (tests); defaults to
     * the injected `ctx.storageDomain` service.
     */
    constructor(ctx: Context, facility?: DomainFacility);
    private cycleOf;
    /** All nodes for one session, creation order. */
    nodes(session: Session): Promise<BoardNode[]>;
    /** A consistent point-in-time read of one session's board. */
    snapshot(session: Session): Promise<BoardSnapshot>;
    /**
     * Append a node, persist it, and publish the change. The single write path
     * for Facts, Intents, Hints, and the Goal node.
     */
    add(session: Session, input: AddNodeInput): Promise<BoardNode>;
    /** Transition an Intent's lifecycle (claim → done/abandoned). */
    setStatus(session: Session, nodeId: string, status: IntentStatus): Promise<void>;
    /** Advance the OODA cycle index for a session and return the new value. */
    nextCycle(session: Session): number;
    /** Operator pause flag; the loop reads it between cycles. */
    setPaused(session: Session, paused: boolean): void;
    isPaused(session: Session): boolean;
    /** Mark the goal reached; the loop stops scheduling new cycles. */
    markComplete(session: Session): void;
    isComplete(session: Session): boolean;
}
/**
 * Projection fold: rebuild the board snapshot by replaying `board/change`
 * events. Projection-grade — plain JSON in/out, same reference when the event
 * is not a board change (the registry's Object.is gate). Every state that the
 * UI renders (nodes, cycle, paused, complete) flows through this one stream.
 */
export declare function applyBoardProjection(state: BoardSnapshot | null, event: SessionEvent): BoardSnapshot | null;
//# sourceMappingURL=blackboard.d.ts.map