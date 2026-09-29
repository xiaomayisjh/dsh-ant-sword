/**
 * Durable, evidence-gated experience for autonomous investigations.
 * Attempts retain fingerprints and error classes, never raw tool arguments or
 * results. A lesson becomes reusable advice only after independent sessions
 * support it with a completed/abandoned Intent and a linked Fact.
 */

import { createHash, randomUUID } from 'node:crypto'
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { Domain, DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { defineTool, RUN_CODE_NAME } from '@deepseek-ai/dsh-tools'
import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import z from 'zod'
import type { ModelAdaptationProfile } from './model-adaptation.ts'
import type { BoardSnapshot } from './types.ts'

const ATTEMPT_WINDOW_MS = 10 * 60_000
const MAX_TEXT = 1_500
const DEFAULT_RECALL = 5
const MAX_RECALL = 8
const DEFAULT_TOOL_RECALL = 2
const DEFAULT_SUMMARY_CHARS = 2_000
const DEFAULT_EXCERPT_CHARS = 500
const MAX_SUMMARY_CHARS = 12_000

interface ExperienceBudget {
  readonly lessonCount: number
  readonly summaryChars: number
  readonly excerptChars: number
}

function clampBudget(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return value !== undefined && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, Math.trunc(value)))
    : fallback
}

async function budgetFor(ctx: Context, agent: NonNullable<ToolExecution['agent']>): Promise<ExperienceBudget> {
  // The plugin also mounts without model-adaptation (for example in a minimal
  // Cordis host). Keep that route useful while bounding every tool response.
  const adaptation = ctx.get('modelAdaptation')
  const profile: ModelAdaptationProfile | undefined = await adaptation?.profile(agent)
  return {
    lessonCount: clampBudget(profile?.lessonCount, DEFAULT_TOOL_RECALL, 1, MAX_RECALL),
    summaryChars: clampBudget(profile?.boardChars, DEFAULT_SUMMARY_CHARS, 512, MAX_SUMMARY_CHARS),
    excerptChars: clampBudget(profile?.evidenceChars, DEFAULT_EXCERPT_CHARS, 80, MAX_TEXT * 2),
  }
}

function clip(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, Math.max(0, maximum - 1))}…`
}

export interface ExperienceConfig {
  stallThreshold?: number
}

export type AttemptOutcome = 'success' | 'transient' | 'missing-capability' | 'missing-prerequisite' | 'error'
export type LessonStatus = 'candidate' | 'validated' | 'avoid'

export interface AttemptRecord {
  id: string
  sessionId: string
  intentId?: string
  rootCallId: string
  toolName: string
  actionHash: string
  resultHash: string
  outcome: AttemptOutcome
  errorCode?: string
  time: number
}

interface LessonEvaluation {
  sessionId: string
  result: 'worked' | 'failed'
  evidenceNodeId: string
  time: number
}

export interface LessonRecord {
  id: string
  situation: string
  strategy: string
  status: LessonStatus
  evaluations: LessonEvaluation[]
  updatedAt: number
}

export interface LessonProposal {
  intentId: string
  evidenceNodeId: string
  situation: string
  strategy: string
  result: 'worked' | 'failed'
}

export interface RecoveryDiagnosis {
  intentId: string
  attemptsWithoutProgress: number
  reason: string
  nextStep: 'retry-with-backoff' | 'switch-capability' | 'resolve-prerequisite' | 'switch-method' | 'replan-branch' | 'capture-evidence'
}

export interface ExperienceReadResult {
  readonly summary: string
  readonly nextOffset?: number
}

const attemptSchema: z.ZodType<AttemptRecord> = z.object({
  id: z.string(), sessionId: z.string(), intentId: z.string().optional(),
  rootCallId: z.string(), toolName: z.string(), actionHash: z.string(),
  resultHash: z.string(), outcome: z.enum(['success', 'transient', 'missing-capability', 'missing-prerequisite', 'error']),
  errorCode: z.string().optional(), time: z.number(),
}) as z.ZodType<AttemptRecord>

const lessonSchema: z.ZodType<LessonRecord> = z.object({
  id: z.string(), situation: z.string(), strategy: z.string(),
  status: z.enum(['candidate', 'validated', 'avoid']),
  evaluations: z.array(z.object({
    sessionId: z.string(), result: z.enum(['worked', 'failed']),
    evidenceNodeId: z.string(), time: z.number(),
  })),
  updatedAt: z.number(),
}) as z.ZodType<LessonRecord>

export const experienceDomain = defineDomain({
  name: 'ant_sword_experience',
  version: 1,
  tables: {
    attempts: domainTable<string, AttemptRecord>(attemptSchema),
    lessons: domainTable<string, LessonRecord>(lessonSchema),
  },
})

type ExperienceDomain = Domain<typeof experienceDomain>

declare module '@deepseek-ai/cordis' {
  interface Context {
    experience: ExperienceService
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Keep a transferable method while stripping target-specific data. */
export function abstractLessonText(input: string): string {
  const text = input.trim().slice(0, MAX_TEXT)
    .replace(/\bhttps?:\/\/[^\s)\]]+/gi, 'TARGET_URL')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, 'TARGET_IP')
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, 'TOKEN')
    .replace(/\b[A-Za-z0-9+/=_-]{48,}\b/g, 'TOKEN')
  if (text.length < 8) throw new TypeError('experience text needs at least 8 characters')
  return text
}

function outcomeOf(result: Readonly<ToolExecutionResult>): { outcome: AttemptOutcome; errorCode?: string } {
  if (!result.isError) return { outcome: 'success' }
  const code = result.error.info?.code ?? result.error.info?.name ?? 'TOOL_ERROR'
  const signal = `${code} ${result.error.message}`
  if (/TIMEOUT|TIMED_OUT|RATE.?LIMIT|429|ECONNRESET|EAI_AGAIN|502|503|504/i.test(signal)) {
    return { outcome: 'transient', errorCode: code }
  }
  if (/UNKNOWN_TOOL|ENOENT|COMMAND_NOT_FOUND|NOT_INSTALLED|MODULE_NOT_FOUND/i.test(signal)) {
    return { outcome: 'missing-capability', errorCode: code }
  }
  if (/AUTH|UNAUTHORIZED|FORBIDDEN|401|403|MISSING_TOKEN|MISSING_CREDENTIAL/i.test(signal)) {
    return { outcome: 'missing-prerequisite', errorCode: code }
  }
  return { outcome: 'error', errorCode: code }
}

function lessonStatus(evaluations: readonly LessonEvaluation[]): LessonStatus {
  const wins = evaluations.filter(item => item.result === 'worked').length
  const losses = evaluations.length - wins
  if (wins >= 2 && wins > losses * 2) return 'validated'
  if (losses >= 2 && losses > wins * 2) return 'avoid'
  return 'candidate'
}

function terms(text: string): Set<string> {
  const normalized = text.toLowerCase()
  const result = new Set(normalized.match(/[a-z0-9_-]{3,}/g) ?? [])
  for (const run of normalized.match(/[\p{Script=Han}]+/gu) ?? []) {
    for (let index = 0; index < run.length - 1; index++) result.add(run.slice(index, index + 2))
  }
  return result
}

function relevance(query: string, situation: string): number {
  const a = terms(query)
  const b = terms(situation)
  if (a.size === 0 || b.size === 0) return 0
  let overlap = 0
  for (const term of a) if (b.has(term)) overlap++
  return overlap / Math.max(a.size, b.size)
}

function attemptsFor(domain: ExperienceDomain, sessionId: string, intentId?: string): AttemptRecord[] {
  const records: AttemptRecord[] = []
  for (const [, attempt] of domain.table('attempts').entries()) {
    if (attempt.sessionId === sessionId && (intentId === undefined || attempt.intentId === intentId)) records.push(attempt)
  }
  return records.sort((a, b) => a.time - b.time)
}

function claimedIntent(snapshot: BoardSnapshot): string | undefined {
  return snapshot.nodes.filter(node => node.kind === 'intent' && node.status === 'claimed').at(-1)?.id
}

function recallSummary(lessons: readonly LessonRecord[], diagnosis: RecoveryDiagnosis | undefined, budget: ExperienceBudget): string {
  const lines = [diagnosis === undefined ? 'No current stall diagnosis.'
    : `Recovery: Intent #${diagnosis.intentId}, ${diagnosis.attemptsWithoutProgress} attempts without evidence; ${diagnosis.nextStep}. ${diagnosis.reason}`]
  let used = lines[0]!.length
  let included = 0
  for (const lesson of lessons) {
    const wins = lesson.evaluations.filter(item => item.result === 'worked').length
    const losses = lesson.evaluations.length - wins
    const prefix = `#${lesson.id} [${lesson.status}; ${wins} worked, ${losses} failed] `
    const room = budget.summaryChars - used - prefix.length - 100
    if (room < 24) break
    const excerpt = Math.min(budget.excerptChars, room)
    const situation = clip(lesson.situation, Math.max(12, Math.floor(excerpt * 0.45)))
    const strategy = clip(lesson.strategy, Math.max(12, excerpt - situation.length - 4))
    const line = `${prefix}${situation} -> ${strategy}`
    lines.push(line)
    used += line.length + 1
    included++
  }
  if (lessons.length === 0) lines.push('No matching experience yet; test a new hypothesis and record the observed outcome.')
  else if (included < lessons.length) lines.push(`${lessons.length - included} matching lesson(s) omitted by context budget; narrow the situation to retrieve them.`)
  if (included > 0) lines.push('Use experience_read(id="LESSON_ID", offset=0) for a full lesson.')
  return clip(lines.join('\n'), budget.summaryChars)
}

/** Durable attempt ledger and evidence-gated, cross-session lesson registry. */
export class ExperienceService extends Service {
  static inject = ['storageDomain', 'blackboard']

  private readonly domainReady: Promise<ExperienceDomain>
  private tail: Promise<void> = Promise.resolve()
  private readonly stallThreshold: number

  constructor(ctx: Context, config: ExperienceConfig = {}, facility?: DomainFacility) {
    super(ctx, 'experience')
    const threshold = config.stallThreshold ?? 3
    if (!Number.isSafeInteger(threshold) || threshold < 1) {
      throw new TypeError('experience stallThreshold must be a positive safe integer')
    }
    this.stallThreshold = threshold
    this.domainReady = (facility ?? ctx.storageDomain).open(experienceDomain)
    void this.domainReady.catch(() => undefined)
    ctx.effect(async () => {
      const domain = await this.domainReady.catch(() => undefined)
      return () => { void domain?.close() }
    }, 'ant-sword-experience: domain')
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation)
    this.tail = next.then(() => undefined, () => undefined)
    return next
  }

  async observe(exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): Promise<AttemptRecord | undefined> {
    const agent = exec.agent
    // run_code is the PTC transport. Its nested dispatches each emit their
    // own tools/result; counting the outer transport duplicates attempts and
    // can turn a failed probe into an apparent success.
    if (agent === undefined || exec.name === RUN_CODE_NAME
      || /^(?:board_|experience_|mcp_capabilities$|model_capabilities$|get_goal$|create_goal$|update_goal$)/.test(exec.name)) return undefined
    const time = Date.now()
    return this.serialize(async () => {
      const snapshot = await this.ctx.blackboard.snapshot(agent.session)
      const intentId = claimedIntent(snapshot)
      if (intentId === undefined) return undefined
      const classification = outcomeOf(result)
      const record: AttemptRecord = {
        id: randomUUID(), sessionId: agent.session.id,
        intentId,
        rootCallId: String(exec.rootCallId), toolName: exec.name,
        actionHash: hash(`${exec.name}:${stableJson(exec.arguments)}`),
        resultHash: hash(result.isError ? stableJson(result.error) : stableJson(result.value)),
        ...classification, time,
      }
      const domain = await this.domainReady
      await domain.table('attempts').put(record.id, record)
      return record
    })
  }

  async propose(session: Session, proposal: LessonProposal): Promise<LessonRecord> {
    return this.serialize(async () => {
      const snapshot = await this.ctx.blackboard.snapshot(session)
      const intent = snapshot.nodes.find(node => node.id === proposal.intentId && node.kind === 'intent')
      const fact = snapshot.nodes.find(node => node.id === proposal.evidenceNodeId && node.kind === 'fact')
      if (intent === undefined || fact === undefined || fact.parentId !== intent.id || !fact.detail?.trim()) {
        throw new TypeError('experience needs a detailed Fact linked to an Intent in this session')
      }
      if (proposal.result === 'worked' && intent.status !== 'done') {
        throw new TypeError('worked experience requires a completed Intent')
      }
      if (proposal.result === 'failed' && intent.status !== 'abandoned') {
        throw new TypeError('failed experience requires an abandoned Intent')
      }
      const domain = await this.domainReady
      const recentAttempts = attemptsFor(domain, session.id, intent.id)
        .filter(item => item.time <= fact.time && fact.time - item.time <= ATTEMPT_WINDOW_MS)
      if (recentAttempts.length === 0 || (proposal.result === 'worked' && !recentAttempts.some(item => item.outcome === 'success'))) {
        throw new TypeError('experience needs a matching tool attempt before its evidence')
      }
      const situation = abstractLessonText(proposal.situation)
      const strategy = abstractLessonText(proposal.strategy)
      const id = hash(`${situation.toLowerCase()}\n${strategy.toLowerCase()}`)
      const previous = domain.table('lessons').get(id)
      const evaluation: LessonEvaluation = {
        sessionId: session.id, result: proposal.result, evidenceNodeId: fact.id, time: Date.now(),
      }
      const evaluations = [...(previous?.evaluations ?? []).filter(item => item.sessionId !== session.id), evaluation]
      const lesson: LessonRecord = { id, situation, strategy, evaluations, status: lessonStatus(evaluations), updatedAt: Date.now() }
      await domain.table('lessons').put(id, lesson)
      return lesson
    })
  }

  async recall(situation: string, limit = DEFAULT_RECALL): Promise<LessonRecord[]> {
    const query = abstractLessonText(situation)
    const domain = await this.domainReady
    const scored: Array<{ lesson: LessonRecord; score: number }> = []
    for (const [, lesson] of domain.table('lessons').entries()) {
      const score = relevance(query, lesson.situation)
      if (score > 0) scored.push({ lesson, score })
    }
    return scored.sort((a, b) => b.score - a.score || b.lesson.evaluations.length - a.lesson.evaluations.length)
      .slice(0, Math.max(1, Math.min(MAX_RECALL, limit))).map(item => item.lesson)
  }

  async read(id: string, offset = 0, pageChars = DEFAULT_SUMMARY_CHARS): Promise<ExperienceReadResult> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new TypeError('experience id must be a SHA-256 lesson id')
    if (!Number.isSafeInteger(offset) || offset < 0) throw new TypeError('offset must be a nonnegative safe integer')
    const domain = await this.domainReady
    const lesson = domain.table('lessons').get(id)
    if (lesson === undefined) throw new TypeError(`experience #${id} does not exist`)
    const full = JSON.stringify(lesson, null, 2)
    if (offset > full.length) throw new TypeError('offset exceeds lesson length')
    const cap = clampBudget(pageChars, DEFAULT_SUMMARY_CHARS, 512, MAX_SUMMARY_CHARS)
    // Leave room for a stable page header and a next-page instruction.
    const chunk = full.slice(offset, offset + cap - 300)
    const next = offset + chunk.length
    const suffix = next < full.length ? `\nNext page: experience_read(id="${id}", offset=${next}).` : ''
    return {
      summary: `Experience #${id}, chars ${offset}-${next}/${full.length}:\n${chunk}${suffix}`,
      ...(next < full.length ? { nextOffset: next } : {}),
    }
  }

  async diagnose(session: Session): Promise<RecoveryDiagnosis | undefined> {
    await this.tail
    const snapshot = await this.ctx.blackboard.snapshot(session)
    const intentId = claimedIntent(snapshot)
    if (intentId === undefined) return undefined
    const domain = await this.domainReady
    const latestFactTime = Math.max(0, ...snapshot.nodes
      .filter(node => node.kind === 'fact' && node.parentId === intentId).map(node => node.time))
    const recent = attemptsFor(domain, session.id, intentId).filter(item => item.time > latestFactTime)
    if (recent.length < this.stallThreshold) return undefined
    const last = recent.at(-1)
    if (last === undefined) return undefined
    const latestWindow = recent.slice(-this.stallThreshold)
    const novelSuccesses = latestWindow.every(item => item.outcome === 'success')
      && new Set(latestWindow.map(item => item.resultHash)).size === latestWindow.length
    if (novelSuccesses && recent.length < this.stallThreshold + 2) return undefined
    let nextStep: RecoveryDiagnosis['nextStep'] = 'replan-branch'
    if (last.outcome === 'transient') nextStep = 'retry-with-backoff'
    else if (last.outcome === 'missing-capability') nextStep = 'switch-capability'
    else if (last.outcome === 'missing-prerequisite') nextStep = 'resolve-prerequisite'
    else if (novelSuccesses) nextStep = 'capture-evidence'
    else if (latestWindow.every(item => item.actionHash === last.actionHash && item.resultHash === last.resultHash)) nextStep = 'switch-method'
    return {
      intentId, attemptsWithoutProgress: recent.length,
      reason: `No linked Fact after ${recent.length} tool attempts; latest outcome: ${last.outcome}.`,
      nextStep,
    }
  }
}

/** Register self-evolution tools and observe final tool outcomes. */
export function applyExperience(ctx: Context, config: ExperienceConfig = {}): void {
  ctx.plugin(ExperienceService, config)
  ctx.inject(['experience', 'tools'], scope => {
    scope.on('tools/result', (exec, result) => {
      void scope.experience.observe(exec, result).catch(error => scope.logger.warn(error))
    }, { global: true })

    scope.tools.register(defineTool({
      name: 'experience_recall',
      description: 'Before planning or after a stall, retrieve bounded evidence-backed strategies and a structured recovery diagnosis. Validated lessons have succeeded in at least two independent sessions; candidates are hypotheses. Use experience_read with a returned ID for the full record.',
      parameters: {
        situation: { type: 'string', required: true, description: 'Abstract current service, failure mode, and objective; omit credentials and target identifiers.' },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { summary: { type: 'string', required: true } } },
        render: (_args, value) => [{ type: 'text', text: value.summary }],
      },
      async execute(args, exec) {
        if (!exec.agent) throw new Error('experience_recall requires an owning agent session')
        const budget = await budgetFor(scope, exec.agent)
        const [lessons, diagnosis] = await Promise.all([
          scope.experience.recall(args.situation, budget.lessonCount), scope.experience.diagnose(exec.agent.session),
        ])
        return { summary: recallSummary(lessons, diagnosis, budget) }
      },
    }))

    scope.tools.register(defineTool({
      name: 'experience_read',
      description: 'Read a complete experience record by the ID returned from experience_recall. Long records are paged; pass nextOffset as offset until complete.',
      parameters: {
        id: { type: 'string', required: true, description: 'SHA-256 lesson ID from experience_recall.' },
        offset: { type: 'integer', description: 'Character offset of the next page; omit for the first page.' },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: {
          summary: { type: 'string', required: true }, nextOffset: { type: 'integer' },
        } },
        render: (_args, value) => [{ type: 'text', text: value.summary }],
      },
      async execute(args, exec) {
        if (!exec.agent) throw new Error('experience_read requires an owning agent session')
        return scope.experience.read(args.id, args.offset, (await budgetFor(scope, exec.agent)).summaryChars)
      },
    }))

    scope.tools.register(defineTool({
      name: 'experience_record',
      description: 'After closing an Intent, record a transferable method or dead end using a detailed Fact linked to that Intent. Evidence from one session stays a candidate; independent sessions can validate or disconfirm it.',
      parameters: {
        intentId: { type: 'string', required: true },
        evidenceNodeId: { type: 'string', required: true },
        situation: { type: 'string', required: true, description: 'Abstract conditions under which the method applies.' },
        strategy: { type: 'string', required: true, description: 'Reusable action or method, without target-specific secrets.' },
        result: { type: 'string', required: true, enum: ['worked', 'failed'] },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: {
          id: { type: 'string', required: true }, status: { type: 'string', required: true },
          independentSessions: { type: 'integer', required: true },
        } },
        render: (_args, value) => [{ type: 'text', text: `experience: ${value.status} (${value.independentSessions} independent session(s)) #${value.id}` }],
      },
      async execute(args, exec) {
        if (!exec.agent) throw new Error('experience_record requires an owning agent session')
        const lesson = await scope.experience.propose(exec.agent.session, {
          intentId: args.intentId, evidenceNodeId: args.evidenceNodeId,
          situation: args.situation, strategy: args.strategy, result: args.result,
        })
        return { id: lesson.id, status: lesson.status, independentSessions: lesson.evaluations.length }
      },
    }))
  })
}
