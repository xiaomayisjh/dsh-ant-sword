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
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Session } from '@deepseek-ai/dsh-session';
import type { AutoLoopConfig } from './types.ts';
/** Schemastery validation for {@link AutoLoopConfig}. */
export declare const AutoLoopConfigSchema: z<AutoLoopConfig>;
declare module '@deepseek-ai/cordis' {
    interface Context {
        autoLoop: AutoLoopService;
    }
}
/**
 * Operator-facing control surface for the autonomous loop. The UI control bar
 * drives it through the `/auto` command (pause/resume/hint/status); these
 * methods are deliberately thin over the agent's own cancel/steer primitives
 * plus the blackboard's pause flag.
 */
export declare class AutoLoopService extends Service {
    static inject: string[];
    constructor(ctx: Context);
    /** Pause the loop for a session: halts scheduling after the current step. */
    pause(session: Session): void;
    /** Resume a paused loop by nudging the agent with a continue steer. */
    resume(agent: Agent): void;
    /** Inject an operator Hint mid-run: recorded on the board and steered in. */
    injectHint(agent: Agent, text: string): Promise<void>;
}
/**
 * Mount the autonomous loop: registers the model-facing `board_*` tools, the
 * `ctx.autoLoop` control surface, and the idle-transition driver that advances
 * the OODA cycle. Everything disposes with ctx.
 * @param ctx - plugin context carrying tools, blackboard, and the agent events.
 * @param config - loop configuration; defaults applied per key.
 */
export declare function applyAutoLoop(ctx: Context, config: AutoLoopConfig): void;
//# sourceMappingURL=loop.d.ts.map