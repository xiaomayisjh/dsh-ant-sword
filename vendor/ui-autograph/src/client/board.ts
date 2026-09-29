/** Browser type mirror of the autonomous loop board projection. */
import type {} from '@deepseek-ai/dsh-session-projection/types'

export type BoardNodeKind = 'fact' | 'intent' | 'hint' | 'goal'
export type IntentStatus = 'open' | 'claimed' | 'done' | 'abandoned'

export interface IntentClaim {
  readonly owner: string
  readonly leaseUntil: number
}

export interface BoardNode {
  readonly id: string
  readonly sessionId: string
  readonly generation?: number
  readonly kind: BoardNodeKind
  readonly label: string
  readonly detail?: string
  readonly parentId?: string
  readonly status?: IntentStatus
  readonly claim?: IntentClaim
  readonly time: number
  readonly cycle: number
}

export interface BoardSnapshot {
  readonly nodes: readonly BoardNode[]
  readonly cycle: number
  readonly paused: boolean
  readonly complete: boolean
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    board: BoardSnapshot | null
  }
}
