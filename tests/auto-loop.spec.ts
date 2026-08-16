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
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
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

async function harness() {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend())
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  const board = new BlackboardService(ctx, facility)
  return { ctx, board }
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

    await board.setStatus(session, recon.id, 'done')
    snap = await board.snapshot(session)
    expect(snap.nodes.find(n => n.id === recon.id)?.status).toBe('done')
  })

  it('advances the OODA cycle and tracks pause/complete flags', async () => {
    const { board } = await harness()
    const session = fakeSession('s2')

    expect(board.isPaused(session)).toBe(false)
    expect(board.isComplete(session)).toBe(false)

    expect(board.nextCycle(session)).toBe(1)
    expect(board.nextCycle(session)).toBe(2)

    board.setPaused(session, true)
    expect(board.isPaused(session)).toBe(true)

    board.markComplete(session)
    expect(board.isComplete(session)).toBe(true)

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