/**
 * Blackboard domain: durable Fact/Intent/Hint nodes on the `ctx.storageDomain`
 * facility. Zod schema per the storage-domain convention, mirroring
 * `rewind/domain.ts`.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/auto/domain
 */
import z from 'zod';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
const nodeSchema = z.object({
    id: z.string(),
    sessionId: z.string(),
    kind: z.enum(['fact', 'intent', 'hint', 'goal']),
    label: z.string(),
    detail: z.string().optional(),
    parentId: z.string().optional(),
    status: z.enum(['open', 'claimed', 'done', 'abandoned']).optional(),
    time: z.number(),
    cycle: z.number(),
});
/** The blackboard node registry domain. */
export const blackboardDomain = defineDomain({
    name: 'ant_sword_blackboard',
    version: 1,
    tables: {
        nodes: domainTable(nodeSchema),
    },
});
//# sourceMappingURL=domain.js.map