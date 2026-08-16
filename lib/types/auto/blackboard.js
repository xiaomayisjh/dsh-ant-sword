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
import { randomBytes } from 'node:crypto';
import { Service } from '@deepseek-ai/cordis';
import { blackboardDomain } from "./domain.js";
/** Session event type for a blackboard mutation. */
export const BOARD_CHANGE = 'board/change';
function newNodeId() {
    return randomBytes(8).toString('hex');
}
/**
 * The blackboard: one graph per session, addressed by the session the caller
 * is operating on. Not a model-facing surface — the loop and the UI drive it;
 * the model reaches it through the loop's tools.
 */
export class BlackboardService extends Service {
    static inject = ['storageDomain'];
    domainReady;
    cycles = new Map();
    paused = new Map();
    complete = new Map();
    /**
     * @param ctx - plugin context.
     * @param facility - optional explicit DomainFacility (tests); defaults to
     * the injected `ctx.storageDomain` service.
     */
    constructor(ctx, facility) {
        super(ctx, 'blackboard');
        const source = facility ?? ctx.storageDomain;
        this.domainReady = source.open(blackboardDomain);
        void this.domainReady.catch(() => undefined);
        ctx.effect(async () => {
            const domain = await this.domainReady.catch(() => undefined);
            return () => { void domain?.close(); };
        }, 'ant-sword-blackboard: domain');
    }
    cycleOf(sessionId) {
        return this.cycles.get(sessionId) ?? 0;
    }
    /** All nodes for one session, creation order. */
    async nodes(session) {
        const domain = await this.domainReady;
        const out = [];
        for (const [, node] of domain.table('nodes').entries()) {
            if (node.sessionId === session.id)
                out.push(node);
        }
        return out.sort((a, b) => a.time - b.time);
    }
    /** A consistent point-in-time read of one session's board. */
    async snapshot(session) {
        return {
            nodes: await this.nodes(session),
            cycle: this.cycleOf(session.id),
            paused: this.paused.get(session.id) ?? false,
            complete: this.complete.get(session.id) ?? false,
        };
    }
    /**
     * Append a node, persist it, and publish the change. The single write path
     * for Facts, Intents, Hints, and the Goal node.
     */
    async add(session, input) {
        const node = {
            id: newNodeId(),
            sessionId: session.id,
            kind: input.kind,
            label: input.label,
            ...(input.detail !== undefined ? { detail: input.detail } : {}),
            ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            time: Date.now(),
            cycle: this.cycleOf(session.id),
        };
        const domain = await this.domainReady;
        await domain.table('nodes').put(node.id, node);
        session.append(BOARD_CHANGE, { op: 'add', node });
        const snapshot = await this.snapshot(session);
        this.ctx.emit('board/changed', session, snapshot);
        return node;
    }
    /** Transition an Intent's lifecycle (claim → done/abandoned). */
    async setStatus(session, nodeId, status) {
        const domain = await this.domainReady;
        await domain.table('nodes').update(nodeId, current => ({ ...current, status }));
        session.append(BOARD_CHANGE, { op: 'status', nodeId, status });
        const snapshot = await this.snapshot(session);
        this.ctx.emit('board/changed', session, snapshot);
    }
    /** Advance the OODA cycle index for a session and return the new value. */
    nextCycle(session) {
        const next = this.cycleOf(session.id) + 1;
        this.cycles.set(session.id, next);
        session.append('board/change', { op: 'cycle', cycle: next });
        return next;
    }
    /** Operator pause flag; the loop reads it between cycles. */
    setPaused(session, paused) {
        this.paused.set(session.id, paused);
        session.append('board/change', { op: 'paused', paused });
    }
    isPaused(session) {
        return this.paused.get(session.id) ?? false;
    }
    /** Mark the goal reached; the loop stops scheduling new cycles. */
    markComplete(session) {
        this.complete.set(session.id, true);
        session.append('board/change', { op: 'complete', complete: true });
    }
    isComplete(session) {
        return this.complete.get(session.id) ?? false;
    }
}
/**
 * Projection fold: rebuild the board snapshot by replaying `board/change`
 * events. Projection-grade — plain JSON in/out, same reference when the event
 * is not a board change (the registry's Object.is gate). Every state that the
 * UI renders (nodes, cycle, paused, complete) flows through this one stream.
 */
export function applyBoardProjection(state, event) {
    if (event.type !== 'board/change')
        return state;
    const data = event.data;
    const current = state ?? { nodes: [], cycle: 0, paused: false, complete: false };
    if (data.op === 'add') {
        return { ...current, nodes: [...current.nodes, data.node] };
    }
    if (data.op === 'status') {
        return { ...current, nodes: current.nodes.map(n => n.id === data.nodeId ? { ...n, status: data.status } : n) };
    }
    if (data.op === 'cycle')
        return { ...current, cycle: data.cycle };
    if (data.op === 'paused')
        return { ...current, paused: data.paused };
    return { ...current, complete: data.complete };
}
//# sourceMappingURL=blackboard.js.map