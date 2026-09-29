/** Bounded model-facing views of the durable blackboard. */

import type { BoardNode, BoardSnapshot } from './types.ts'

export interface BoardViewBudget {
  readonly boardChars: number
  readonly evidenceChars: number
  readonly contextTier: 'compact' | 'standard' | 'wide'
}

export interface BoardReadRequest {
  /** Decimal offset for a chronological page. Omit for a priority overview. */
  readonly cursor?: string
  /** Retrieve one node, including a chunk of its full detail. */
  readonly nodeId?: string
  /** Character offset into one node's detail. */
  readonly detailOffset?: number
}

export interface BoardReadResult {
  readonly summary: string
  readonly nextCursor?: string
  readonly nextDetailOffset?: number
}

function clip(value: string, maximum: number): string {
  if (value.length <= maximum) return value
  return `${value.slice(0, Math.max(0, maximum - 1))}…`
}

function line(node: BoardNode, evidenceChars: number): string {
  const evidence = node.detail === undefined ? '' : ` | evidence=${clip(JSON.stringify(node.detail), evidenceChars)}`
  return `#${node.id} [${node.kind}${node.status === undefined ? '' : `/${node.status}`}] (cycle ${node.cycle}) `
    + `${clip(node.label, 160)}${node.parentId === undefined ? '' : ` <- ${node.parentId}`}${evidence}`
}

function header(snapshot: BoardSnapshot, budget: BoardViewBudget): string {
  const facts = snapshot.nodes.filter(node => node.kind === 'fact').length
  const intents = snapshot.nodes.filter(node => node.kind === 'intent')
  const active = intents.filter(node => node.status === 'open' || node.status === 'claimed').length
  return `blackboard: ${snapshot.nodes.length} nodes, ${facts} Facts, ${active} active Intents, `
    + `cycle ${snapshot.cycle}, paused=${snapshot.paused}, complete=${snapshot.complete}; context=${budget.contextTier}`
}

function boundedLines(prefix: string[], nodes: readonly BoardNode[], budget: BoardViewBudget, pageStart?: number): BoardReadResult {
  const cap = Math.max(512, budget.boardChars)
  const lines = [...prefix]
  let used = lines.join('\n').length
  let included = 0
  for (const node of nodes) {
    const rendered = line(node, budget.evidenceChars)
    // Reserve enough room for a navigation footer. A very long first line is
    // clipped so the reader always makes progress through a page.
    // The overview's navigation hint is longer than a page cursor. Keep it
    // visible so a clipped result always explains how to recover the rest.
    const remaining = cap - used - 220
    if (remaining < 80 && included > 0) break
    const next = clip(rendered, Math.max(80, remaining))
    lines.push(next)
    used += next.length + 1
    included++
  }
  const omitted = nodes.length - included
  if (pageStart === undefined) {
    if (omitted > 0) lines.push(`${omitted} lower-priority node(s) omitted. Use board_read(cursor="0") for chronological pages or board_read(nodeId="ID") for full evidence.`)
  } else if (omitted > 0) {
    lines.push(`Next page: board_read(cursor="${pageStart + included}").`)
  }
  return {
    summary: clip(lines.join('\n'), cap),
    ...(pageStart === undefined || omitted === 0 ? {} : { nextCursor: String(pageStart + included) }),
  }
}

/** Preserve important live decisions while bounding output for small windows. */
export function readBoard(snapshot: BoardSnapshot, request: BoardReadRequest, budget: BoardViewBudget): BoardReadResult {
  const cap = Math.max(512, budget.boardChars)
  const base = header(snapshot, budget)
  if (request.nodeId !== undefined) {
    const node = snapshot.nodes.find(item => item.id === request.nodeId)
    if (node === undefined) throw new TypeError(`board node '${request.nodeId}' does not exist in this run`)
    const offset = request.detailOffset ?? 0
    if (!Number.isSafeInteger(offset) || offset < 0) throw new TypeError('detailOffset must be a nonnegative integer')
    const detail = node.detail ?? ''
    if (offset > detail.length) throw new TypeError('detailOffset exceeds node detail length')
    const { detail: _detail, ...nodeWithoutDetail } = node
    const metadata = line(nodeWithoutDetail, 0)
    const room = Math.max(1, Math.min(budget.evidenceChars, cap - base.length - metadata.length - 150))
    const chunk = detail.slice(offset, offset + room)
    const next = offset + chunk.length
    const suffix = next < detail.length ? `\nNext detail chunk: board_read(nodeId="${node.id}", detailOffset=${next}).` : ''
    return {
      summary: clip(`${base}\n${metadata}\nDetail ${offset}-${next}/${detail.length}: ${chunk}${suffix}`, cap),
      ...(next < detail.length ? { nextDetailOffset: next } : {}),
    }
  }
  if (request.cursor !== undefined) {
    if (!/^(0|[1-9]\d*)$/.test(request.cursor)) throw new TypeError('cursor must be a decimal node offset')
    const offset = Number(request.cursor)
    if (!Number.isSafeInteger(offset) || offset > snapshot.nodes.length) throw new TypeError('cursor exceeds board length')
    return boundedLines([base, `Chronological page from node ${offset}/${snapshot.nodes.length}:`], snapshot.nodes.slice(offset), budget, offset)
  }
  const priority = (node: BoardNode): number => {
    if (node.kind === 'goal') return 0
    if (node.kind === 'intent' && node.status === 'claimed') return 1
    if (node.kind === 'hint') return 2
    if (node.kind === 'intent' && node.status === 'open') return 3
    if (node.kind === 'fact') return 4
    return 5
  }
  const sorted = snapshot.nodes.map((node, index) => ({ node, index }))
    .sort((a, b) => priority(a.node) - priority(b.node) || b.index - a.index)
    .map(item => item.node)
  return boundedLines([base, 'Priority view (goal, active work, hints, recent facts):'], sorted, budget)
}
