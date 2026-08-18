import type { Node, NodeProps } from '@xyflow/react';
import type { BoardNodeKind } from './board.ts';
interface BoardFlowNodeData extends Record<string, unknown> {
    readonly kind: BoardNodeKind;
    readonly label: string;
    readonly status: string;
}
export type BoardFlowNode = Node<BoardFlowNodeData, 'board'>;
/** A measured graph block with explicit left/right connection anchors. */
export declare function BoardGraphNode({ data }: NodeProps<BoardFlowNode>): any;
export {};
//# sourceMappingURL=BoardGraphNode.d.ts.map