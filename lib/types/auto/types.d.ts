/**
 * Shared types for the autonomous (auto-loop) capability: a Fact/Intent/Hint
 * blackboard graph (Cairn-style) that an OODA loop grows from an origin toward
 * a goal, plus the controller's pause/resume/inject surface. Types only — no
 * runtime code.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/auto/types
 */
/** The three blackboard node kinds plus the terminal goal marker. */
export type BoardNodeKind = 'fact' | 'intent' | 'hint' | 'goal';
/** Lifecycle of an Intent node; facts and hints are terminal once written. */
export type IntentStatus = 'open' | 'claimed' | 'done' | 'abandoned';
/** A bounded claim on an Intent; expiry allows recovery after an interrupted turn. */
export interface IntentClaim {
    readonly owner: string;
    readonly leaseUntil: number;
}
/**
 * One node on the blackboard. A Fact is a confirmed, objective finding; an
 * Intent is a declared direction of exploration not yet executed; a Hint is
 * operator judgment injected at any time; the single Goal node is the target
 * the graph grows toward. `parentId` links a node to the node it derived
 * from, forming the origin → goal edges.
 */
export interface BoardNode {
    /** Unique node id (hex). */
    readonly id: string;
    /** Session that owns this board. */
    readonly sessionId: string;
    /** Board run generation; omitted on nodes from the original run. */
    readonly generation?: number;
    /** Node kind. */
    readonly kind: BoardNodeKind;
    /** Human-facing summary (one line). */
    readonly label: string;
    /** Supporting detail / evidence payload, when present. */
    readonly detail?: string;
    /** The node this one derives from; undefined for the origin node. */
    readonly parentId?: string;
    /** Intent lifecycle; undefined for non-intent kinds. */
    readonly status?: IntentStatus;
    /** Active claim metadata, present only while an Intent is claimed. */
    readonly claim?: IntentClaim;
    /** Monotonic creation time (ms since epoch). */
    readonly time: number;
    /** OODA cycle index that produced this node. */
    readonly cycle: number;
}
/** A point-in-time read of the whole board (the graph the UI renders). */
export interface BoardSnapshot {
    /** All nodes, creation order. */
    readonly nodes: readonly BoardNode[];
    /** Current OODA cycle index. */
    readonly cycle: number;
    /** Whether the loop is currently paused by the operator. */
    readonly paused: boolean;
    /** Whether the goal has been reached. */
    readonly complete: boolean;
}
/** Durable controller state for one session. A zero start means no cycle has run. */
export interface BoardRunState {
    readonly sessionId: string;
    /** Incremented when a completed DSH Goal is replaced in this session. */
    readonly generation?: number;
    readonly cycle: number;
    readonly paused: boolean;
    readonly complete: boolean;
    readonly startedAt: number;
}
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionStateMap {
        board: BoardSnapshot | null;
    }
    interface SessionProjectionMap {
        /**
         * The session's autonomous-loop blackboard graph (every Fact/Intent/Hint
         * node plus cycle/pause/complete flags), folded live from `board/change`
         * events. `null` before the first board write.
         */
        board: BoardSnapshot | null;
    }
}
/** Plugin configuration for the auto-loop controller. All keys optional. */
export interface AutoLoopConfig {
    /** Master switch; `false` removes the loop and tools. Default true. */
    readonly enabled?: boolean;
    /** DSH Goal round cap requested at autonomous Goal creation. Default 64. */
    readonly maxCycles?: number;
    /**
     * Model guidance threshold for equivalent attempts without evidence. Default 3.
     */
    readonly stallThreshold?: number;
    /** Wall-clock budget checked before each new DSH Goal round. Default 30 min. */
    readonly maxDurationMs?: number;
}
/** Resolved configuration with every default applied. */
export interface ResolvedAutoLoopConfig {
    readonly enabled: boolean;
    readonly maxCycles: number;
    readonly stallThreshold: number;
    readonly maxDurationMs: number;
}
//# sourceMappingURL=types.d.ts.map