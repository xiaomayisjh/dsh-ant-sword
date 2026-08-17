import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Handle, Position } from '@xyflow/react';
import css from './AutoGraphView.module.css';
const KIND_LABEL = {
    fact: '事实',
    goal: '目标',
    hint: '提示',
    intent: '意图',
};
function KindIcon({ kind }) {
    if (kind === 'goal') {
        return _jsxs("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: [_jsx("circle", { cx: "12", cy: "12", r: "8" }), _jsx("circle", { cx: "12", cy: "12", r: "3" })] });
    }
    if (kind === 'fact') {
        return _jsxs("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: [_jsx("path", { d: "M5 5h14v14H5z" }), _jsx("path", { d: "m8 12 2.5 2.5L16 9" })] });
    }
    if (kind === 'intent') {
        return _jsxs("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: [_jsx("path", { d: "M5 19 19 5" }), _jsx("path", { d: "M10 5h9v9" })] });
    }
    return _jsxs("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: [_jsx("path", { d: "M12 3a7 7 0 0 0-4 12.7V19h8v-3.3A7 7 0 0 0 12 3Z" }), _jsx("path", { d: "M9 22h6M9 16h6" })] });
}
/** A measured graph block with explicit left/right connection anchors. */
export function BoardGraphNode({ data }) {
    return (_jsxs("article", { className: css.nodeCard, "data-kind": data.kind, children: [_jsx(Handle, { className: css.handle, type: "target", position: Position.Left }), _jsxs("header", { className: css.nodeHeader, children: [_jsx("span", { className: css.nodeIcon, children: _jsx(KindIcon, { kind: data.kind }) }), _jsx("span", { children: KIND_LABEL[data.kind] }), _jsx("span", { className: css.nodeStatus, children: data.status })] }), _jsx("div", { className: css.nodeLabel, children: data.label }), _jsx(Handle, { className: css.handle, type: "source", position: Position.Right })] }));
}
//# sourceMappingURL=BoardGraphNode.js.map