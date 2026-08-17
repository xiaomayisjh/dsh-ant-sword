import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import { useReactFlow, useViewport } from '@xyflow/react';
import css from './AutoGraphView.module.css';
const NODE_WIDTH = 252;
const NODE_HEIGHT = 92;
const PADDING = 40;
/** Live SVG overview of both blocks and their logical connections. */
export function GraphOverview({ nodes, edges }) {
    const viewport = useViewport();
    const { setCenter } = useReactFlow();
    const model = useMemo(() => {
        const byId = new Map(nodes.map(node => [node.id, node]));
        const maxX = Math.max(...nodes.map(node => node.position.x + NODE_WIDTH), NODE_WIDTH);
        const maxY = Math.max(...nodes.map(node => node.position.y + NODE_HEIGHT), NODE_HEIGHT);
        return {
            byId,
            width: maxX + PADDING * 2,
            height: maxY + PADDING * 2,
        };
    }, [nodes]);
    const locate = (clientX, clientY, svg) => {
        const rect = svg.getBoundingClientRect();
        const x = (clientX - rect.left) / rect.width * model.width - PADDING;
        const y = (clientY - rect.top) / rect.height * model.height - PADDING;
        void setCenter(x, y, { zoom: viewport.zoom, duration: 180 });
    };
    return (_jsx("aside", { className: css.overview, "aria-label": "\u903B\u8F91\u5173\u7CFB\u9E1F\u77B0\u56FE", children: _jsx("svg", { viewBox: `0 0 ${model.width} ${model.height}`, preserveAspectRatio: "xMidYMid meet", onPointerDown: (event) => { locate(event.clientX, event.clientY, event.currentTarget); }, children: _jsxs("g", { transform: `translate(${PADDING} ${PADDING})`, children: [edges.map((edge) => {
                        const source = model.byId.get(edge.source);
                        const target = model.byId.get(edge.target);
                        if (source === undefined || target === undefined)
                            return null;
                        const startX = source.position.x + NODE_WIDTH;
                        const startY = source.position.y + NODE_HEIGHT / 2;
                        const endX = target.position.x;
                        const endY = target.position.y + NODE_HEIGHT / 2;
                        const middleX = (startX + endX) / 2;
                        return (_jsx("polyline", { className: css.overviewEdge, points: `${startX},${startY} ${middleX},${startY} ${middleX},${endY} ${endX},${endY}` }, edge.id));
                    }), nodes.map(node => (_jsx("rect", { className: css.overviewNode, "data-kind": node.data.kind, x: node.position.x, y: node.position.y, width: NODE_WIDTH, height: NODE_HEIGHT, rx: 10 }, node.id))), _jsx("rect", { className: css.overviewViewport, x: Math.max(0, -viewport.x / viewport.zoom), y: Math.max(0, -viewport.y / viewport.zoom), width: Math.min(model.width, 960 / viewport.zoom), height: Math.min(model.height, 540 / viewport.zoom), rx: 8 })] }) }) }));
}
//# sourceMappingURL=GraphOverview.js.map