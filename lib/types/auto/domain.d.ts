/**
 * Blackboard domain: durable Fact/Intent/Hint nodes on the `ctx.storageDomain`
 * facility. Zod schema per the storage-domain convention, mirroring
 * `rewind/domain.ts`.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/auto/domain
 */
import type { BoardNode } from './types.ts';
/** Wire payload of one `board/change` session event. */
export type BoardChangeMeta = {
    readonly op: 'add';
    readonly node: BoardNode;
} | {
    readonly op: 'status';
    readonly nodeId: string;
    readonly status: string;
} | {
    readonly op: 'cycle';
    readonly cycle: number;
} | {
    readonly op: 'paused';
    readonly paused: boolean;
} | {
    readonly op: 'complete';
    readonly complete: boolean;
};
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        /** A blackboard mutation: a node added, or an Intent's lifecycle transition. */
        'board/change': BoardChangeMeta;
    }
}
/** The blackboard node registry domain. */
export declare const blackboardDomain: {
    name: string;
    version: number;
    tables: {
        nodes: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, BoardNode>;
    };
};
//# sourceMappingURL=domain.d.ts.map