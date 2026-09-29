import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { ToolExecution, ToolExecutionInput, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { MemoryStorageBackend } from './helpers/memory-backend.ts'
import { BlackboardService } from '../src/auto/blackboard.ts'
import { ExperienceService, abstractLessonText, applyExperience } from '../src/auto/experience.ts'
import type { ExperienceConfig } from '../src/auto/experience.ts'
import type { ModelAdaptationProfile } from '../src/auto/model-adaptation.ts'

function session(id: string): Session {
  const events: SessionEvent[] = []
  return {
    id,
    append: (type: string, data: unknown) => {
      const event = { type, data, seq: String(events.length), time: Date.now() } as unknown as SessionEvent
      events.push(event)
      return event
    },
  } as unknown as Session
}

async function harness(config: ExperienceConfig = {}, backend = new MemoryStorageBackend()) {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', backend)
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  const board = new BlackboardService(ctx, facility)
  const experience = new ExperienceService(ctx, config, facility)
  return { board, experience, facility }
}

async function mountedHarness(profile?: ModelAdaptationProfile) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend())
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  await ctx.plugin(BlackboardService)
  if (profile !== undefined) {
    ctx.provide('modelAdaptation' as string, { profile: async () => profile })
  }
  applyExperience(ctx)
  await vi.waitFor(() => expect(ctx.experience).toBeDefined())
  return ctx
}

async function attempt(experience: ExperienceService, owner: Session, name: string, args: object, result: ToolExecutionResult) {
  return experience.observe({
    name, arguments: args, rootCallId: `${owner.id}-${name}`, agent: { session: owner },
  } as unknown as ToolExecution, result)
}

const success = (value: Record<string, string | number | boolean> = { ok: true }): ToolExecutionResult => ({ isError: false, value, content: [] })
const failure = (code: string, message: string): ToolExecutionResult => ({
  isError: true, error: { message, info: { name: 'ToolError', code } }, content: [],
})

async function verifiedOutcome(
  board: BlackboardService,
  experience: ExperienceService,
  owner: Session,
  result: 'worked' | 'failed',
  strategy = 'Test a second route and compare response evidence',
) {
  const goal = await board.add(owner, { kind: 'goal', label: 'Assess TARGET service' })
  const intent = await board.add(owner, { kind: 'intent', label: 'Test alternate service route', parentId: goal.id })
  await board.setStatus(owner, intent.id, 'claimed')
  await attempt(experience, owner, 'probe', { url: 'https://target.example/route' },
    result === 'worked' ? success({ status: 200, evidence: 'SAMPLE' }) : failure('HTTP_404', 'route missing'))
  const fact = await board.add(owner, {
    kind: 'fact', parentId: intent.id,
    label: result === 'worked' ? 'Route responded' : 'Route absent',
    detail: result === 'worked' ? 'Response verified with a second request' : 'Two independent responses returned 404',
  })
  await board.setStatus(owner, intent.id, result === 'worked' ? 'done' : 'abandoned')
  return experience.propose(owner, {
    intentId: intent.id, evidenceNodeId: fact.id,
    situation: 'Service route fallback after primary endpoint failure',
    strategy, result,
  })
}

describe('autonomous experience', () => {
  it('mounts model-facing tools through the real Cordis tool registry', async () => {
    const ctx = await mountedHarness()
    expect(ctx.blackboard).toBeDefined()

    const names = ctx.tools.schemas().map(tool => tool.name)
    expect(names).toContain('experience_recall')
    expect(names).toContain('experience_read')
    expect(names).toContain('experience_record')
    const owner = session('mounted')
    const agent = { ctx, session: owner }
    const result = await ctx.tools.execute({
      callId: 'recall-1', name: 'experience_recall',
      arguments: { situation: 'Service route fallback after primary endpoint failure' },
      agent, signal: new AbortController().signal,
    } as unknown as ToolExecutionInput)
    expect(result).toMatchObject({
      isError: false,
      value: { summary: expect.stringContaining('No matching experience yet') },
    })

    const goal = await ctx.blackboard.add(owner, { kind: 'goal', label: 'Assess TARGET service' })
    const intent = await ctx.blackboard.add(owner, { kind: 'intent', label: 'Probe alternate route', parentId: goal.id })
    await ctx.blackboard.setStatus(owner, intent.id, 'claimed')
    ctx.tools.register(defineTool({
      name: 'probe_fixture', description: 'Returns a fixed observation for the integration test.',
      parameters: { route: { type: 'string', required: true } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true } } },
        render: (_args, value) => [{ type: 'text', text: String(value.ok) }],
      },
      execute: async () => ({ ok: true }),
    }))
    for (let index = 0; index < 3; index++) {
      const probe = await ctx.tools.execute({
        callId: `probe-${index}`, name: 'probe_fixture', arguments: { route: '/api' },
        agent, signal: new AbortController().signal,
      } as unknown as ToolExecutionInput)
      expect(probe.isError).toBe(false)
    }
    await vi.waitFor(async () => {
      expect(await ctx.experience.diagnose(owner)).toMatchObject({
        intentId: intent.id, attemptsWithoutProgress: 3, nextStep: 'switch-method',
      })
    })
  })

  it('bounds compact recall and pages a full lesson through model-facing tools', async () => {
    const modelProfile: ModelAdaptationProfile = {
      contextTier: 'compact', reasoningMode: 'guided', boardChars: 512,
      evidenceChars: 80, lessonCount: 2,
    }
    const ctx = await mountedHarness(modelProfile)
    const longStrategy = `Probe the alternate route, compare independent response evidence, and record each distinction. ${'Repeat correlation carefully. '.repeat(20)}`
    const first = await verifiedOutcome(ctx.blackboard, ctx.experience, session('lesson-one'), 'worked', longStrategy)
    const second = await verifiedOutcome(ctx.blackboard, ctx.experience, session('lesson-two'), 'worked', 'Compare alternate route metadata against the primary response')
    const third = await verifiedOutcome(ctx.blackboard, ctx.experience, session('lesson-three'), 'failed', 'Retry the same route without changing request or conditions')
    const fourth = await verifiedOutcome(ctx.blackboard, ctx.experience, session('lesson-four'), 'worked', 'Check protocol negotiation before changing the route')
    const fifth = await verifiedOutcome(ctx.blackboard, ctx.experience, session('lesson-five'), 'failed', 'Continue with the primary route after consistent failure evidence')
    const sixth = await verifiedOutcome(ctx.blackboard, ctx.experience, session('lesson-six'), 'worked', 'Compare response headers and body signatures from each route')
    const lessonIds = [first, second, third, fourth, fifth, sixth].map(lesson => lesson.id)
    const agent = { ctx, session: session('reader') }
    const recall = await ctx.tools.execute({
      callId: 'compact-recall', name: 'experience_recall',
      arguments: { situation: 'Service route fallback after primary endpoint failure' },
      agent, signal: new AbortController().signal,
    } as unknown as ToolExecutionInput)
    expect(recall.isError).toBe(false)
    if (recall.isError) return
    const summary = (recall.value as { summary: string }).summary
    expect(summary.length).toBeLessThanOrEqual(512)
    const visibleIds = lessonIds.filter(id => summary.includes(id))
    expect(visibleIds).toHaveLength(2)
    expect(summary).not.toContain(longStrategy)

    let offset = 0
    let record = ''
    for (let pageNumber = 0; pageNumber < 30; pageNumber++) {
      const page = await ctx.tools.execute({
        callId: `read-${pageNumber}`, name: 'experience_read',
        arguments: { id: first.id, offset }, agent, signal: new AbortController().signal,
      } as unknown as ToolExecutionInput)
      expect(page.isError).toBe(false)
      if (page.isError) return
      const value = page.value as { summary: string; nextOffset?: number }
      expect(value.summary.length).toBeLessThanOrEqual(512)
      const start = value.summary.indexOf(':\n') + 2
      const end = value.nextOffset === undefined ? value.summary.length : value.summary.lastIndexOf('\nNext page:')
      record += value.summary.slice(start, end)
      if (value.nextOffset === undefined) break
      expect(value.nextOffset).toBeGreaterThan(offset)
      offset = value.nextOffset
    }
    expect(JSON.parse(record)).toMatchObject({ id: first.id, strategy: first.strategy })

    Object.assign(modelProfile, { contextTier: 'wide', boardChars: 10_000, evidenceChars: 2_000, lessonCount: 6 })
    const wideRecall = await ctx.tools.execute({
      callId: 'wide-recall', name: 'experience_recall',
      arguments: { situation: 'Service route fallback after primary endpoint failure' },
      agent, signal: new AbortController().signal,
    } as unknown as ToolExecutionInput)
    expect(wideRecall.isError).toBe(false)
    if (wideRecall.isError) return
    const wideSummary = (wideRecall.value as { summary: string }).summary
    expect(wideSummary.length).toBeLessThanOrEqual(10_000)
    expect(lessonIds.filter(id => wideSummary.includes(id))).toHaveLength(6)
  })

  it('promotes only after evidence-backed success in independent sessions', async () => {
    const { board, experience } = await harness()
    const first = session('first')
    const candidate = await verifiedOutcome(board, experience, first, 'worked')
    expect(candidate.status).toBe('candidate')
    expect(candidate.evaluations).toHaveLength(1)

    // Repeating the same session cannot manufacture independent confirmation.
    const sameSession = await experience.propose(first, {
      intentId: (await board.snapshot(first)).nodes.find(node => node.kind === 'intent')!.id,
      evidenceNodeId: (await board.snapshot(first)).nodes.find(node => node.kind === 'fact')!.id,
      situation: candidate.situation, strategy: candidate.strategy, result: 'worked',
    })
    expect(sameSession.evaluations).toHaveLength(1)
    expect(sameSession.status).toBe('candidate')

    const validated = await verifiedOutcome(board, experience, session('second'), 'worked')
    expect(validated.id).toBe(candidate.id)
    expect(validated.status).toBe('validated')
    expect(validated.evaluations).toHaveLength(2)
    expect((await experience.recall('Primary endpoint failed; try service route fallback'))[0]?.id).toBe(candidate.id)
  })

  it('reopens candidates from durable storage and validates them in a later session', async () => {
    const backend = new MemoryStorageBackend()
    const first = await harness({}, backend)
    const candidate = await verifiedOutcome(first.board, first.experience, session('before-restart'), 'worked')
    expect(candidate.status).toBe('candidate')
    await first.facility.closeAll()

    const reopened = await harness({}, backend)
    const validated = await verifiedOutcome(reopened.board, reopened.experience, session('after-restart'), 'worked')
    expect(validated.id).toBe(candidate.id)
    expect(validated.status).toBe('validated')
    expect((await reopened.experience.recall(candidate.situation))[0]?.status).toBe('validated')
  })

  it('requires a same-session Fact and a preceding attempt', async () => {
    const { board, experience } = await harness()
    const owner = session('owner')
    const goal = await board.add(owner, { kind: 'goal', label: 'Assess TARGET service' })
    const intent = await board.add(owner, { kind: 'intent', label: 'Try route', parentId: goal.id })
    await board.setStatus(owner, intent.id, 'claimed')
    const fact = await board.add(owner, { kind: 'fact', label: 'A response', detail: 'Observed HTTP response', parentId: intent.id })
    await board.setStatus(owner, intent.id, 'done')
    await expect(experience.propose(owner, {
      intentId: intent.id, evidenceNodeId: fact.id,
      situation: 'Testing fallback service route', strategy: 'Probe a second route with a fresh request', result: 'worked',
    })).rejects.toThrow('matching tool attempt')
  })

  it('classifies repeated failures and suggests the matching recovery step', async () => {
    const { board, experience } = await harness()
    const owner = session('stalled')
    const goal = await board.add(owner, { kind: 'goal', label: 'Assess TARGET service' })
    const intent = await board.add(owner, { kind: 'intent', label: 'Try route', parentId: goal.id })
    await board.setStatus(owner, intent.id, 'claimed')
    for (let index = 0; index < 3; index++) {
      await attempt(experience, owner, 'http_probe', { route: '/api' }, failure('TIMEOUT', 'network timeout'))
    }
    expect(await experience.diagnose(owner)).toMatchObject({
      intentId: intent.id, attemptsWithoutProgress: 3, nextStep: 'retry-with-backoff',
    })
    const record = await attempt(experience, owner, 'http_probe', { route: '/api' }, failure('UNKNOWN_TOOL', 'tool missing'))
    expect(record?.outcome).toBe('missing-capability')
    expect((await experience.diagnose(owner))?.nextStep).toBe('switch-capability')
  })

  it('uses the configured stall threshold', async () => {
    const { board, experience } = await harness({ stallThreshold: 2 })
    const owner = session('threshold-two')
    const intent = await board.add(owner, { kind: 'intent', label: 'Probe route' })
    await board.setStatus(owner, intent.id, 'claimed')
    await attempt(experience, owner, 'http_probe', { route: '/api' }, failure('HTTP_404', 'route missing'))
    expect(await experience.diagnose(owner)).toBeUndefined()
    await attempt(experience, owner, 'http_probe', { route: '/api' }, failure('HTTP_404', 'route missing'))
    expect(await experience.diagnose(owner)).toMatchObject({
      attemptsWithoutProgress: 2, nextStep: 'switch-method',
    })
  })

  it('excludes read-only capability checks from the attempt and stall ledger', async () => {
    const { board, experience } = await harness()
    const owner = session('capabilities-only')
    const intent = await board.add(owner, { kind: 'intent', label: 'Probe route' })
    await board.setStatus(owner, intent.id, 'claimed')
    for (let index = 0; index < 4; index++) {
      expect(await attempt(experience, owner, 'mcp_capabilities', {}, success({ available: true }))).toBeUndefined()
    }
    expect(await attempt(experience, owner, 'run_code', { code: 'tools.probe({})' }, success({ ok: true }))).toBeUndefined()
    expect(await experience.diagnose(owner)).toBeUndefined()
  })

  it('keeps exploring distinct successful probes and asks for evidence after five', async () => {
    const { board, experience } = await harness()
    const owner = session('exploring')
    const goal = await board.add(owner, { kind: 'goal', label: 'Assess TARGET service' })
    const intent = await board.add(owner, { kind: 'intent', label: 'Enumerate routes', parentId: goal.id })
    await board.setStatus(owner, intent.id, 'claimed')
    for (let index = 0; index < 3; index++) {
      await attempt(experience, owner, 'http_probe', { route: `/api/${index}` }, success({ status: 200, route: index }))
    }
    expect(await experience.diagnose(owner)).toBeUndefined()
    for (let index = 3; index < 5; index++) {
      await attempt(experience, owner, 'http_probe', { route: `/api/${index}` }, success({ status: 200, route: index }))
    }
    expect((await experience.diagnose(owner))?.nextStep).toBe('capture-evidence')
  })

  it('abstracts target data before storing transferable lessons', () => {
    expect(abstractLessonText('Probe https://example.test/admin on 192.0.2.10')).toBe('Probe TARGET_URL on TARGET_IP')
  })
})
