/**
 * Blackboard domain: durable Fact/Intent/Hint nodes on the `ctx.storageDomain`
 * facility. Zod schema per the storage-domain convention, mirroring
 * `rewind/domain.ts`.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/auto/domain
 */

import z from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { BoardNode, BoardRunState, IntentClaim, IntentStatus } from './types.ts'

/** Wire payload of one `board/change` session event. */
export type BoardChangeMeta =
  | { readonly op: 'add'; readonly node: BoardNode }
  | { readonly op: 'reset'; readonly generation: number }
  | { readonly op: 'status'; readonly nodeId: string; readonly status: IntentStatus; readonly claim?: IntentClaim }
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
  generation: z.number().int().nonnegative().optional(),
  kind: z.enum(['fact', 'intent', 'hint', 'goal']),
  label: z.string(),
  detail: z.string().optional(),
  parentId: z.string().optional(),
  status: z.enum(['open', 'claimed', 'done', 'abandoned']).optional(),
  claim: z.object({ owner: z.string(), leaseUntil: z.number().int().nonnegative() }).optional(),
  time: z.number(),
  cycle: z.number(),
}) as z.ZodType<BoardNode>

const runStateSchema: z.ZodType<BoardRunState> = z.object({
  sessionId: z.string(),
  generation: z.number().int().nonnegative().optional(),
  cycle: z.number().int().nonnegative(),
  paused: z.boolean(),
  complete: z.boolean(),
  startedAt: z.number().int().nonnegative(),
}) as z.ZodType<BoardRunState>

/** The blackboard node registry domain. */
export const blackboardDomain = defineDomain({
  name: 'ant_sword_blackboard',
  version: 1,
  tables: {
    nodes: domainTable<string, BoardNode>(nodeSchema),
    // Additive under v1: DSH 0.2 JSON storage reads a missing table as empty,
    // preserving existing node records.
    run_states: domainTable<string, BoardRunState>(runStateSchema),
  },
})
