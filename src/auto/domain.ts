/**
 * Blackboard domain: durable Fact/Intent/Hint nodes on the `ctx.storageDomain`
 * facility. Zod schema per the storage-domain convention, mirroring
 * `rewind/domain.ts`.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/auto/domain
 */

import z from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { BoardNode } from './types.ts'

/** Wire payload of one `board/change` session event. */
export type BoardChangeMeta =
  | { readonly op: 'add'; readonly node: BoardNode }
  | { readonly op: 'status'; readonly nodeId: string; readonly status: string }
  | { readonly op: 'cycle'; readonly cycle: number }
  | { readonly op: 'paused'; readonly paused: boolean }
  | { readonly op: 'complete'; readonly complete: boolean }

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** A blackboard mutation: a node added, or an Intent's lifecycle transition. */
    'board/change': BoardChangeMeta
  }
}

const nodeSchema: z.ZodType<BoardNode> = z.object({
  id: z.string(),
  sessionId: z.string(),
  kind: z.enum(['fact', 'intent', 'hint', 'goal']),
  label: z.string(),
  detail: z.string().optional(),
  parentId: z.string().optional(),
  status: z.enum(['open', 'claimed', 'done', 'abandoned']).optional(),
  time: z.number(),
  cycle: z.number(),
}) as z.ZodType<BoardNode>

/** The blackboard node registry domain. */
export const blackboardDomain = defineDomain({
  name: 'ant_sword_blackboard',
  version: 1,
  tables: {
    nodes: domainTable<string, BoardNode>(nodeSchema),
  },
})
