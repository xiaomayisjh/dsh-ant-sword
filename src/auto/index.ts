/**
 * Autonomous (auto-loop) capability: a Fact/Intent/Hint blackboard plus the
 * OODA controller that grows it toward a goal. `applyAutoLoop` mounts the
 * service, the model-facing `board_*` tools, the idle-transition driver, and
 * the stall detector; `ctx.autoLoop` is the operator pause/resume/inject
 * surface the Web graph view calls.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/auto
 */

export type * from './types.ts'
export { BlackboardService, applyBoardProjection, BOARD_CHANGE } from './blackboard.ts'
export type { AddNodeInput } from './blackboard.ts'
export { AutoLoopService, applyAutoLoop, AutoLoopConfigSchema } from './loop.ts'
