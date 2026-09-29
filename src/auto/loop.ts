/**
 * The autonomous preset's Fact/Intent/Hint board and operator controls.
 * DSH Goal owns continuation and round limits; this plugin only keeps the
 * board in sync with admitted goal rounds and enforces its wall-clock budget.
 * The model reaches the board through `board_*`; the UI uses `ctx.autoLoop`.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/auto/loop
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import type { ZodType } from 'zod'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { PreToolDecision } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-goal'
// Type-only: resolves ctx.sessionProjections for the optional unit child.
import type {} from '@deepseek-ai/dsh-session-projection'
import { BlackboardService, applyBoardProjection } from './blackboard.ts'
import { readBoard } from './board-view.ts'
import type { ModelAdaptationProfile } from './model-adaptation.ts'
import type { AutoLoopConfig, BoardSnapshot, ResolvedAutoLoopConfig } from './types.ts'
import { isAutoPreset } from './preset.ts'

const COMPACT_PROFILE: ModelAdaptationProfile = {
  contextTier: 'compact', reasoningMode: 'balanced', boardChars: 2_000,
  evidenceChars: 500, lessonCount: 2,
}

function reasoningGuidance(mode: ModelAdaptationProfile['reasoningMode']): string {
  if (mode === 'guided') return 'Use one testable Intent at a time; observe each result before the next tool call.'
  if (mode === 'deep') return 'Compare competing hypotheses and prerequisite chains before selecting the next Intent.'
  return 'Compare plausible routes briefly, then pursue the strongest evidence-producing Intent.'
}

function contextGuidance(tier: ModelAdaptationProfile['contextTier']): string {
  if (tier === 'compact') return 'Keep one active Intent and short summaries. Use paged board and experience reads for older evidence.'
  if (tier === 'wide') return 'Track up to three plausible Intents with their prerequisite and evidence links.'
  return 'Track up to two plausible Intents; retrieve full evidence on demand.'
}

function boardService(ctx: Context): BlackboardService {
  const service = ctx.get('blackboard')
  if (service === undefined) throw new Error('blackboard service is not mounted')
  return service
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'auto-loop': { kind: 'auto-loop' }
  }
}

/** Schemastery validation for {@link AutoLoopConfig}. */
export const AutoLoopConfigSchema: z<AutoLoopConfig> = z.object({
  enabled: z.boolean(),
  maxCycles: z.number(),
  stallThreshold: z.number(),
  maxDurationMs: z.number(),
})

function resolveConfig(config: AutoLoopConfig): ResolvedAutoLoopConfig {
  const resolved = {
    enabled: config.enabled ?? true,
    maxCycles: config.maxCycles ?? 64,
    stallThreshold: config.stallThreshold ?? 3,
    maxDurationMs: config.maxDurationMs ?? 30 * 60 * 1000,
  }
  for (const [key, value] of [
    ['maxCycles', resolved.maxCycles],
    ['stallThreshold', resolved.stallThreshold],
    ['maxDurationMs', resolved.maxDurationMs],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${key} must be a positive safe integer`)
  }
  return resolved
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    autoLoop: AutoLoopService
  }
}

/** A detailed Fact linked to a closed Intent is the minimum completion proof. */
function hasCompletionEvidence(snapshot: BoardSnapshot, factId?: string): boolean {
  return snapshot.nodes.some(node => {
    if (node.kind !== 'fact' || !node.detail?.trim() || (factId !== undefined && node.id !== factId)) return false
    const parent = snapshot.nodes.find(candidate => candidate.id === node.parentId)
    return parent?.kind === 'intent' && parent.status === 'done'
  })
}

/**
 * Operator-facing control surface. GoalService owns pause and resume; the
 * board's flag mirrors that durable lifecycle for the graph view.
 */
export class AutoLoopService extends Service {
  static inject = ['blackboard', 'goals']

  constructor(ctx: Context) {
    super(ctx, 'autoLoop')
  }

  /** Pause the current DSH Goal, then update the board view. */
  async pause(agent: Agent): Promise<void> {
    const goal = this.ctx.goals.get(agent)
    if (goal === undefined) throw new Error('No active goal. Create one from a direct human task first.')
    if (goal.phase === 'active') this.ctx.goals.pause(agent, { id: goal.id, revision: goal.revision })
    else if (goal.phase !== 'paused') throw new Error(`Goal is ${goal.phase}; it cannot be paused.`)
    await this.ctx.blackboard.setPaused(agent.session, true)
  }

  /** Rearm the current DSH Goal; its round driver schedules the next turn. */
  async resume(agent: Agent): Promise<void> {
    const goal = this.ctx.goals.get(agent)
    if (goal === undefined) throw new Error('No goal to resume. Create one from a direct human task first.')
    if (goal.phase === 'complete') throw new Error('Completed goals cannot be resumed.')
    if (goal.phase !== 'active' || goal.activation !== 'armed') {
      await this.ctx.blackboard.recoverExpiredClaims(agent.session)
      this.ctx.goals.resume(agent, { id: goal.id, revision: goal.revision })
    }
    await this.ctx.blackboard.setPaused(agent.session, false)
  }

  /** Persist a Hint and place it in the next admitted step without waking work. */
  async injectHint(agent: Agent, text: string): Promise<void> {
    await this.ctx.blackboard.add(agent.session, { kind: 'hint', label: text })
    agent.inject(createUserMessage({
      content: [{ type: 'text', text: `[auto-loop] Operator hint: ${text}\nAbsorb this into your next Observe/Orient pass and re-plan Intents accordingly.` }],
      source: { kind: 'auto-loop' },
    }))
  }
}

/** Register the `/auto` operator command: the UI control bar's channel. */
function registerAutoCommand(ctx: Context): void {
  ctx.commands.register({
    name: 'auto',
    description: 'Control the autonomous loop: /auto pause | resume | hint <text> | status',
    input: { hint: '[pause | resume | hint <text> | status]' },
    handler: async (invocation) => {
      const agent = invocation.agent
      const board = boardService(ctx)
      const loop = ctx.autoLoop
      const arg = invocation.rawInput.trim()
      if (arg === 'pause') {
        await loop.pause(agent)
        return { kind: 'success', text: 'auto-loop: goal paused. Resume with "/auto resume".' }
      }
      if (arg === 'resume') {
        await loop.resume(agent)
        return { kind: 'success', text: 'auto-loop: goal resumed; DSH Goal will schedule the next round.' }
      }
      if (arg.startsWith('hint ')) {
        const text = arg.slice('hint '.length).trim()
        if (text.length === 0) return { kind: 'error', text: 'auto-loop: "/auto hint <text>" needs hint text.' }
        await loop.injectHint(agent, text)
        return { kind: 'success', text: `auto-loop: hint injected — ${text}` }
      }
      if (arg === 'status') {
        const snap = await board.snapshot(agent.session)
        const goal = ctx.goals.get(agent)
        return {
          kind: 'success',
          text: `auto-loop: cycle ${snap.cycle}, ${snap.nodes.length} node(s), paused=${snap.paused}, complete=${snap.complete}; goal=${goal?.phase ?? 'none'}, activation=${goal?.activation ?? 'none'}, rounds=${goal?.roundsStarted ?? 0}/${goal?.maxGoalRounds ?? 0}`,
        }
      }
      return { kind: 'error', text: 'auto-loop: unknown subcommand. Use pause | resume | hint <text> | status.' }
    },
  })
}

/**
 * Mount model-facing board tools, operator controls, and one Goal budget guard.
 * DSH goal-round-driver is the sole continuation scheduler.
 * @param ctx - plugin context carrying tools, blackboard, and the agent events.
 * @param config - loop configuration; defaults applied per key.
 */
export function applyAutoLoop(ctx: Context, config: AutoLoopConfig): void {
  const resolved = resolveConfig(config)
  if (!resolved.enabled) return

  ctx.plugin(BlackboardService)
  ctx.plugin(AutoLoopService)
  registerAutoCommand(ctx)

  ctx.systemPrompt.section({
    name: 'ant-sword:auto-goal-budget',
    order: 95,
    text: ({ agent }) => agent !== undefined && isAutoPreset(agent) ? 'In Red Team (Auto), the first direct human task turn must create a DSH Goal '
      + `with create_goal(objective, max_goal_rounds=${resolved.maxCycles}) before starting the board. `
      + 'DSH Goal controls automatic continuation. The board is a durable evidence graph, not a turn scheduler. '
      + `After ${resolved.stallThreshold} equivalent attempts without new evidence, abandon that Intent and choose a different hypothesis. `
      + `This run has a ${resolved.maxDurationMs} ms wall-clock budget from its first admitted goal round.` : '',
  })

  // Prompt assembly sees the selected provider/model before agent/request
  // persists its header. This keeps capacity guidance current on a model
  // switch without changing the route or the adapter-owned effort value.
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    const agent = context.agent
    if (agent === undefined || !isAutoPreset(agent)) return assembled
    const provider = assembled.variables['provider'] ?? agent.options.provider
    const model = assembled.variables['model'] ?? agent.options.model
    const header = agent.session.requestHeader()?.config
    const adaptation = ctx.get('modelAdaptation')
    const profile = adaptation === undefined ? COMPACT_PROFILE
      : provider !== undefined && model !== undefined
        && (header?.provider !== provider || header.model !== model)
        ? await adaptation.forRoute(provider, model)
        : await adaptation.profile(agent)
    assembled.sections.push({
      name: 'ant-sword:auto-context-guidance',
      text: `Autonomous context budget: ${profile.contextTier}. ${contextGuidance(profile.contextTier)}`,
      interpolate: false,
    })
    return assembled
  }, { global: true })

  // The `board` projection unit: last-wins fold of board/change events into
  // the graph the Web view renders. Activates only when a projection registry
  // is composed (headless assemblies stay unaffected).
  const boardProjectionSchema: ZodType<BoardSnapshot | null> = zod.union([
    zod.object({
      nodes: zod.array(zod.object({
        id: zod.string(), sessionId: zod.string(),
        generation: zod.number().int().nonnegative().optional(),
        kind: zod.enum(['fact', 'intent', 'hint', 'goal']),
        label: zod.string(), detail: zod.string().optional(),
        parentId: zod.string().optional(),
        status: zod.enum(['open', 'claimed', 'done', 'abandoned']).optional(),
        claim: zod.object({ owner: zod.string(), leaseUntil: zod.number() }).optional(),
        time: zod.number(), cycle: zod.number(),
      })),
      cycle: zod.number(), paused: zod.boolean(), complete: zod.boolean(),
    }),
    zod.null(),
  ]) as ZodType<BoardSnapshot | null>
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.register<'board', BoardSnapshot | null>({
      key: 'board',
      stateSchema: boardProjectionSchema,
      init: () => null,
      apply: applyBoardProjection,
      wire: { viewSchema: boardProjectionSchema, view: state => state },
      stateVersion: 1,
    })
  })

  const board = () => boardService(ctx)

  /** Keep the graph's persisted cycle equal to admitted DSH Goal rounds. */
  const alignGoalCycle = async (agent: Agent): Promise<void> => {
    await mirrorTails.get(agent.session.id)
    const goal = ctx.goals.get(agent)
    if (goal !== undefined) await board().advanceToCycle(agent.session, goal.roundsStarted)
  }

  // A newly instantiated agent has no in-flight tool work. Claims left by a
  // previous process can therefore be reopened before its first model step.
  const restoreTails = new Map<string, Promise<void>>()
  ctx.on('agent/created', ({ agent }) => {
    const restored = board().recoverClaimed(agent.session).then(() => undefined)
    restoreTails.set(agent.session.id, restored)
    void restored.catch(error => {
      ctx.logger.warn(`auto-loop: failed to recover claimed Intents: ${String(error)}`)
    }).finally(() => {
      if (restoreTails.get(agent.session.id) === restored) restoreTails.delete(agent.session.id)
    })
    return undefined
  })

  // The goal service also accepts /goal and update_goal. Mirror those paths
  // into the board projection so the UI never depends on which control was used.
  const mirrorTails = new Map<string, Promise<void>>()
  ctx.on('goal/changed', ({ agent, change }) => {
    if (!isAutoPreset(agent)) return
    const previous = mirrorTails.get(agent.session.id) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(async () => {
      if (change.operation === 'create') {
        const [previousBoard, previousRun] = await Promise.all([
          board().snapshot(agent.session), board().runState(agent.session),
        ])
        if (previousBoard.nodes.length > 0 || previousBoard.cycle > 0
          || previousBoard.paused || previousBoard.complete || previousRun.startedAt > 0) {
          await board().resetRun(agent.session)
        }
      }
      if (change.operation === 'resume') await board().recoverExpiredClaims(agent.session)
      const phase = change.goal?.phase
      await board().setPaused(agent.session, phase === 'paused' || phase === 'blocked' || phase === undefined)
      if (phase === 'complete') {
        const snapshot = await board().snapshot(agent.session)
        if (hasCompletionEvidence(snapshot)) await board().markComplete(agent.session)
        else ctx.logger.warn(`auto-loop: DSH Goal completed without linked board evidence in session "${agent.session.id}"`)
      }
    })
    mirrorTails.set(agent.session.id, current)
    void current.catch(error => {
      ctx.logger.warn(`auto-loop: failed to mirror goal state: ${String(error)}`)
    }).finally(() => {
      if (mirrorTails.get(agent.session.id) === current) mirrorTails.delete(agent.session.id)
    })
  })

  // Native update_goal can also close a Goal. Require the same board evidence
  // as board_complete whenever this session has entered autonomous board mode.
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    const args = exec.arguments
    if (exec.name !== 'update_goal' || exec.agent === undefined || !isAutoPreset(exec.agent)
      || typeof args !== 'object' || args === null || Array.isArray(args)
      || (args as Record<string, unknown>)['action'] !== 'complete') return next()
    await mirrorTails.get(exec.agent.session.id)
    const snapshot = await board().snapshot(exec.agent.session)
    if (!snapshot.nodes.some(node => node.kind === 'goal')) return next()
    if (!hasCompletionEvidence(snapshot)) {
      return { kind: 'deny', reason: 'Complete a linked Intent and record a detailed Fact before completing this Goal.' }
    }
    return next()
  }, { global: true })

  // A Goal round must be the only automated source of work. This guard only
  // rejects an over-budget Goal message; direct human input remains untouched.
  ctx.on('agent/pre-step', async ({ agent, messages }, next): Promise<PreStepDecision> => {
    if (!isAutoPreset(agent) || messages.some(message => message.source.kind === 'user')) return next()
    const round = messages.find(message => message.source.kind === 'goal')
    if (round?.source.kind !== 'goal') return next()
    await restoreTails.get(agent.session.id)
    await mirrorTails.get(agent.session.id)
    const goal = ctx.goals.get(agent)
    if (goal === undefined || goal.phase !== 'active'
      || round.source.goalId !== goal.id || round.source.revision !== goal.revision
      || round.source.round !== goal.roundsStarted + 1) return next()
    await board().recoverExpiredClaims(agent.session)
    await board().startRun(agent.session)
    const run = await board().runState(agent.session)
    if (Date.now() - run.startedAt < resolved.maxDurationMs) return next()
    ctx.goals.block(agent, { id: goal.id, revision: goal.revision }, {
      code: 'time-limit',
      message: `Autonomous run exceeded its ${resolved.maxDurationMs} ms wall-clock budget.`,
    })
    await board().setPaused(agent.session, true)
    return { kind: 'reject' }
  })

  // ── model-facing board tools ─────────────────────────────────────────────

  ctx.tools.register(defineTool({
    name: 'board_write',
    description:
      'Write a node to the engagement blackboard (the shared Fact/Intent/Hint graph that drives this autonomous run). '
      + 'Write a `fact` for every confirmed, objective finding, with concrete evidence in `detail` and `parentId` pointing to the Intent that produced it. '
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
      if (!exec.agent) throw new Error('board_write requires an owning agent session')
      await alignGoalCycle(exec.agent)
      if (args.kind === 'goal' && ctx.goals.get(exec.agent) === undefined) {
        throw new Error('Create a DSH Goal from a direct human task before writing the board Goal')
      }
      const node = await board().add(exec.agent.session, {
        kind: args.kind, label: args.label,
        ...(args.detail !== undefined ? { detail: args.detail } : {}),
        ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
        ...(args.kind === 'intent' ? { status: 'open' as const } : {}),
      })
      return { id: node.id, cycle: node.cycle }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'board_read',
    description:
      'Read a bounded priority overview of the current blackboard at the start of each Observe pass. '
      + 'Use cursor for chronological pages or nodeId and detailOffset to inspect complete evidence in chunks.',
    parameters: {
      cursor: { type: 'string', description: 'Decimal chronological node offset, starting at "0".' },
      nodeId: { type: 'string', description: 'Read one node and a chunk of its full detail.' },
      detailOffset: { type: 'integer', description: 'Character offset into node detail; use with nodeId.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          summary: { type: 'string', required: true },
          nextCursor: { type: 'string' },
          nextDetailOffset: { type: 'integer' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('board_read requires an owning agent session')
      await alignGoalCycle(exec.agent)
      const profile = await ctx.get('modelAdaptation')?.profile(exec.agent) ?? COMPACT_PROFILE
      const preface = `Reasoning mode: ${profile.reasoningMode}. ${reasoningGuidance(profile.reasoningMode)}\n`
      const snap = await board().snapshot(exec.agent.session)
      const result = readBoard(snap, args, {
        contextTier: profile.contextTier,
        boardChars: Math.max(512, profile.boardChars - preface.length),
        evidenceChars: profile.evidenceChars,
      })
      return {
        ...result,
        summary: `${preface}${result.summary}`,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'board_transition',
    description:
      'Transition an Intent you own: `claimed` when you start executing it, `done` when it produced its Fact, `abandoned` when it is a proven dead end. '
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
      if (!exec.agent) throw new Error('board_transition requires an owning agent session')
      await alignGoalCycle(exec.agent)
      await board().setStatus(exec.agent.session, args.nodeId, args.status)
      return { ok: true }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'board_complete',
    description:
      'Finish the current DSH Goal and mark the board complete. Reference a detailed Fact linked to a done Intent that verifies the whole objective.',
    parameters: {
      evidenceNodeId: { type: 'string', required: true, description: 'Id of an existing Fact node that proves the goal is met.' },
      evidence: { type: 'string', required: true, description: 'Why the goal is met (flag, shell, access proof).' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.ok ? 'blackboard: goal marked complete — loop stops' : 'blackboard: no-op' }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('board_complete requires an owning agent session')
      if (!isAutoPreset(exec.agent)) throw new Error('board_complete is available only in red-team-auto')
      await alignGoalCycle(exec.agent)
      const goal = ctx.goals.get(exec.agent)
      if (goal === undefined) throw new Error('board_complete requires an active DSH Goal')
      const snapshot = await board().snapshot(exec.agent.session)
      if (!hasCompletionEvidence(snapshot, args.evidenceNodeId)) {
        throw new Error('board_complete requires a detailed Fact linked to a done Intent in this session')
      }
      if (snapshot.nodes.some(node => node.kind === 'fact' && node.label === 'GOAL MET' && node.parentId === args.evidenceNodeId)) {
        return { ok: false }
      }
      if (goal.phase !== 'complete') {
        ctx.goals.complete(exec.agent, { id: goal.id, revision: goal.revision })
      }
      await board().add(exec.agent.session, {
        kind: 'fact', label: 'GOAL MET', detail: args.evidence, parentId: args.evidenceNodeId,
      })
      await board().markComplete(exec.agent.session)
      return { ok: true }
    },
  }))

}
