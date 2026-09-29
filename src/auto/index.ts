/**
 * Autonomous (auto-loop) capability: a Fact/Intent/Hint blackboard plus the
 * OODA controller that grows it toward a goal. `applyAutoLoop` mounts the
 * service and model-facing `board_*` tools. DSH Goal owns continuation;
 * `ctx.autoLoop` is the operator pause/resume/inject surface the Web graph
 * view calls.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/auto
 */

export type * from './types.ts'
export { BlackboardService, applyBoardProjection, BOARD_CHANGE } from './blackboard.ts'
export type { AddNodeInput } from './blackboard.ts'
export { AutoLoopService, applyAutoLoop, AutoLoopConfigSchema } from './loop.ts'
export { ExperienceService, applyExperience, experienceDomain, abstractLessonText } from './experience.ts'
export type { AttemptRecord, LessonRecord, LessonProposal, RecoveryDiagnosis } from './experience.ts'
