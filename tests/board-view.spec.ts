import { describe, expect, it } from 'vitest'
import { readBoard } from '../src/auto/board-view.ts'
import type { BoardNode, BoardSnapshot } from '../src/auto/types.ts'

const budget = { boardChars: 1200, evidenceChars: 200, contextTier: 'compact' as const }

function node(id: string, kind: BoardNode['kind'], extra: Partial<BoardNode> = {}): BoardNode {
  return { id, sessionId: 's', kind, label: `${kind} ${id}`, time: Number(id.replace(/\D/g, '')) || 0, cycle: 1, ...extra }
}

describe('bounded blackboard views', () => {
  it('keeps live work visible and pages older evidence without losing detail', () => {
    const nodes: BoardNode[] = [node('goal-1', 'goal')]
    for (let index = 0; index < 40; index++) nodes.push(node(`fact-${index}`, 'fact', { detail: `evidence-${index} ` + 'x'.repeat(500) }))
    nodes.push(node('intent-2', 'intent', { status: 'claimed', parentId: 'goal-1' }))
    const snapshot: BoardSnapshot = { nodes, cycle: 3, paused: false, complete: false }
    const overview = readBoard(snapshot, {}, budget)
    expect(overview.summary.length).toBeLessThanOrEqual(budget.boardChars)
    expect(overview.summary).toContain('#goal-1')
    expect(overview.summary).toContain('#intent-2')
    expect(overview.summary).toContain('omitted')
    expect(overview.summary).toContain('board_read(cursor="0")')

    const page = readBoard(snapshot, { cursor: '0' }, budget)
    expect(page.summary.length).toBeLessThanOrEqual(budget.boardChars)
    expect(page.nextCursor).toBeDefined()
    expect(page.summary).toContain(`board_read(cursor="${page.nextCursor}")`)
    const nextPage = readBoard(snapshot, { cursor: page.nextCursor! }, budget)
    expect(nextPage.summary).toContain(`node ${page.nextCursor}`)

    const detail = readBoard(snapshot, { nodeId: 'fact-0' }, budget)
    expect(detail.summary).toContain('evidence-0')
    expect(detail.nextDetailOffset).toBeDefined()
    expect(readBoard(snapshot, { nodeId: 'fact-0', detailOffset: detail.nextDetailOffset! }, budget).summary).toContain('Detail')
  })

  it('rejects invalid cursors and offsets', () => {
    const snapshot: BoardSnapshot = { nodes: [node('fact-1', 'fact', { detail: 'proof' })], cycle: 0, paused: false, complete: false }
    expect(() => readBoard(snapshot, { cursor: '-1' }, budget)).toThrow('cursor')
    expect(() => readBoard(snapshot, { cursor: '2' }, budget)).toThrow('cursor')
    expect(() => readBoard(snapshot, { nodeId: 'fact-1', detailOffset: 100 }, budget)).toThrow('detailOffset')
  })
})
