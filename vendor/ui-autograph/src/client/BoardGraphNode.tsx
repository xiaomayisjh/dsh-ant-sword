import { Handle, Position } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import type { BoardNodeKind } from './board.ts'
import css from './AutoGraphView.module.css'

interface BoardFlowNodeData extends Record<string, unknown> {
  readonly kind: BoardNodeKind
  readonly label: string
  readonly status: string
}

export type BoardFlowNode = Node<BoardFlowNodeData, 'board'>

const KIND_LABEL: Record<BoardNodeKind, string> = {
  fact: '事实',
  goal: '目标',
  hint: '提示',
  intent: '意图',
}

function KindIcon({ kind }: { readonly kind: BoardNodeKind }) {
  if (kind === 'goal') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>
  }
  if (kind === 'fact') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z" /><path d="m8 12 2.5 2.5L16 9" /></svg>
  }
  if (kind === 'intent') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5" /><path d="M10 5h9v9" /></svg>
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a7 7 0 0 0-4 12.7V19h8v-3.3A7 7 0 0 0 12 3Z" /><path d="M9 22h6M9 16h6" /></svg>
}

/** A measured graph block with explicit left/right connection anchors. */
export function BoardGraphNode({ data }: NodeProps<BoardFlowNode>) {
  return (
    <article className={css.nodeCard} data-kind={data.kind}>
      <Handle className={css.handle} type="target" position={Position.Left} />
      <header className={css.nodeHeader}>
        <span className={css.nodeIcon}><KindIcon kind={data.kind} /></span>
        <span>{KIND_LABEL[data.kind]}</span>
        <span className={css.nodeStatus}>{data.status}</span>
      </header>
      <div className={css.nodeLabel}>{data.label}</div>
      <Handle className={css.handle} type="source" position={Position.Right} />
    </article>
  )
}
