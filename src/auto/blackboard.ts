/**
 * Session blackboard. Domain writes are durable before their corresponding
 * board/change event is appended to the session projection stream.
 * @module @deepseek-ai/dsh-ant-sword-harness/auto/blackboard
 */

import { randomBytes } from 'node:crypto'
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { Domain, DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { blackboardDomain } from './domain.ts'
import type { BoardChangeMeta } from './domain.ts'
import type { BoardNode, BoardNodeKind, BoardRunState, BoardSnapshot, IntentClaim, IntentStatus } from './types.ts'

export const BOARD_CHANGE = 'board/change'

type BoardDomain = Domain<typeof blackboardDomain>

declare module '@deepseek-ai/cordis' {
  interface Context {
    blackboard: BlackboardService
  }
  interface Events {
    /** Emitted after each committed blackboard mutation, with the owning session. */
    'board/changed'(session: Session, snapshot: BoardSnapshot): void
  }
}

function newNodeId(): string {
  return randomBytes(8).toString('hex')
}

const DEFAULT_CLAIM_LEASE_MS = 10 * 60 * 1000

function withIntentStatus(node: BoardNode, status: IntentStatus, claim?: IntentClaim): BoardNode {
  const { claim: _previousClaim, ...withoutClaim } = node
  return { ...withoutClaim, status, ...(claim === undefined ? {} : { claim }) }
}

/** Input accepted by add; the service fills id, creation time, and cycle. */
export interface AddNodeInput {
  readonly kind: BoardNodeKind
  readonly label: string
  readonly detail?: string
  readonly parentId?: string
  readonly status?: IntentStatus
}

/** Optional claim identity and duration for a transition to `claimed`. */
export interface ClaimOptions {
  readonly owner?: string
  readonly leaseMs?: number
  readonly now?: number
}

/** One durable graph and controller state per session. */
export class BlackboardService extends Service {
  static inject = ['storageDomain']

  private readonly domainReady: Promise<BoardDomain>
  /** Serializes validation with writes, including concurrent same-session calls. */
  private mutationTail: Promise<void> = Promise.resolve()

  constructor(ctx: Context, facility?: DomainFacility) {
    super(ctx, 'blackboard')
    const source = facility ?? ctx.storageDomain
    this.domainReady = source.open(blackboardDomain)
    void this.domainReady.catch(() => undefined)
    ctx.effect(async () => {
      const domain = await this.domainReady.catch(() => undefined)
      return () => { void domain?.close() }
    }, 'ant-sword-blackboard: domain')
  }

  private static sessionId(session: Session): string {
    if (typeof session.id !== 'string' || session.id.length === 0) {
      throw new Error('blackboard requires a session with a nonempty id')
    }
    return session.id
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.mutationTail.then(operation)
    this.mutationTail = pending.then(() => undefined, () => undefined)
    return pending
  }

  private stateFrom(domain: BoardDomain, sessionId: string): BoardRunState {
    return domain.table('run_states').get(sessionId) ?? {
      sessionId, generation: 0, cycle: 0, paused: false, complete: false, startedAt: 0,
    }
  }

  private nodesFrom(domain: BoardDomain, sessionId: string): BoardNode[] {
    const generation = this.stateFrom(domain, sessionId).generation ?? 0
    const nodes: BoardNode[] = []
    for (const [, node] of domain.table('nodes').entries()) {
      if (node.sessionId === sessionId && (node.generation ?? 0) === generation) nodes.push(node)
    }
    return nodes.sort((a, b) => a.time - b.time)
  }

  private snapshotFrom(domain: BoardDomain, sessionId: string): BoardSnapshot {
    const state = this.stateFrom(domain, sessionId)
    return {
      nodes: this.nodesFrom(domain, sessionId),
      cycle: state.cycle,
      paused: state.paused,
      complete: state.complete,
    }
  }

  private publish(session: Session, domain: BoardDomain, change: BoardChangeMeta): void {
    session.append(BOARD_CHANGE, change)
    this.ctx.emit('board/changed', session, this.snapshotFrom(domain, session.id))
  }

  /** All nodes for one session, creation order. */
  async nodes(session: Session): Promise<BoardNode[]> {
    const sessionId = BlackboardService.sessionId(session)
    await this.mutationTail
    const domain = await this.domainReady
    return this.nodesFrom(domain, sessionId)
  }

  /** Durable run state; startedAt is zero until the first cycle begins. */
  async runState(session: Session): Promise<BoardRunState> {
    const sessionId = BlackboardService.sessionId(session)
    await this.mutationTail
    const domain = await this.domainReady
    return this.stateFrom(domain, sessionId)
  }

  /** A consistent point-in-time read of one session's board. */
  async snapshot(session: Session): Promise<BoardSnapshot> {
    const sessionId = BlackboardService.sessionId(session)
    await this.mutationTail
    const domain = await this.domainReady
    return this.snapshotFrom(domain, sessionId)
  }

  /** Add one graph node after validating goal uniqueness and parent ownership. */
  async add(session: Session, input: AddNodeInput): Promise<BoardNode> {
    const sessionId = BlackboardService.sessionId(session)
    return this.enqueue(async () => {
      const domain = await this.domainReady
      const table = domain.table('nodes')
      const generation = this.stateFrom(domain, sessionId).generation ?? 0
      if (!['fact', 'intent', 'hint', 'goal'].includes(input.kind)) {
        throw new Error(`invalid blackboard node kind: ${String(input.kind)}`)
      }
      if (typeof input.label !== 'string' || input.label.trim().length === 0) {
        throw new Error('blackboard node label must be nonempty')
      }
      if (input.detail !== undefined && typeof input.detail !== 'string') {
        throw new Error('blackboard node detail must be a string')
      }
      if (input.parentId !== undefined && (typeof input.parentId !== 'string' || input.parentId.length === 0)) {
        throw new Error('blackboard parent id must be nonempty')
      }
      if (input.kind === 'goal') {
        if (input.parentId !== undefined) throw new Error('blackboard goal cannot have a parent')
        if (this.nodesFrom(domain, sessionId).some(node => node.kind === 'goal')) {
          throw new Error(`blackboard session '${sessionId}' already has a goal`)
        }
      }
      if (input.parentId !== undefined) {
        const parent = table.get(input.parentId)
        if (parent === undefined || parent.sessionId !== sessionId
          || (parent.generation ?? 0) !== generation) {
          throw new Error(`blackboard parent '${input.parentId}' does not belong to session '${sessionId}'`)
        }
      }
      if (input.kind === 'intent') {
        if (input.status !== undefined && input.status !== 'open') {
          throw new Error('new blackboard intent must start open')
        }
      } else if (input.status !== undefined) {
        throw new Error(`blackboard ${input.kind} cannot have an intent status`)
      }
      let id = newNodeId()
      while (table.get(id) !== undefined) id = newNodeId()
      const node: BoardNode = {
        id,
        sessionId,
        ...(generation > 0 ? { generation } : {}),
        kind: input.kind,
        label: input.label,
        ...(input.detail !== undefined ? { detail: input.detail } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.kind === 'intent' ? { status: 'open' as const } : {}),
        time: Date.now(),
        cycle: this.stateFrom(domain, sessionId).cycle,
      }
      await table.put(node.id, node)
      this.publish(session, domain, { op: 'add', node })
      return node
    })
  }

  /** Transition an Intent: open -> claimed -> done or abandoned. */
  async setStatus(session: Session, nodeId: string, status: IntentStatus, options?: ClaimOptions): Promise<void> {
    const sessionId = BlackboardService.sessionId(session)
    await this.enqueue(async () => {
      const domain = await this.domainReady
      const table = domain.table('nodes')
      const node = table.get(nodeId)
      if (node === undefined || node.sessionId !== sessionId
        || (node.generation ?? 0) !== (this.stateFrom(domain, sessionId).generation ?? 0)) {
        throw new Error(`blackboard intent '${nodeId}' does not belong to session '${sessionId}'`)
      }
      if (node.kind !== 'intent') throw new Error(`blackboard node '${nodeId}' is not an intent`)
      const current = node.status ?? 'open' // older v1 intents omitted status
      const valid = (current === 'open' && status === 'claimed')
        || (current === 'claimed' && (status === 'done' || status === 'abandoned'))
      if (!valid) throw new Error(`invalid blackboard intent transition: ${current} -> ${status}`)
      if (status !== 'claimed' && options !== undefined) {
        throw new Error('blackboard claim options require status claimed')
      }
      let claim: IntentClaim | undefined
      if (status === 'claimed') {
        const owner = options?.owner ?? sessionId
        const now = options?.now ?? Date.now()
        const leaseMs = options?.leaseMs ?? DEFAULT_CLAIM_LEASE_MS
        if (typeof owner !== 'string' || owner.length === 0) throw new Error('blackboard claim owner must be nonempty')
        if (!Number.isSafeInteger(now) || now < 0) throw new Error('blackboard claim time must be a nonnegative safe integer')
        if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0 || !Number.isSafeInteger(now + leaseMs)) {
          throw new Error('blackboard claim lease must fit a positive safe integer duration')
        }
        claim = { owner, leaseUntil: now + leaseMs }
      }
      await table.update(nodeId, value => withIntentStatus(value, status, claim))
      this.publish(session, domain, {
        op: 'status', nodeId, status, ...(claim === undefined ? {} : { claim }),
      })
    })
  }

  private async recover(session: Session, expired: (node: BoardNode) => boolean): Promise<number> {
    const sessionId = BlackboardService.sessionId(session)
    return this.enqueue(async () => {
      const domain = await this.domainReady
      const table = domain.table('nodes')
      const claimed = this.nodesFrom(domain, sessionId)
        .filter(node => node.kind === 'intent' && node.status === 'claimed' && expired(node))
      for (const node of claimed) {
        await table.update(node.id, value => withIntentStatus(value, 'open'))
        session.append(BOARD_CHANGE, { op: 'status', nodeId: node.id, status: 'open' })
      }
      if (claimed.length > 0) this.ctx.emit('board/changed', session, this.snapshotFrom(domain, sessionId))
      return claimed.length
    })
  }

  /** Explicitly reopen all claims left in flight after a confirmed restart. */
  async recoverClaimed(session: Session): Promise<number> {
    return this.recover(session, () => true)
  }

  /** Reopen only expired claims; older claimed nodes without a lease are stale. */
  async recoverExpiredClaims(session: Session, now = Date.now()): Promise<number> {
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('blackboard recovery time must be a nonnegative safe integer')
    return this.recover(session, node => (node.claim?.leaseUntil ?? 0) <= now)
  }

  /** Archive the current run by advancing its generation in one durable write. */
  async resetRun(session: Session): Promise<number> {
    const sessionId = BlackboardService.sessionId(session)
    return this.enqueue(async () => {
      const domain = await this.domainReady
      const current = this.stateFrom(domain, sessionId)
      const generation = (current.generation ?? 0) + 1
      if (!Number.isSafeInteger(generation)) throw new Error('blackboard generation exceeded the safe integer range')
      await domain.table('run_states').put(sessionId, {
        sessionId, generation, cycle: 0, paused: false, complete: false, startedAt: 0,
      })
      this.publish(session, domain, { op: 'reset', generation })
      return generation
    })
  }

  /** Start the wall-clock budget once, before the first admitted Goal round. */
  async startRun(session: Session, now = Date.now()): Promise<number> {
    const sessionId = BlackboardService.sessionId(session)
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error('blackboard run start must be a positive safe integer time')
    return this.enqueue(async () => {
      const domain = await this.domainReady
      const current = this.stateFrom(domain, sessionId)
      if (current.startedAt !== 0) return current.startedAt
      await domain.table('run_states').put(sessionId, { ...current, startedAt: now })
      return now
    })
  }

  /** Advance to a scheduler-owned cycle without incrementing twice. */
  async advanceToCycle(session: Session, target: number): Promise<number> {
    const sessionId = BlackboardService.sessionId(session)
    if (!Number.isSafeInteger(target) || target < 0) throw new Error('blackboard cycle must be a nonnegative safe integer')
    return this.enqueue(async () => {
      const domain = await this.domainReady
      const current = this.stateFrom(domain, sessionId)
      if (target <= current.cycle) return current.cycle
      await domain.table('run_states').put(sessionId, {
        ...current, cycle: target, startedAt: current.startedAt || Date.now(),
      })
      this.publish(session, domain, { op: 'cycle', cycle: target })
      return target
    })
  }

  /** Advance the OODA cycle by one. */
  async nextCycle(session: Session): Promise<number> {
    const sessionId = BlackboardService.sessionId(session)
    return this.enqueue(async () => {
      const domain = await this.domainReady
      const current = this.stateFrom(domain, sessionId)
      if (!Number.isSafeInteger(current.cycle + 1)) throw new Error('blackboard cycle exceeded the safe integer range')
      const next = current.cycle + 1
      await domain.table('run_states').put(sessionId, {
        ...current, cycle: next, startedAt: current.startedAt || Date.now(),
      })
      this.publish(session, domain, { op: 'cycle', cycle: next })
      return next
    })
  }

  /** Persist the operator pause flag. Repeating the same value is a no-op. */
  async setPaused(session: Session, paused: boolean): Promise<void> {
    const sessionId = BlackboardService.sessionId(session)
    if (typeof paused !== 'boolean') throw new Error('blackboard paused flag must be a boolean')
    await this.enqueue(async () => {
      const domain = await this.domainReady
      const current = this.stateFrom(domain, sessionId)
      if (current.paused === paused) return
      await domain.table('run_states').put(sessionId, { ...current, paused })
      this.publish(session, domain, { op: 'paused', paused })
    })
  }

  async isPaused(session: Session): Promise<boolean> {
    return (await this.runState(session)).paused
  }

  /** Persist completion. Repeated calls remain idempotent across restarts. */
  async markComplete(session: Session): Promise<void> {
    const sessionId = BlackboardService.sessionId(session)
    await this.enqueue(async () => {
      const domain = await this.domainReady
      const current = this.stateFrom(domain, sessionId)
      if (current.complete) return
      await domain.table('run_states').put(sessionId, { ...current, complete: true })
      this.publish(session, domain, { op: 'complete', complete: true })
    })
  }

  async isComplete(session: Session): Promise<boolean> {
    return (await this.runState(session)).complete
  }
}

/** Rebuild the Web board projection from session board/change events. */
export function applyBoardProjection(
  state: BoardSnapshot | null,
  event: SessionEvent,
): BoardSnapshot | null {
  if (event.type !== BOARD_CHANGE) return state
  const data = event.data
  const current: BoardSnapshot = state ?? { nodes: [], cycle: 0, paused: false, complete: false }
  if (data.op === 'add') return { ...current, nodes: [...current.nodes, data.node] }
  if (data.op === 'reset') return { nodes: [], cycle: 0, paused: false, complete: false }
  if (data.op === 'status') {
    return {
      ...current,
      nodes: current.nodes.map(node => node.id === data.nodeId
        ? withIntentStatus(node, data.status, data.claim)
        : node),
    }
  }
  if (data.op === 'cycle') return { ...current, cycle: data.cycle }
  if (data.op === 'paused') return { ...current, paused: data.paused }
  if (data.op === 'complete') return { ...current, complete: data.complete }
  return state
}
