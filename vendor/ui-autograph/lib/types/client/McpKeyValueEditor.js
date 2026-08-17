import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import css from './RuntimeStatus.module.css';
/** Edit string key/value maps used by MCP environment variables and headers. */
export function McpKeyValueEditor({ label, value, onChange }) {
    const entries = Object.entries(value);
    const update = (index, key, itemValue) => {
        onChange(Object.fromEntries(entries.map((entry, at) => at === index ? [key, itemValue] : entry)));
    };
    return _jsxs("fieldset", { className: css.keyValues, children: [_jsx("legend", { children: label }), entries.map(([key, itemValue], index) => _jsxs("div", { children: [_jsx("input", { "aria-label": `${label}名称 ${index + 1}`, placeholder: "\u540D\u79F0", value: key, onChange: (event) => { update(index, event.target.value, itemValue); } }), _jsx("input", { "aria-label": `${label}值 ${index + 1}`, placeholder: "\u503C", value: itemValue, onChange: (event) => { update(index, key, event.target.value); } }), _jsx("button", { type: "button", "aria-label": `删除${label} ${key || index + 1}`, onClick: () => { onChange(Object.fromEntries(entries.filter((_, at) => at !== index))); }, children: "\u5220\u9664" })] }, `${index}-${key}`)), _jsxs("button", { type: "button", onClick: () => { onChange({ ...value, [`KEY_${entries.length + 1}`]: '' }); }, children: ["\u6DFB\u52A0", label] })] });
}
/** Update one optional map field without widening MCP configuration types. */
export function withMcpMap(server, field, value) {
    return { ...server, [field]: value };
}
//# sourceMappingURL=McpKeyValueEditor.js.map