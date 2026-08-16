/**
 * Durable checkpoint registry domain: schema-validated checkpoint records on
 * the `ctx.storageDomain` facility. Record schema is zod per the storage-domain
 * convention; the rewind plugin Config stays schemastery.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/rewind/domain
 */
import z from 'zod';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
const checkpointSchema = z.object({
    id: z.string(),
    sessionId: z.string(),
    provider: z.enum(['git', 'copy']),
    ref: z.string(),
    cwd: z.string(),
    trigger: z.string(),
    fileCount: z.number().optional(),
    byteSize: z.number(),
    time: z.number(),
    turn: z.number().optional(),
    step: z.number().optional(),
    stepEndSeq: z.number().optional(),
    forkSeq: z.number().optional(),
    guard: z.boolean().optional(),
});
/** The rewind checkpoint registry domain. */
export const rewindDomain = defineDomain({
    name: 'ant_sword_rewind',
    version: 1,
    tables: {
        checkpoints: domainTable(checkpointSchema),
    },
});
//# sourceMappingURL=domain.js.map