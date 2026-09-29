/**
 * The autonomous preset's Fact/Intent/Hint board and operator controls.
 * DSH Goal owns continuation and round limits; this plugin only keeps the
 * board in sync with admitted goal rounds and enforces its wall-clock budget.
 * The model reaches the board through `board_*`; the UI uses `ctx.autoLoop`.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/auto/loop
 */
import { Service } from '@deepseek-ai/cordis';
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { AutoLoopConfig } from './types.ts';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'auto-loop': {
            kind: 'auto-loop';
        };
    }
}
/** Schemastery validation for {@link AutoLoopConfig}. */
export declare const AutoLoopConfigSchema: z<AutoLoopConfig>;
declare module '@deepseek-ai/cordis' {
    interface Context {
        autoLoop: AutoLoopService;
    }
}
/**
 * Operator-facing control surface. GoalService owns pause and resume; the
 * board's flag mirrors that durable lifecycle for the graph view.
 */
export declare class AutoLoopService extends Service {
    static inject: string[];
    constructor(ctx: Context);
    /** Pause the current DSH Goal, then update the board view. */
    pause(agent: Agent): Promise<void>;
    /** Rearm the current DSH Goal; its round driver schedules the next turn. */
    resume(agent: Agent): Promise<void>;
    /** Persist a Hint and place it in the next admitted step without waking work. */
    injectHint(agent: Agent, text: string): Promise<void>;
}
/**
 * Mount model-facing board tools, operator controls, and one Goal budget guard.
 * DSH goal-round-driver is the sole continuation scheduler.
 * @param ctx - plugin context carrying tools, blackboard, and the agent events.
 * @param config - loop configuration; defaults applied per key.
 */
export declare function applyAutoLoop(ctx: Context, config: AutoLoopConfig): void;
//# sourceMappingURL=loop.d.ts.map