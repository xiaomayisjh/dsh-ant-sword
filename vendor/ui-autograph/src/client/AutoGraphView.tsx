/**
 * AutoGraphView: the live decision-graph panel for an autonomous (red-team-auto)
 * run. It folds the `board` session projection into React Flow nodes/edges —
 * a node per Fact/Intent/Hint/Goal, an edge from each node to the node it
 * derives from — and renders the operator's control bar (Pause / Resume /
 * Inject-hint) wired to the injected verbs. Live state arrives as the
 * projected whole snapshot; the panel renders nothing when the session has no
 * blackboard (capability absent / not an autonomous run).
 */

import { useMemo, useState } from 'react'
import { ReactFlow, Background, Controls } from '@xyflow/react'
import type { Edge, Node } from '@xyflow/react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { RedTeamRuntimeStatus } from './RuntimeStatus.tsx'
import { RuntimeStatus } from './RuntimeStatus.tsx'
import type { BoardNode, BoardNodeKind, BoardSnapshot } from './board.ts'
import css from './AutoGraphView.module.css'

/** Operator verbs the panel's control bar invokes (injected by the plugin). */
export interface AutoGraphActions {
  /** Shared deployment-level Skill/MCP status source. */
  runtimeStatus: SnapshotStore<RedTeamRuntimeStatus>
  /** Whether the session was composed from the autonomous red-team preset. */
  isAutoMode: boolean
  /** Pause the loop after the current step. */
  onPause: () => Promise<string | null>
  /** Resume a paused loop. */
  onResume: () => Promise<string | null>
  /** Inject an operator hint mid-run. */
  onHint: (text: string) => Promise<string | null>
}

export interface AutoGraphViewProps extends AutoGraphActions {
  /** Current board snapshot; undefined = loading, null = no board (renders nothing). */
  board: BoardSnapshot | null | undefined
}

const KIND_COLOR: Record<BoardNodeKind, string> = {
  goal: '#d97706',
  fact: '#059669',
  intent: '#2563eb',
  hint: '#7c3aed',
}

/** Lay out nodes in columns by OODA cycle (left → right as cycles advance). */
function toFlow(board: BoardSnapshot): { nodes: Node[]; edges: Edge[] } {
  const byCycle = new Map<number, number>()
  const nodes: Node[] = board.nodes.map((n: BoardNode) => {
    const row = byCycle.get(n.cycle) ?? 0
    byCycle.set(n.cycle, row + 1)
    const kindClass = `kind${n.kind[0]?.toUpperCase() ?? ''}${n.kind.slice(1)}`
    return {
      id: n.id,
      position: { x: n.cycle * 260, y: row * 110 },
      data: { label: n.label, kind: n.kind, status: n.status },
      className: `${css.node} ${css[kindClass] ?? ''}`,
      style: { borderColor: KIND_COLOR[n.kind] },
    }
  })
  const edges: Edge[] = board.nodes
    .filter((n: BoardNode) => n.parentId !== undefined)
    .map((n: BoardNode) => ({
      id: `${n.parentId}->${n.id}`,
      source: n.parentId as string,
      target: n.id,
      animated: n.kind === 'intent' && (n.status === 'open' || n.status === 'claimed'),
    }))
  return { nodes, edges }
}

const EMPTY_BOARD: BoardSnapshot = {
  nodes: [],
  cycle: 0,
  paused: false,
  complete: false,
}

export function AutoGraphView({ isAutoMode, runtimeStatus, onPause, onResume, onHint, useProjection, t }: ConvViewProps & AutoGraphActions & PropsLocale<'autograph'>) {
  const [hint, setHint] = useState('')
  const [pending, setPending] = useState(false)
  const projectedBoard = useProjection('board') as BoardSnapshot | null | undefined
  const board = projectedBoard ?? EMPTY_BOARD

  const { nodes, edges } = useMemo(() => toFlow(board), [board])

  if (!isAutoMode) return null

  const status = board.complete ? t('panel.complete') : board.paused ? t('panel.paused') : t('panel.running')

  const run = async (action: () => Promise<string | null>): Promise<void> => {
    if (pending) return
    setPending(true)
    try { await action() } finally { setPending(false) }
  }

  return (
    <div className={css.panel} data-autograph>
      <div className={css.header}>
        <span className={css.title}>{t('panel.title')}</span>
        <span className={css.meta}>{t('panel.cycle', { cycle: board.cycle })}</span>
        <span className={css.status} data-paused={board.paused} data-complete={board.complete}>{status}</span>
      </div>
      <RuntimeStatus runtimeStatus={runtimeStatus} compact />
      <div className={css.canvas}>
        {nodes.length === 0
          ? <div className={css.empty}>{t('panel.empty')}</div>
          : (
            <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }} nodesDraggable nodesConnectable={false}>
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
          )}
      </div>
      <div className={css.controls}>
        {board.paused
          ? <button type="button" disabled={pending} onClick={() => void run(onResume)}>{t('control.resume')}</button>
          : <button type="button" disabled={pending} onClick={() => void run(onPause)}>{t('control.pause')}</button>}
        <input
          type="text"
          value={hint}
          placeholder={t('control.hintPlaceholder')}
          onChange={(e) => { setHint(e.target.value) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hint.trim().length > 0) {
              void run(() => onHint(hint.trim()))
              setHint('')
            }
          }}
        />
        <button
          type="button"
          disabled={pending || hint.trim().length === 0}
          onClick={() => {
            void run(() => onHint(hint.trim()))
            setHint('')
          }}
        >
          {t('control.hint')}
        </button>
      </div>
    </div>
  )
}
