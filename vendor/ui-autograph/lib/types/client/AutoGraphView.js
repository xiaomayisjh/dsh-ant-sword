import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * AutoGraphView: the live decision-graph panel for an autonomous (red-team-auto)
 * run. It folds the `board` session projection into React Flow nodes/edges —
 * a node per Fact/Intent/Hint/Goal, an edge from each node to the node it
 * derives from — and renders the operator's control bar (Pause / Resume /
 * Inject-hint) wired to the injected verbs. Live state arrives as the
 * projected whole snapshot; the panel renders nothing when the session has no
 * blackboard (capability absent / not an autonomous run).
 */
import { useMemo, useState } from 'react';
import { Background, Controls, MarkerType, ReactFlow } from '@xyflow/react';
import { RuntimeStatus } from "./RuntimeStatus.js";
import { GraphOverview } from "./GraphOverview.js";
import { BoardGraphNode } from "./BoardGraphNode.js";
import css from './AutoGraphView.module.css';
const NODE_TYPES = { board: BoardGraphNode };
const BOARD_KINDS = ['goal', 'intent', 'fact', 'hint'];
const KIND_COLUMN = new Map(BOARD_KINDS.map((kind, index) => [kind, index]));
const KIND_LABEL = {
    fact: '事实',
    intent: '意图',
    hint: '提示',
    goal: '目标',
};
const KIND_EDGE_COLOR = {
    fact: 'var(--dsw-alias-state-success-primary)',
    intent: 'var(--dsw-alias-state-business-primary)',
    hint: 'var(--dsw-alias-brand-primary-new-colorprimary-new-color)',
    goal: 'var(--dsw-alias-state-warn-primary)',
};
function edgeOpacity(node) {
    if (node.status === 'open' || node.status === 'claimed')
        return 1;
    if (node.status === 'done')
        return 0.78;
    return 0.52;
}
/** Lay out each block kind in a fixed column and give sibling edges separate lanes. */
export function toFlow(board) {
    const byKind = new Map();
    const sorted = [...board.nodes].sort((left, right) => left.cycle - right.cycle || left.time - right.time);
    const nodes = sorted.map((node) => {
        const row = byKind.get(node.kind) ?? 0;
        byKind.set(node.kind, row + 1);
        return {
            id: node.id,
            type: 'board',
            position: { x: (KIND_COLUMN.get(node.kind) ?? 0) * 360, y: row * 156 },
            zIndex: 2,
            data: { label: node.label, kind: node.kind, status: node.status ?? 'recorded' },
        };
    });
    const siblingLane = new Map();
    const edges = board.nodes
        .filter((node) => node.parentId !== undefined)
        .map((node) => {
        const parentId = node.parentId;
        const lane = siblingLane.get(parentId) ?? 0;
        siblingLane.set(parentId, lane + 1);
        return {
            id: `${parentId}->${node.id}`,
            source: parentId,
            target: node.id,
            type: 'smoothstep',
            zIndex: 1,
            pathOptions: { borderRadius: 10, offset: 28 + lane * 14 },
            animated: node.kind === 'intent' && (node.status === 'open' || node.status === 'claimed'),
            style: {
                stroke: KIND_EDGE_COLOR[node.kind],
                strokeOpacity: edgeOpacity(node),
                strokeWidth: node.status === 'open' || node.status === 'claimed' ? 2.5 : 1.75,
            },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: KIND_EDGE_COLOR[node.kind],
            },
        };
    });
    return { nodes, edges };
}
const EMPTY_BOARD = {
    nodes: [],
    cycle: 0,
    paused: false,
    complete: false,
};
export function AutoGraphView({ isAutoMode, runtimeStatus, onPause, onResume, onHint, useProjection, t }) {
    const [hint, setHint] = useState('');
    const [pending, setPending] = useState(false);
    const [enabledKinds, setEnabledKinds] = useState(() => new Set(BOARD_KINDS));
    const projectedBoard = useProjection('board');
    const board = projectedBoard ?? EMPTY_BOARD;
    const flow = useMemo(() => toFlow(board), [board]);
    const { nodes, edges } = useMemo(() => {
        const visibleNodes = flow.nodes.filter(node => enabledKinds.has(node.data.kind));
        const visibleIds = new Set(visibleNodes.map(node => node.id));
        return {
            nodes: visibleNodes,
            edges: flow.edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
        };
    }, [enabledKinds, flow]);
    if (!isAutoMode)
        return null;
    const status = board.complete ? t('panel.complete') : board.paused ? t('panel.paused') : t('panel.running');
    const run = async (action) => {
        if (pending)
            return;
        setPending(true);
        try {
            await action();
        }
        finally {
            setPending(false);
        }
    };
    return (_jsxs("div", { className: css.panel, "data-autograph": true, children: [_jsxs("div", { className: css.header, children: [_jsx("span", { className: css.title, children: t('panel.title') }), _jsx("span", { className: css.meta, children: t('panel.cycle', { cycle: board.cycle }) }), _jsx("span", { className: css.status, "data-paused": board.paused, "data-complete": board.complete, children: status })] }), _jsx(RuntimeStatus, { runtimeStatus: runtimeStatus, compact: true }), _jsxs("fieldset", { className: css.filters, children: [_jsx("legend", { children: "\u7B5B\u9009\u56FE\u5757" }), BOARD_KINDS.map(kind => (_jsxs("label", { "data-kind": kind, children: [_jsx("input", { type: "checkbox", checked: enabledKinds.has(kind), onChange: (event) => {
                                    setEnabledKinds((current) => {
                                        const next = new Set(current);
                                        if (event.target.checked)
                                            next.add(kind);
                                        else
                                            next.delete(kind);
                                        return next;
                                    });
                                } }), _jsx("span", { children: KIND_LABEL[kind] })] }, kind))), _jsxs("span", { className: css.filterCount, children: [nodes.length, "/", flow.nodes.length, " \u4E2A\u56FE\u5757"] })] }), _jsx("div", { className: css.columnLegend, "aria-hidden": "true", children: BOARD_KINDS.map(kind => _jsx("span", { "data-kind": kind, children: KIND_LABEL[kind] }, kind)) }), _jsx("div", { className: css.canvas, children: nodes.length === 0
                    ? _jsx("div", { className: css.empty, children: t('panel.empty') })
                    : (_jsxs(ReactFlow, { nodes: nodes, edges: edges, nodeTypes: NODE_TYPES, fitView: true, fitViewOptions: { padding: 0.2, maxZoom: 1.25 }, minZoom: 0.15, maxZoom: 2.5, nodesDraggable: false, nodesConnectable: false, elementsSelectable: true, panOnDrag: true, panOnScroll: true, zoomOnPinch: true, zoomOnScroll: true, zoomOnDoubleClick: true, preventScrolling: true, proOptions: { hideAttribution: true }, children: [_jsx(Background, { gap: 20, size: 1 }), _jsx(GraphOverview, { nodes: nodes, edges: edges }), _jsx(Controls, { showInteractive: false })] })) }), _jsxs("div", { className: css.controls, children: [board.paused
                        ? _jsx("button", { type: "button", disabled: pending, onClick: () => void run(onResume), children: t('control.resume') })
                        : _jsx("button", { type: "button", disabled: pending, onClick: () => void run(onPause), children: t('control.pause') }), _jsx("input", { type: "text", value: hint, placeholder: t('control.hintPlaceholder'), onChange: (e) => { setHint(e.target.value); }, onKeyDown: (e) => {
                            if (e.key === 'Enter' && hint.trim().length > 0) {
                                void run(() => onHint(hint.trim()));
                                setHint('');
                            }
                        } }), _jsx("button", { type: "button", disabled: pending || hint.trim().length === 0, onClick: () => {
                            void run(() => onHint(hint.trim()));
                            setHint('');
                        }, children: t('control.hint') })] })] }));
}
//# sourceMappingURL=AutoGraphView.js.map