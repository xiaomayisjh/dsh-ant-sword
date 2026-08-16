/**
 * Durable checkpoint registry domain: schema-validated checkpoint records on
 * the `ctx.storageDomain` facility. Record schema is zod per the storage-domain
 * convention; the rewind plugin Config stays schemastery.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/rewind/domain
 */
import type { CheckpointRecord } from './types.ts';
/** The rewind checkpoint registry domain. */
export declare const rewindDomain: {
    name: string;
    version: number;
    tables: {
        checkpoints: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, CheckpointRecord>;
    };
};
//# sourceMappingURL=domain.d.ts.map