import type { Edge } from '@xyflow/react';
import type { BoardFlowNode } from './BoardGraphNode.tsx';
interface OverviewProps {
    readonly nodes: readonly BoardFlowNode[];
    readonly edges: readonly Edge[];
}
/** Live SVG overview of both blocks and their logical connections. */
export declare function GraphOverview({ nodes, edges }: OverviewProps): any;
export {};
//# sourceMappingURL=GraphOverview.d.ts.map