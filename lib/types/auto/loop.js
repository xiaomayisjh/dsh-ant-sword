/**
 * OODA loop controller (`applyAutoLoop`): drives the autonomous cycle —
 * Observe the blackboard, Orient to current state, Decide next Intents, Act
 * on the top one — and exposes the operator's pause / resume / inject-hint
 * surface. Concrete execution is delegated to the preset's own tools (shell,
 * subagent, workflow, the eight MCP servers); this controller owns only the
 * loop, the stall detector, and the budget guardrails (CHYing ABANDON-style).
 * The model reaches the board through the registered `board_*` tools; the UI
 * reaches the controller through `ctx.autoLoop`.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/auto/loop
 */
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { z as zod } from 'zod';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { BlackboardService, applyBoardProjection } from "./blackboard.js";
/** Schemastery validation for {@link AutoLoopConfig}. */
export const AutoLoopConfigSchema = z.object({
    enabled: z.boolean(),
    maxCycles: z.number(),
    stallThreshold: z.number(),
    maxDurationMs: z.number(),
});
function resolveConfig(config) {
    return {
        enabled: config.enabled ?? true,
        maxCycles: config.maxCycles ?? 64,
        stallThreshold: config.stallThreshold ?? 3,
        maxDurationMs: config.maxDurationMs ?? 30 * 60 * 1000,
    };
}
/**
 * Operator-facing control surface for the autonomous loop. The UI control bar
 * drives it through the `/auto` command (pause/resume/hint/status); these
 * methods are deliberately thin over the agent's own cancel/steer primitives
 * plus the blackboard's pause flag.
 */
export class AutoLoopService extends Service {
    static inject = ['blackboard'];
    constructor(ctx) {
        super(ctx, 'autoLoop');
    }
    /** Pause the loop for a session: halts scheduling after the current step. */
    pause(session) {
        this.ctx.blackboard.setPaused(session, true);
    }
    /** Resume a paused loop by nudging the agent with a continue steer. */
    resume(agent) {
        this.ctx.blackboard.setPaused(agent.session, false);
        agent.steer(createUserMessage({
            content: [{ type: 'text', text: '[auto-loop] Operator resumed. Continue the autonomous loop: read the blackboard, then act on the highest-priority open Intent.' }],
            source: { kind: 'plugin', plugin: 'auto-loop' },
        }));
    }
    /** Inject an operator Hint mid-run: recorded on the board and steered in. */
    async injectHint(agent, text) {
        await this.ctx.blackboard.add(agent.session, { kind: 'hint', label: text });
        agent.steer(createUserMessage({
            content: [{ type: 'text', text: `[auto-loop] Operator hint: ${text}\nAbsorb this into your next Observe/Orient pass and re-plan Intents accordingly.` }],
            source: { kind: 'plugin', plugin: 'auto-loop' },
        }));
    }
}
function blackboardOf(ctx) {
    const service = ctx.get('blackboard');
    if (service === undefined)
        throw new Error('auto-loop: blackboard service is unavailable');
    return service;
}
function autoLoopOf(ctx) {
    const service = ctx.get('autoLoop');
    if (service === undefined)
        throw new Error('auto-loop: controller service is unavailable');
    return service;
}
/** Register the `/auto` operator command: the UI control bar's channel. */
function registerAutoCommand(ctx) {
    ctx.commands.register({
        name: 'auto',
        description: 'Control the autonomous loop: /auto pause | resume | hint <text> | status',
        input: { hint: '[pause | resume | hint <text> | status]' },
        handler: async (invocation) => {
            const agent = invocation.agent;
            const board = blackboardOf(ctx);
            const loop = autoLoopOf(ctx);
            const arg = invocation.rawInput.trim();
            if (arg === 'pause') {
                loop.pause(agent.session);
                return { kind: 'success', text: 'auto-loop: paused. The run halts after the current step. Resume with "/auto resume".' };
            }
            if (arg === 'resume') {
                loop.resume(agent);
                return { kind: 'success', text: 'auto-loop: resumed.' };
            }
            if (arg.startsWith('hint ')) {
                const text = arg.slice('hint '.length).trim();
                if (text.length === 0)
                    return { kind: 'error', text: 'auto-loop: "/auto hint <text>" needs hint text.' };
                await loop.injectHint(agent, text);
                return { kind: 'success', text: `auto-loop: hint injected — ${text}` };
            }
            if (arg === 'status') {
                const snap = await board.snapshot(agent.session);
                return {
                    kind: 'success',
                    text: `auto-loop: cycle ${snap.cycle}, ${snap.nodes.length} node(s), paused=${snap.paused}, complete=${snap.complete}`,
                };
            }
            return { kind: 'error', text: 'auto-loop: unknown subcommand. Use pause | resume | hint <text> | status.' };
        },
    });
}
/**
 * Mount the autonomous loop: registers the model-facing `board_*` tools, the
 * `ctx.autoLoop` control surface, and the idle-transition driver that advances
 * the OODA cycle. Everything disposes with ctx.
 * @param ctx - plugin context carrying tools, blackboard, and the agent events.
 * @param config - loop configuration; defaults applied per key.
 */
export function applyAutoLoop(ctx, config) {
    const resolved = resolveConfig(config);
    if (!resolved.enabled)
        return;
    ctx.plugin(BlackboardService);
    ctx.plugin(AutoLoopService);
    registerAutoCommand(ctx);
    // The `board` projection unit: last-wins fold of board/change events into
    // the graph the Web view renders. Activates only when a projection registry
    // is composed (headless assemblies stay unaffected).
    const boardProjectionSchema = zod.union([
        zod.object({
            nodes: zod.array(zod.object({
                id: zod.string(), sessionId: zod.string(),
                kind: zod.enum(['fact', 'intent', 'hint', 'goal']),
                label: zod.string(), detail: zod.string().optional(),
                parentId: zod.string().optional(),
                status: zod.enum(['open', 'claimed', 'done', 'abandoned']).optional(),
                time: zod.number(), cycle: zod.number(),
            })),
            cycle: zod.number(), paused: zod.boolean(), complete: zod.boolean(),
        }),
        zod.null(),
    ]);
    ctx.inject(['sessionProjections'], (projectionCtx) => {
        projectionCtx.sessionProjections.register({
            key: 'board',
            schema: boardProjectionSchema,
            init: () => null,
            apply: applyBoardProjection,
            view: state => state,
            stateVersion: 1,
        });
    });
    const loops = new Map();
    const stateOf = (sessionId) => {
        let s = loops.get(sessionId);
        if (s === undefined) {
            s = { startedAt: Date.now(), recentSignatures: [] };
            loops.set(sessionId, s);
        }
        return s;
    };
    const board = () => blackboardOf(ctx);
    // ── model-facing board tools ─────────────────────────────────────────────
    ctx.tools.register(defineTool({
        name: 'board_write',
        description: 'Write a node to the engagement blackboard (the shared Fact/Intent/Hint graph that drives this autonomous run). '
            + 'Write a `fact` for every confirmed, objective finding (open port, credential, version, reachable path). '
            + 'Write an `intent` for each direction of exploration you decide to pursue next. '
            + 'Write the single `goal` node once, at bootstrap, to fix the target state. '
            + 'Link each node to the node it derives from via parentId so the graph grows origin → goal.',
        parameters: {
            kind: { type: 'string', required: true, enum: ['fact', 'intent', 'goal'], description: 'fact=confirmed finding, intent=next exploration, goal=target state (write once).' },
            label: { type: 'string', required: true, description: 'One-line summary of the node.' },
            detail: { type: 'string', description: 'Supporting evidence or payload, optional.' },
            parentId: { type: 'string', description: 'Id of the node this derives from; omit for the origin.' },
        },
        output: {
            schema: {
                type: 'object', additionalProperties: false,
                properties: { id: { type: 'string', required: true }, cycle: { type: 'integer', required: true } },
            },
            render: (_args, value) => [{ type: 'text', text: `blackboard: wrote node ${value.id} (cycle ${value.cycle})` }],
        },
        async execute(args, exec) {
            if (!exec.agent)
                throw new Error('board_write requires an owning agent session');
            const node = await board().add(exec.agent.session, {
                kind: args.kind, label: args.label,
                ...(args.detail !== undefined ? { detail: args.detail } : {}),
                ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
                ...(args.kind === 'intent' ? { status: 'open' } : {}),
            });
            return { id: node.id, cycle: node.cycle };
        },
    }));
    ctx.tools.register(defineTool({
        name: 'board_read',
        description: 'Read the current blackboard: every Fact, open Intent, Hint, and the Goal, with the loop cycle and pause/complete flags. '
            + 'Call this at the start of each Observe pass before deciding what to do next.',
        parameters: {},
        output: {
            schema: { type: 'object', additionalProperties: false, properties: { summary: { type: 'string', required: true } } },
            render: (_args, value) => [{ type: 'text', text: value.summary }],
        },
        async execute(_args, exec) {
            if (!exec.agent)
                throw new Error('board_read requires an owning agent session');
            const snap = await board().snapshot(exec.agent.session);
            const lines = snap.nodes.map(n => `#${n.id} [${n.kind}${n.status !== undefined ? `/${n.status}` : ''}] (cycle ${n.cycle}) ${n.label}${n.parentId !== undefined ? ` <- ${n.parentId}` : ''}`);
            return {
                summary: [
                    `blackboard: ${snap.nodes.length} node(s), cycle ${snap.cycle}, paused=${snap.paused}, complete=${snap.complete}`,
                    ...lines,
                ].join('\n'),
            };
        },
    }));
    ctx.tools.register(defineTool({
        name: 'board_transition',
        description: 'Transition an Intent you own: `claimed` when you start executing it, `done` when it produced its Fact, `abandoned` when it is a proven dead end. '
            + 'Always close an Intent you claimed — an abandoned Intent must be followed by deciding a DIFFERENT direction, never retrying the same one.',
        parameters: {
            nodeId: { type: 'string', required: true, description: 'Id of the Intent node.' },
            status: { type: 'string', required: true, enum: ['claimed', 'done', 'abandoned'], description: 'New lifecycle state.' },
        },
        output: {
            schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true } } },
            render: (_args, value) => [{ type: 'text', text: value.ok ? 'blackboard: intent transitioned' : 'blackboard: no-op' }],
        },
        async execute(args, exec) {
            if (!exec.agent)
                throw new Error('board_transition requires an owning agent session');
            await board().setStatus(exec.agent.session, args.nodeId, args.status);
            return { ok: true };
        },
    }));
    ctx.tools.register(defineTool({
        name: 'board_complete',
        description: 'Mark the engagement goal reached. Call only when you hold evidence the Goal node is satisfied; this stops the autonomous loop.',
        parameters: {
            evidence: { type: 'string', required: true, description: 'Why the goal is met (flag, shell, access proof).' },
        },
        output: {
            schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true } } },
            render: (_args, value) => [{ type: 'text', text: value.ok ? 'blackboard: goal marked complete — loop stops' : 'blackboard: no-op' }],
        },
        async execute(args, exec) {
            if (!exec.agent)
                throw new Error('board_complete requires an owning agent session');
            board().markComplete(exec.agent.session);
            await board().add(exec.agent.session, { kind: 'fact', label: 'GOAL MET', detail: args.evidence });
            return { ok: true };
        },
    }));
    // ── loop driver: advance one OODA cycle when the agent goes idle ──────────
    ctx.on('agent/status', ({ agent, status }) => {
        if (status !== 'idle')
            return;
        void (async () => {
            const session = agent.session;
            if (board().isPaused(session) || board().isComplete(session))
                return;
            const state = stateOf(session.id);
            const snap = await board().snapshot(session);
            if (snap.cycle >= resolved.maxCycles)
                return;
            if (Date.now() - state.startedAt > resolved.maxDurationMs)
                return;
            if (snap.nodes.length === 0)
                return; // not bootstrapped; wait for first operator prompt
            const cycle = board().nextCycle(session);
            const open = snap.nodes.filter(n => n.kind === 'intent' && (n.status === 'open' || n.status === undefined));
            const top = open.at(-1);
            const prompt = top !== undefined
                ? `[auto-loop] OODA cycle ${cycle}. Act on Intent #${top.id}: "${top.label}". Claim it (board_transition), execute it with your tools, write the resulting Fact (board_write), then close it. If it proves a dead end, abandon it and decide a different direction.`
                : `[auto-loop] OODA cycle ${cycle}. No open Intents. Observe the blackboard (board_read), Orient, and Decide your next Intents (board_write kind=intent). If the Goal is met, call board_complete.`;
            agent.steer(createUserMessage({
                content: [{ type: 'text', text: prompt }],
                source: { kind: 'plugin', plugin: 'auto-loop' },
            }));
        })();
    });
    // ── stall detector: flag a repeated equivalent Intent (ABANDON-style) ─────
    ctx.on('tools/post-execute', async (exec, _result, next) => {
        const agent = exec.agent;
        if (agent !== undefined) {
            const state = stateOf(agent.session.id);
            state.recentSignatures.push(exec.name);
            if (state.recentSignatures.length > resolved.stallThreshold)
                state.recentSignatures.shift();
            const allSame = state.recentSignatures.length === resolved.stallThreshold
                && state.recentSignatures.every(s => s === state.recentSignatures[0]);
            if (allSame && !board().isPaused(agent.session)) {
                agent.steer(createUserMessage({
                    content: [{ type: 'text', text: `[auto-loop] STALL detected: the same operation ran ${resolved.stallThreshold} times in a row. That path is a proven dead end. Abandon the current Intent (board_transition status=abandoned) and decide a COMPLETELY different direction.` }],
                    source: { kind: 'plugin', plugin: 'auto-loop' },
                }));
                state.recentSignatures = [];
            }
        }
        return next();
    }, { global: true });
}
//# sourceMappingURL=loop.js.map