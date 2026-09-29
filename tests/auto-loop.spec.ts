/**
 * Autonomous-loop behavior: the blackboard's add/claim/abandon/complete
 * transitions, the pause/resume/inject-hint operator surface, the stall
 * detector's direction-change guard, and the projection fold the Web graph
 * renders. Blackboard runs over a real Context + storage hub + memory
 * backend; the session is a minimal stand-in carrying id + append.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { MemoryStorageBackend } from './helpers/memory-backend.ts'
import { BlackboardService, applyBoardProjection } from '../src/auto/blackboard.ts'
import type { BoardNode, BoardSnapshot } from '../src/auto/types.ts'

// The board/change declaration merge lives in the auto domain module; importing
// it (transitively, via blackboard) widens Session.append's accepted types here.
import type {} from '../src/auto/domain.ts'

/** A minimal Session stand-in: id + an append that records events. */
function fakeSession(id: string, events: SessionEvent[] = []): Session {
  return {
    id,
    append: (type: string, data: unknown) => {
      const ev = { type, data, seq: events.length, time: Date.now() } as unknown as SessionEvent
      events.push(ev)
      return ev
    },
  } as unknown as Session
}

async function harness(backend = new MemoryStorageBackend()) {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', backend)
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  const board = new BlackboardService(ctx, facility)
  return { ctx, board, facility }
}

describe('blackboard service', () => {
  it('adds facts/intents/hints, transitions intents, and snapshots the graph', async () => {
    const { board } = await harness()
    const session = fakeSession('s1')

    const goal = await board.add(session, { kind: 'goal', label: 'get a shell on TARGET' })
    const recon = await board.add(session, { kind: 'intent', label: 'port-scan TARGET', parentId: goal.id, status: 'open' })
    const fact = await board.add(session, { kind: 'fact', label: 'port 22 open', parentId: recon.id })

    let snap = await board.snapshot(session)
    expect(snap.nodes).toHaveLength(3)
    expect(snap.cycle).toBe(0)
    expect(snap.paused).toBe(false)
    expect(snap.complete).toBe(false)
    expect(snap.nodes.map(n => n.kind)).toEqual(['goal', 'intent', 'fact'])
    expect(fact.parentId).toBe(recon.id)

    await board.setStatus(session, recon.id, 'claimed')
    await board.setStatus(session, recon.id, 'done')
    snap = await board.snapshot(session)
    expect(snap.nodes.find(n => n.id === recon.id)?.status).toBe('done')
  })

  it('advances the OODA cycle and tracks pause/complete flags', async () => {
    const { board } = await harness()
    const session = fakeSession('s2')

    expect(await board.isPaused(session)).toBe(false)
    expect(await board.isComplete(session)).toBe(false)

    expect(await board.nextCycle(session)).toBe(1)
    expect(await board.nextCycle(session)).toBe(2)

    await board.setPaused(session, true)
    expect(await board.isPaused(session)).toBe(true)

    await board.markComplete(session)
    expect(await board.isComplete(session)).toBe(true)

    const snap = await board.snapshot(session)
    expect(snap.cycle).toBe(2)
    expect(snap.paused).toBe(true)
    expect(snap.complete).toBe(true)
  })

  it('isolates boards per session', async () => {
    const { board } = await harness()
    const a = fakeSession('a')
    const b = fakeSession('b')
    await board.add(a, { kind: 'fact', label: 'only-on-a' })
    expect((await board.snapshot(a)).nodes).toHaveLength(1)
    expect((await board.snapshot(b)).nodes).toHaveLength(0)
  })

  it('rejects duplicate goals, foreign parents, and invalid Intent transitions', async () => {
    const { board } = await harness()
    const a = fakeSession('validation-a')
    const b = fakeSession('validation-b')
    const [first, second] = await Promise.allSettled([
      board.add(a, { kind: 'goal', label: 'reach target state' }),
      board.add(a, { kind: 'goal', label: 'another goal' }),
    ])
    expect([first.status, second.status].sort()).toEqual(['fulfilled', 'rejected'])
    const goal = (await board.nodes(a))[0]!
    expect(goal.kind).toBe('goal')
    await expect(board.add(b, { kind: 'fact', label: 'foreign link', parentId: goal.id }))
      .rejects.toThrow('does not belong')
    await expect(board.add(a, { kind: 'fact', label: 'missing link', parentId: 'missing' }))
      .rejects.toThrow('does not belong')
    await expect(board.add(a, { kind: 'fact', label: 'wrong status', status: 'open' }))
      .rejects.toThrow('cannot have an intent status')

    const intent = await board.add(a, { kind: 'intent', label: 'verify path', parentId: goal.id })
    const fact = await board.add(a, { kind: 'fact', label: 'evidence', parentId: intent.id })
    await expect(board.setStatus(b, intent.id, 'claimed')).rejects.toThrow('does not belong')
    await expect(board.setStatus(a, fact.id, 'claimed')).rejects.toThrow('is not an intent')
    await expect(board.setStatus(a, intent.id, 'done')).rejects.toThrow('open -> done')
    await board.setStatus(a, intent.id, 'claimed')
    await expect(board.setStatus(a, intent.id, 'claimed')).rejects.toThrow('claimed -> claimed')
    await board.setStatus(a, intent.id, 'done')
    await expect(board.setStatus(a, intent.id, 'abandoned')).rejects.toThrow('done -> abandoned')
    expect((await board.snapshot(a)).nodes.find(node => node.id === intent.id)?.status).toBe('done')
  })

  it('reopens durable run state and explicitly recovers claimed Intents', async () => {
    const backend = new MemoryStorageBackend()
    const first = await harness(backend)
    const events: SessionEvent[] = []
    const session = fakeSession('persisted', events)
    const goal = await first.board.add(session, { kind: 'goal', label: 'reach target state' })
    const intent = await first.board.add(session, { kind: 'intent', label: 'investigate', parentId: goal.id })
    await first.board.setStatus(session, intent.id, 'claimed')
    expect(await first.board.startRun(session, 1_234)).toBe(1_234)
    expect(await first.board.startRun(session, 9_999)).toBe(1_234)
    expect(await first.board.nextCycle(session)).toBe(1)
    expect(await first.board.advanceToCycle(session, 3)).toBe(3)
    expect(await first.board.advanceToCycle(session, 2)).toBe(3)
    await first.board.setPaused(session, true)
    await first.board.markComplete(session)
    const startedAt = (await first.board.runState(session)).startedAt
    expect(startedAt).toBe(1_234)
    await first.facility.closeAll()

    const reopened = await harness(backend)
    const resumedSession = fakeSession('persisted', events)
    expect(await reopened.board.runState(resumedSession)).toEqual({
      sessionId: 'persisted', generation: 0, cycle: 3, paused: true, complete: true, startedAt,
    })
    expect(await reopened.board.snapshot(resumedSession)).toMatchObject({
      cycle: 3, paused: true, complete: true,
    })
    expect(await reopened.board.recoverClaimed(resumedSession)).toBe(1)
    expect(await reopened.board.recoverClaimed(resumedSession)).toBe(0)
    const eventCount = events.length
    await reopened.board.setPaused(resumedSession, true)
    await reopened.board.markComplete(resumedSession)
    expect(events).toHaveLength(eventCount)
    expect((await reopened.board.snapshot(resumedSession)).nodes.find(node => node.id === intent.id)?.status).toBe('open')

    let projection: BoardSnapshot | null = null
    for (const event of events) projection = applyBoardProjection(projection, event)
    expect(projection).toEqual(await reopened.board.snapshot(resumedSession))
  })

  it('opens a v1 node-only medium with a new run-state table', async () => {
    const backend = new MemoryStorageBackend()
    const unit = await backend.kv.open({
      name: 'ant_sword_blackboard', version: 1, tables: ['nodes'], hasGlobal: false,
    })
    const oldNode: BoardNode = {
      id: 'legacy-node', sessionId: 'legacy', kind: 'fact', label: 'existing finding', time: 1, cycle: 0,
    }
    const oldClaim: BoardNode = {
      id: 'legacy-claim', sessionId: 'legacy', kind: 'intent', label: 'interrupted route',
      status: 'claimed', time: 2, cycle: 0,
    }
    await unit.putRecord('nodes', oldNode.id, oldNode)
    await unit.putRecord('nodes', oldClaim.id, oldClaim)
    await unit.close()

    const { board } = await harness(backend)
    const session = fakeSession('legacy')
    expect(await board.snapshot(session)).toEqual({
      nodes: [oldNode, oldClaim], cycle: 0, paused: false, complete: false,
    })
    await board.setPaused(session, true)
    expect(await board.recoverExpiredClaims(session, 0)).toBe(1)
    expect((await board.snapshot(session)).nodes).toEqual([oldNode, { ...oldClaim, status: 'open' }])
  })

  it('keeps live claims until their lease expires, then reopens them once', async () => {
    const { board } = await harness()
    const events: SessionEvent[] = []
    const session = fakeSession('leased', events)
    const intent = await board.add(session, { kind: 'intent', label: 'check another route' })
    await board.setStatus(session, intent.id, 'claimed', {
      owner: 'agent-a', now: 1_000, leaseMs: 600_000,
    })
    expect((await board.nodes(session))[0]?.claim).toEqual({ owner: 'agent-a', leaseUntil: 601_000 })
    expect(await board.recoverExpiredClaims(session, 600_999)).toBe(0)
    expect((await board.nodes(session))[0]?.status).toBe('claimed')
    expect(await board.recoverExpiredClaims(session, 601_000)).toBe(1)
    expect(await board.recoverExpiredClaims(session, 601_000)).toBe(0)
    expect((await board.nodes(session))[0]).toMatchObject({ status: 'open' })
    expect((await board.nodes(session))[0]?.claim).toBeUndefined()

    const before = Date.now()
    await board.setStatus(session, intent.id, 'claimed')
    const after = Date.now()
    const defaultLeaseUntil = (await board.nodes(session))[0]?.claim?.leaseUntil
    expect(defaultLeaseUntil).toBeGreaterThanOrEqual(before + 600_000)
    expect(defaultLeaseUntil).toBeLessThanOrEqual(after + 600_000)

    let projection: BoardSnapshot | null = null
    for (const event of events) projection = applyBoardProjection(projection, event)
    expect(projection).toEqual(await board.snapshot(session))
  })

  it('archives one completed run and accepts a new Goal in the same session', async () => {
    const backend = new MemoryStorageBackend()
    const first = await harness(backend)
    const events: SessionEvent[] = []
    const session = fakeSession('reused-session', events)
    const oldGoal = await first.board.add(session, { kind: 'goal', label: 'first objective' })
    const oldIntent = await first.board.add(session, { kind: 'intent', label: 'first probe', parentId: oldGoal.id })
    await first.board.setStatus(session, oldIntent.id, 'claimed')
    await first.board.setStatus(session, oldIntent.id, 'done')
    await first.board.markComplete(session)

    expect(await first.board.resetRun(session)).toBe(1)
    expect(await first.board.snapshot(session)).toEqual({ nodes: [], cycle: 0, paused: false, complete: false })
    const nextGoal = await first.board.add(session, { kind: 'goal', label: 'second objective' })
    expect(nextGoal.generation).toBe(1)
    await expect(first.board.add(session, { kind: 'fact', label: 'stale link', parentId: oldIntent.id }))
      .rejects.toThrow('does not belong')
    const nextIntent = await first.board.add(session, { kind: 'intent', label: 'second probe', parentId: nextGoal.id })
    await first.board.nextCycle(session)
    expect((await first.board.snapshot(session)).nodes.map(node => node.id)).toEqual([nextGoal.id, nextIntent.id])
    await first.facility.closeAll()

    const reopened = await harness(backend)
    expect((await reopened.board.runState(session)).generation).toBe(1)
    const current = await reopened.board.snapshot(session)
    expect(current.nodes.map(node => node.id)).toEqual([nextGoal.id, nextIntent.id])
    let replayed: BoardSnapshot | null = null
    for (const event of events) replayed = applyBoardProjection(replayed, event)
    expect(replayed).toEqual(current)
  })
})

describe('board projection fold', () => {
  it('rebuilds the graph from board/change events for the Web view', () => {
    const events: SessionEvent[] = []
    const session = fakeSession('s-fold', events)
    const node: BoardNode = {
      id: 'n1', sessionId: 's-fold', kind: 'fact', label: 'port 80 open', time: 1, cycle: 0,
    }
    session.append('board/change', { op: 'add', node })
    session.append('board/change', { op: 'cycle', cycle: 3 })
    session.append('board/change', { op: 'paused', paused: true })

    let state: BoardSnapshot | null = null
    for (const ev of events) state = applyBoardProjection(state, ev)
    expect(state).not.toBeNull()
    expect(state?.nodes).toHaveLength(1)
    expect(state?.cycle).toBe(3)
    expect(state?.paused).toBe(true)
  })

  it('returns the same reference for non-board events (Object.is gate)', () => {
    const state: BoardSnapshot = { nodes: [], cycle: 1, paused: false, complete: false }
    const other = { type: 'turn/start', data: { turn: 1 }, seq: 0, time: 0 } as unknown as SessionEvent
    expect(applyBoardProjection(state, other)).toBe(state)
  })
})

describe('stall detector', () => {
  it('flags a direction change after N identical consecutive tool calls', () => {
    const stallThreshold = 3
    const recent: string[] = []
    const detect = (name: string): boolean => {
      recent.push(name)
      if (recent.length > stallThreshold) recent.shift()
      return recent.length === stallThreshold && recent.every(s => s === recent[0])
    }
    expect(detect('bash')).toBe(false)
    expect(detect('bash')).toBe(false)
    expect(detect('bash')).toBe(true)
    // A different tool resets the window.
    recent.length = 0
    expect(detect('bash')).toBe(false)
    expect(detect('curl')).toBe(false)
    expect(detect('bash')).toBe(false)
  })
})
