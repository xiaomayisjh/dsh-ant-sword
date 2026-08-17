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
import { Background, Controls, MarkerType, MiniMap, ReactFlow } from '@xyflow/react'
import type { Edge } from '@xyflow/react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { RedTeamRuntimeStatus } from './RuntimeStatus.tsx'
import { RuntimeStatus } from './RuntimeStatus.tsx'
import { BoardGraphNode, type BoardFlowNode } from './BoardGraphNode.tsx'
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

const NODE_TYPES = { board: BoardGraphNode }
const BOARD_KINDS: readonly BoardNodeKind[] = ['fact', 'intent', 'hint', 'goal']
const KIND_LABEL: Record<BoardNodeKind, string> = {
  fact: '事实',
  intent: '意图',
  hint: '提示',
  goal: '目标',
}
const KIND_EDGE_COLOR: Record<BoardNodeKind, string> = {
  fact: 'var(--dsw-alias-state-success-primary)',
  intent: 'var(--dsw-alias-state-business-primary)',
  hint: 'var(--dsw-alias-brand-primary-new-colorprimary-new-color)',
  goal: 'var(--dsw-alias-state-warn-primary)',
}

function edgeOpacity(node: BoardNode): number {
  if (node.status === 'open' || node.status === 'claimed') return 1
  if (node.status === 'done') return 0.78
  return 0.52
}

/** Lay out measured blocks in cycle columns with enough room for wrapped labels. */
export function toFlow(board: BoardSnapshot): { nodes: BoardFlowNode[]; edges: Edge[] } {
  const byCycle = new Map<number, number>()
  const nodes: BoardFlowNode[] = board.nodes.map((node: BoardNode) => {
    const row = byCycle.get(node.cycle) ?? 0
    byCycle.set(node.cycle, row + 1)
    return {
      id: node.id,
      type: 'board',
      position: { x: node.cycle * 320, y: row * 156 },
      data: { label: node.label, kind: node.kind, status: node.status ?? 'recorded' },
    }
  })
  const edges: Edge[] = board.nodes
    .filter((node: BoardNode) => node.parentId !== undefined)
    .map((node: BoardNode) => ({
      id: `${node.parentId}->${node.id}`,
      source: node.parentId as string,
      target: node.id,
      type: 'smoothstep',
      animated: node.kind === 'intent' && (node.status === 'open' || node.status === 'claimed'),
      style: {
        stroke: KIND_EDGE_COLOR[node.kind],
        strokeOpacity: edgeOpacity(node),
        strokeWidth: node.status === 'open' || node.status === 'claimed' ? 2.5 : 1.75,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: KIND_EDGE_COLOR[node.kind],
      },
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
  const [enabledKinds, setEnabledKinds] = useState<ReadonlySet<BoardNodeKind>>(
    () => new Set(BOARD_KINDS),
  )
  const projectedBoard = useProjection('board')
  const board = projectedBoard ?? EMPTY_BOARD

  const flow = useMemo(() => toFlow(board), [board])
  const { nodes, edges } = useMemo(() => {
    const visibleNodes = flow.nodes.filter(node => enabledKinds.has(node.data.kind))
    const visibleIds = new Set(visibleNodes.map(node => node.id))
    return {
      nodes: visibleNodes,
      edges: flow.edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
    }
  }, [enabledKinds, flow])

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
      <fieldset className={css.filters}>
        <legend>筛选图块</legend>
        {BOARD_KINDS.map(kind => (
          <label key={kind} data-kind={kind}>
            <input
              type="checkbox"
              checked={enabledKinds.has(kind)}
              onChange={(event) => {
                setEnabledKinds((current) => {
                  const next = new Set(current)
                  if (event.target.checked) next.add(kind)
                  else next.delete(kind)
                  return next
                })
              }}
            />
            <span>{KIND_LABEL[kind]}</span>
          </label>
        ))}
        <span className={css.filterCount}>{nodes.length}/{flow.nodes.length} 个图块</span>
      </fieldset>
      <div className={css.canvas}>
        {nodes.length === 0
          ? <div className={css.empty}>{t('panel.empty')}</div>
          : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1.25 }}
              minZoom={0.15}
              maxZoom={2.5}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              panOnDrag
              panOnScroll
              zoomOnPinch
              zoomOnScroll
              zoomOnDoubleClick
              preventScrolling
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} size={1} />
              <MiniMap pannable zoomable ariaLabel="黑板缩略图" />
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
