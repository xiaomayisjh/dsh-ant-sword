import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { PromptSection } from '@deepseek-ai/dsh-system-prompt'
import type { PromptAssembly } from '@deepseek-ai/dsh-system-prompt'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { applyAutoLoop } from '../src/auto/loop.ts'

type Hook = (...args: unknown[]) => Promise<unknown>

function agentWithPreset(id: string, agentPreset: string): Agent {
  return {
    session: { id, header: { agentPreset }, seq: 0, eventAt: () => undefined },
  } as unknown as Agent
}

function mountedLoop(startedAt: number) {
  const hooks = new Map<string, Hook>()
  const goal = {
    id: 'goal-1', revision: 1, phase: 'active', activation: 'armed',
    roundsStarted: 0, maxGoalRounds: 64,
  }
  const board = {
    snapshot: vi.fn(async () => ({ nodes: [], cycle: 0, paused: false, complete: false })),
    runState: vi.fn(async () => ({ startedAt })),
    startRun: vi.fn(async () => startedAt),
    resetRun: vi.fn(async () => 1),
    recoverClaimed: vi.fn(async () => 0),
    recoverExpiredClaims: vi.fn(async () => 0),
    setPaused: vi.fn(async () => undefined),
    markComplete: vi.fn(async () => undefined),
    advanceToCycle: vi.fn(async () => 0),
  }
  const goals = { get: vi.fn(() => goal), block: vi.fn() }
  const logger = { warn: vi.fn() }
  const sections: PromptSection[] = []
  const tools = new Map<string, ToolDefinition>()
  const modelAdaptation = {
    profile: vi.fn(async () => ({
      contextTier: 'compact' as const, reasoningMode: 'guided' as const,
      boardChars: 2_000, evidenceChars: 500, lessonCount: 2,
    })),
    forRoute: vi.fn(async () => ({
      contextTier: 'wide' as const, reasoningMode: 'balanced' as const,
      boardChars: 10_000, evidenceChars: 2_000, lessonCount: 6,
    })),
  }
  const ctx = {
    plugin: vi.fn(),
    commands: { register: vi.fn() },
    systemPrompt: { section: vi.fn((section: PromptSection) => { sections.push(section) }) },
    inject: vi.fn(),
    on: vi.fn((name: string, hook: Hook) => { hooks.set(name, hook) }),
    tools: { register: vi.fn((tool: ToolDefinition) => { tools.set(tool.name, tool) }) },
    get: vi.fn((service: string) => service === 'modelAdaptation' ? modelAdaptation
      : service === 'blackboard' ? board : undefined),
    goals,
    get blackboard() { throw new Error('cannot get property "blackboard" without inject') },
    logger,
  } as unknown as Context
  applyAutoLoop(ctx, { maxDurationMs: 1_000 })
  return { hooks, goals, board, logger, sections, tools, modelAdaptation }
}

describe('DSH Goal integration', () => {
  it('uses the selected model for prompt capacity and the effective effort for bounded board reads', async () => {
    const { hooks, board, tools, modelAdaptation } = mountedLoop(1_000)
    const agent = {
      options: { provider: 'old-provider', model: 'old-model' },
      session: {
        id: 'adaptive-session', header: { agentPreset: 'red-team-auto' },
        seq: 0, eventAt: () => undefined,
        requestHeader: () => ({ config: { provider: 'old-provider', model: 'old-model' } }),
      },
    } as unknown as Agent
    const assembly: PromptAssembly = { sections: [], contexts: [], tools: [], variables: { provider: 'new-provider', model: 'new-model' } }
    const assembled = await hooks.get('system-prompt/assemble')!(assembly, { agent }, async () => assembly) as PromptAssembly
    expect(modelAdaptation.forRoute).toHaveBeenCalledWith('new-provider', 'new-model')
    expect(assembled.sections.find(section => section.name === 'ant-sword:auto-context-guidance')?.text)
      .toContain('wide')

    board.snapshot.mockResolvedValue({
      nodes: Array.from({ length: 30 }, (_, index) => ({
        id: `fact-${index}`, sessionId: 'adaptive-session', kind: 'fact', label: `finding ${index}`,
        detail: 'x'.repeat(1_000), time: index, cycle: 1,
      })),
      cycle: 1, paused: false, complete: false,
    } as never)
    const boardRead = tools.get('board_read')!
    const overview = await boardRead.execute({}, { agent } as never) as { summary: string }
    expect(overview.summary).toContain('Reasoning mode: guided')
    expect(overview.summary.length).toBeLessThanOrEqual(2_000)
    expect(overview.summary).toContain('omitted')
    expect(modelAdaptation.profile).toHaveBeenCalledWith(agent)
    const detail = await boardRead.execute({ nodeId: 'fact-0' }, { agent } as never) as {
      summary: string; nextDetailOffset?: number
    }
    expect(detail.nextDetailOffset).toBeGreaterThan(0)
    expect(detail.summary.length).toBeLessThanOrEqual(2_000)
  })

  it('shows autonomous Goal guidance only while the auto preset is selected', () => {
    const { sections } = mountedLoop(1_000)
    const budget = sections.find(section => section.name === 'ant-sword:auto-goal-budget')!
    expect(budget).toBeDefined()
    expect(typeof budget!.text).toBe('function')
    if (typeof budget!.text !== 'function') return

    const events: Array<{ type: string; data: { agentPreset: string } }> = []
    const session = {
      header: { agentPreset: 'red-team' },
      get seq() { return events.length },
      eventAt: (seq: number) => events[seq],
    }
    const agent = { session } as unknown as Agent
    expect(budget.text({})).toBe('')
    expect(budget.text({ agent })).toBe('')

    events.push({ type: 'agent-preset/selected', data: { agentPreset: 'red-team-auto' } })
    expect(budget.text({ agent })).toContain('create_goal(objective, max_goal_rounds=64)')
    events.push({ type: 'agent-preset/selected', data: { agentPreset: 'red-team' } })
    expect(budget.text({ agent })).toBe('')
  })

  it('blocks only an expired autonomous Goal round and never schedules its own idle turn', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(10_000)
    try {
      const { hooks, goals, board } = mountedLoop(8_000)
      const preStep = hooks.get('agent/pre-step')
      expect(preStep).toBeDefined()
      expect(hooks.has('agent/status')).toBe(false)
      expect(hooks.has('tools/post-execute')).toBe(false)

      const agent = agentWithPreset('session-1', 'red-team-auto')
      const next = vi.fn(async () => ({ kind: 'enter', messages: [] }))
      const directHuman = await preStep!({
        agent, messages: [{ source: { kind: 'user' } }],
      }, next)
      expect(directHuman).toEqual({ kind: 'enter', messages: [] })
      expect(goals.block).not.toHaveBeenCalled()

      const goalRound = await preStep!({
        agent,
        messages: [{ source: { kind: 'goal', goalId: 'goal-1', revision: 1, round: 1 } }],
      }, next)
      expect(goalRound).toEqual({ kind: 'reject' })
      expect(next).toHaveBeenCalledTimes(1)
      expect(board.recoverExpiredClaims).toHaveBeenCalledWith(agent.session)
      expect(board.startRun).toHaveBeenCalledWith(agent.session)
      expect(goals.block).toHaveBeenCalledWith(agent, { id: 'goal-1', revision: 1 },
        expect.objectContaining({ code: 'time-limit' }))
      expect(board.setPaused).toHaveBeenCalledWith(agent.session, true)
    } finally {
      clock.mockRestore()
    }
  })

  it('resets the board for a replacement Goal and gates native completion on evidence', async () => {
    const { hooks, board, logger } = mountedLoop(1_000)
    const agent = agentWithPreset('same-session', 'red-team-auto')
    const previous = {
      nodes: [{ id: 'old-goal', kind: 'goal', label: 'first task' }],
      cycle: 2, paused: false, complete: true,
    }
    board.snapshot.mockResolvedValue(previous as never)
    const changed = hooks.get('goal/changed')!
    changed({ agent, change: { operation: 'create', goal: { phase: 'active' } } }, async () => undefined)
    await vi.waitFor(() => expect(board.resetRun).toHaveBeenCalledWith(agent.session))

    board.resetRun.mockClear()
    board.snapshot.mockResolvedValue({ nodes: [], cycle: 0, paused: false, complete: false } as never)
    changed({ agent, change: { operation: 'create', goal: { phase: 'active' } } }, async () => undefined)
    await vi.waitFor(() => expect(board.resetRun).toHaveBeenCalledWith(agent.session))
    board.snapshot.mockResolvedValue(previous as never)

    const preExecute = hooks.get('tools/pre-execute')!
    const next = vi.fn(async () => ({ kind: 'allow' }))
    const denied = await preExecute({ name: 'update_goal', agent, arguments: { action: 'complete' } }, next)
    expect(denied).toMatchObject({ kind: 'deny' })
    expect(next).not.toHaveBeenCalled()

    changed({ agent, change: { operation: 'complete', goal: { phase: 'complete' } } }, async () => undefined)
    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('completed without linked board evidence')))
    expect(board.markComplete).not.toHaveBeenCalled()

    board.snapshot.mockResolvedValue({
      nodes: [
        { id: 'goal-2', kind: 'goal' },
        { id: 'intent-2', kind: 'intent', status: 'done' },
        { id: 'fact-2', kind: 'fact', parentId: 'intent-2', detail: 'verified proof' },
      ], cycle: 1, paused: false, complete: false,
    } as never)
    const allowed = await preExecute({ name: 'update_goal', agent, arguments: { action: 'complete' } }, next)
    expect(allowed).toEqual({ kind: 'allow' })
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('leaves a manual preset native Goal and its completion flow untouched', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(10_000)
    try {
      const { hooks, goals, board, tools, modelAdaptation } = mountedLoop(8_000)
      const agent = agentWithPreset('manual-session', 'red-team')
      const assembly: PromptAssembly = { sections: [], contexts: [], tools: [], variables: {} }
      const assembled = await hooks.get('system-prompt/assemble')!(assembly, { agent }, async () => assembly) as PromptAssembly
      expect(assembled.sections).toEqual([])
      expect(modelAdaptation.profile).not.toHaveBeenCalled()
      board.snapshot.mockResolvedValue({
        nodes: [{ id: 'manual-goal', kind: 'goal' }],
        cycle: 2, paused: false, complete: false,
      } as never)

      hooks.get('goal/changed')!({
        agent, change: { operation: 'create', goal: { phase: 'active' } },
      }, async () => undefined)
      expect(board.snapshot).not.toHaveBeenCalled()
      expect(board.resetRun).not.toHaveBeenCalled()
      expect(board.setPaused).not.toHaveBeenCalled()

      const nextTool = vi.fn(async () => ({ kind: 'allow' }))
      expect(await hooks.get('tools/pre-execute')!({
        name: 'update_goal', agent, arguments: { action: 'complete' },
      }, nextTool)).toEqual({ kind: 'allow' })
      expect(nextTool).toHaveBeenCalledOnce()
      expect(board.snapshot).not.toHaveBeenCalled()

      const nextStep = vi.fn(async () => ({ kind: 'enter', messages: [] }))
      expect(await hooks.get('agent/pre-step')!({
        agent, messages: [{ source: { kind: 'goal', goalId: 'goal-1', revision: 1, round: 1 } }],
      }, nextStep)).toEqual({ kind: 'enter', messages: [] })
      expect(nextStep).toHaveBeenCalledOnce()
      expect(goals.block).not.toHaveBeenCalled()
      expect(board.startRun).not.toHaveBeenCalled()
      await expect(tools.get('board_complete')!.execute({
        evidenceNodeId: 'manual-fact', evidence: 'manual evidence',
      }, { agent } as never)).rejects.toThrow('only in red-team-auto')
    } finally {
      clock.mockRestore()
    }
  })
})
