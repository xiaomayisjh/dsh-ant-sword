/**
 * Client-namespace view of the autonomous-loop blackboard: the pure types the
 * graph surface folds into React Flow nodes/edges. This mirrors the owning
 * `board` projection payload shape (`packages/bundle/ant-sword-harness/src/auto`).
 * A type-only local copy keeps the client bundle free of a cross-plugin value
 * import (bundle purity); the wire is the `board` session projection.
 *
 * @module @deepseek-ai/dsh-client-ui-autograph/board
 */

/** One blackboard node kind. */
export type BoardNodeKind = 'fact' | 'intent' | 'hint' | 'goal'

/** Intent lifecycle; facts and hints are terminal once written. */
export type IntentStatus = 'open' | 'claimed' | 'done' | 'abandoned'

/** One blackboard node as it arrives on the wire. */
export interface BoardNode {
  readonly id: string
  readonly sessionId: string
  readonly kind: BoardNodeKind
  readonly label: string
  readonly detail?: string
  readonly parentId?: string
  readonly status?: IntentStatus
  readonly time: number
  readonly cycle: number
}

/** The whole `board` projection value the UI folds into the graph. */
export interface BoardSnapshot {
  readonly nodes: readonly BoardNode[]
  readonly cycle: number
  readonly paused: boolean
  readonly complete: boolean
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** The autonomous-loop blackboard graph, folded live from board/change. */
    board: BoardSnapshot | null
  }
}
