import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { formatMcpJson, parseMcpJson } from "./mcp-config-json.js";
import { copyMcpServer, createMcpServer, mcpServersEqual, switchMcpTransport, validateMcpServers, } from "./mcp-editor-state.js";
import { McpKeyValueEditor, withMcpMap } from "./McpKeyValueEditor.js";
import css from './RuntimeStatus.module.css';
function replaceServer(servers, index, value) {
    return servers.map((server, at) => at === index ? value : server);
}
/** Rich master-detail MCP editor with safe JSON import and runtime actions. */
export function McpConfigEditor({ servers, savedServers, saving, onChange, onSave }) {
    const [mode, setMode] = useState('visual');
    const [selectedIndex, setSelectedIndex] = useState(servers.length === 0 ? -1 : 0);
    const [jsonDraft, setJsonDraft] = useState(() => formatMcpJson(servers));
    const [message, setMessage] = useState();
    const [probes, setProbes] = useState({});
    const [operations, setOperations] = useState({});
    const dirty = !mcpServersEqual(servers, savedServers);
    const issues = useMemo(() => validateMcpServers(servers), [servers]);
    const selected = selectedIndex >= 0 ? servers[selectedIndex] : undefined;
    useEffect(() => {
        if (servers.length > 0 && selectedIndex < 0)
            setSelectedIndex(0);
        else if (selectedIndex >= servers.length)
            setSelectedIndex(servers.length - 1);
    }, [selectedIndex, servers.length]);
    const update = (index, value) => {
        const next = replaceServer(servers, index, value);
        onChange(next);
        setJsonDraft(formatMcpJson(next));
    };
    const add = () => {
        const next = [...servers, createMcpServer(servers)];
        onChange(next);
        setJsonDraft(formatMcpJson(next));
        setSelectedIndex(next.length - 1);
    };
    const copy = () => {
        if (selected === undefined)
            return;
        const next = [...servers, copyMcpServer(selected, servers)];
        onChange(next);
        setJsonDraft(formatMcpJson(next));
        setSelectedIndex(next.length - 1);
    };
    const remove = () => {
        if (selected === undefined)
            return;
        const next = servers.filter((_, index) => index !== selectedIndex);
        onChange(next);
        setJsonDraft(formatMcpJson(next));
        setSelectedIndex(Math.min(selectedIndex, next.length - 1));
    };
    const importJson = () => {
        try {
            const next = parseMcpJson(jsonDraft);
            onChange(next);
            setSelectedIndex(next.length === 0 ? -1 : 0);
            setJsonDraft(formatMcpJson(next));
            setMessage(`已应用 ${next.length} 个 MCP 到可视化草稿；保存后写入运行时。`);
            setMode('visual');
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
        }
    };
    const reset = () => {
        const next = structuredClone(savedServers);
        onChange(next);
        setJsonDraft(formatMcpJson(next));
        setSelectedIndex(next.length === 0 ? -1 : 0);
        setMessage('已重置为上次保存的 MCP 配置。');
    };
    const save = async () => {
        if (issues.length > 0) {
            setMessage(`保存前请修正：${issues[0]?.message ?? '配置无效'}`);
            return;
        }
        await onSave();
        setMessage('MCP 配置已保存并热应用。');
    };
    const runtimeAction = async (action) => {
        if (selected === undefined)
            return;
        const name = selected.serverName;
        setOperations(current => ({ ...current, [name]: { action, status: 'pending', message: action === 'probe' ? '正在测活…' : '正在重载…' } }));
        try {
            const response = await fetch(`/ant-sword/mcp/${action}`, {
                method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serverName: name }),
            });
            const result = await response.json();
            if (!response.ok || !result.ok)
                throw new Error(result.error ?? `${action} 请求失败（${response.status}）`);
            if (action === 'probe')
                setProbes(current => ({ ...current, [name]: { toolCount: result.toolCount ?? 0, tools: result.tools ?? [] } }));
            setOperations(current => ({ ...current, [name]: { action, status: 'success', message: action === 'probe' ? `测活成功，发现 ${result.toolCount ?? 0} 个工具。` : '热重载成功。' } }));
        }
        catch (error) {
            setOperations(current => ({ ...current, [name]: { action, status: 'error', message: error instanceof Error ? error.message : String(error) } }));
        }
    };
    return _jsxs("section", { className: css.mcpEditor, "aria-labelledby": "mcp-editor-title", children: [_jsxs("header", { className: css.mcpHeader, children: [_jsxs("div", { children: [_jsx("h3", { id: "mcp-editor-title", children: "MCP \u670D\u52A1\u5668" }), _jsx("p", { children: "\u914D\u7F6E\u672C\u5730 stdio \u6216\u8FDC\u7A0B HTTP MCP \u670D\u52A1\u3002" })] }), _jsxs("div", { className: css.modeSwitch, role: "group", "aria-label": "MCP \u7F16\u8F91\u6A21\u5F0F", children: [_jsx("button", { type: "button", "aria-pressed": mode === 'visual', onClick: () => { setMode('visual'); }, children: "\u53EF\u89C6\u5316" }), _jsx("button", { type: "button", "aria-pressed": mode === 'json', onClick: () => { setJsonDraft(formatMcpJson(servers)); setMode('json'); }, children: "JSON" })] })] }), mode === 'json' ? _jsxs("div", { className: css.jsonEditor, children: [_jsx("label", { htmlFor: "mcp-json-source", children: "MCP JSON" }), _jsx("textarea", { id: "mcp-json-source", spellCheck: false, value: jsonDraft, onChange: (event) => { setJsonDraft(event.target.value); }, "aria-describedby": "mcp-json-help" }), _jsx("p", { id: "mcp-json-help", children: "\u652F\u6301\u76F4\u63A5\u7C98\u8D34 mcpServers \u547D\u540D\u5BF9\u8C61\u3001mcpServers \u6570\u7EC4\u6216\u670D\u52A1\u5668\u6570\u7EC4\u3002\u89E3\u6790\u5931\u8D25\u4E0D\u4F1A\u8986\u76D6\u5F53\u524D\u53EF\u89C6\u5316\u8349\u7A3F\u3002" }), _jsx("div", { className: css.editorActions, children: _jsx("button", { type: "button", onClick: importJson, children: "\u5E94\u7528\u5230\u53EF\u89C6\u5316" }) })] }) : _jsxs("div", { className: css.masterDetail, children: [_jsxs("aside", { className: css.serverRail, "aria-label": "MCP \u670D\u52A1\u5668\u5217\u8868", children: [_jsxs("div", { className: css.serverRailHeader, children: [_jsx("strong", { children: "\u670D\u52A1\u5668" }), _jsx("button", { type: "button", onClick: add, children: "\u6DFB\u52A0" })] }), _jsx("div", { role: "listbox", "aria-label": "MCP \u670D\u52A1\u5668", "aria-activedescendant": selected === undefined ? undefined : `mcp-server-${selectedIndex}`, children: servers.map((server, index) => _jsxs("button", { id: `mcp-server-${index}`, type: "button", role: "option", "aria-selected": index === selectedIndex, onClick: () => { setSelectedIndex(index); }, onKeyDown: (event) => {
                                        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')
                                            return;
                                        event.preventDefault();
                                        const step = event.key === 'ArrowDown' ? 1 : -1;
                                        setSelectedIndex((index + step + servers.length) % servers.length);
                                    }, children: [_jsx("span", { children: server.serverName || '未命名服务器' }), _jsx("small", { children: server.enabled === false ? '已停用' : server.transport })] }, `${index}-${server.serverName}`)) }), servers.length === 0 && _jsx("p", { children: "\u5C1A\u672A\u914D\u7F6E\u670D\u52A1\u5668\u3002" })] }), _jsx("div", { className: css.serverDetail, children: selected === undefined ? _jsxs("div", { className: css.emptyDetail, children: [_jsx("p", { children: "\u6DFB\u52A0\u670D\u52A1\u5668\u540E\u5728\u6B64\u7F16\u8F91\u8BE6\u60C5\u3002" }), _jsx("button", { type: "button", onClick: add, children: "\u6DFB\u52A0 MCP \u670D\u52A1\u5668" })] }) : _jsxs(_Fragment, { children: [_jsxs("div", { className: css.detailToolbar, children: [_jsxs("label", { className: css.enableToggle, children: [_jsx("input", { type: "checkbox", checked: selected.enabled !== false, onChange: (event) => { update(selectedIndex, { ...selected, enabled: event.target.checked }); } }), "\u542F\u7528"] }), _jsx("button", { type: "button", onClick: copy, children: "\u590D\u5236" }), _jsx("button", { type: "button", onClick: remove, children: "\u5220\u9664" })] }), _jsxs("div", { className: css.detailFields, children: [_jsxs("label", { children: ["\u540D\u79F0", _jsx("input", { value: selected.serverName, onChange: (event) => {
                                                        update(selectedIndex, { ...selected, serverName: event.target.value });
                                                    } })] }), _jsxs("label", { children: ["\u4F20\u8F93", _jsxs("select", { value: selected.transport, onChange: (event) => {
                                                        update(selectedIndex, switchMcpTransport(selected, event.target.value));
                                                    }, children: [_jsx("option", { value: "stdio", children: "stdio" }), _jsx("option", { value: "sse", children: "HTTP + SSE\uFF08\u65E7\u7248\uFF09" }), _jsx("option", { value: "streamable-http", children: "Streamable HTTP" })] })] }), selected.transport === 'stdio' ? _jsxs(_Fragment, { children: [_jsxs("label", { children: ["\u547D\u4EE4", _jsx("input", { value: selected.command ?? '', onChange: (event) => { update(selectedIndex, { ...selected, command: event.target.value }); } })] }), _jsxs("label", { children: ["\u53C2\u6570\uFF08\u6BCF\u884C\u4E00\u9879\uFF09", _jsx("textarea", { value: (selected.args ?? []).join('\n'), onChange: (event) => { update(selectedIndex, { ...selected, args: event.target.value.split('\n').map(value => value.trim()).filter(Boolean) }); } })] }), _jsxs("label", { children: ["\u5DE5\u4F5C\u76EE\u5F55", _jsx("input", { value: selected.cwd ?? '', onChange: (event) => { update(selectedIndex, { ...selected, cwd: event.target.value }); } })] }), _jsx(McpKeyValueEditor, { label: "\u73AF\u5883\u53D8\u91CF", value: selected.env ?? {}, onChange: (value) => { update(selectedIndex, withMcpMap(selected, 'env', value)); } })] }) : _jsxs(_Fragment, { children: [_jsxs("label", { children: ["URL", _jsx("input", { type: "url", value: selected.url ?? '', onChange: (event) => { update(selectedIndex, { ...selected, url: event.target.value }); } })] }), _jsx(McpKeyValueEditor, { label: "\u8BF7\u6C42\u5934", value: selected.headers ?? {}, onChange: (value) => { update(selectedIndex, withMcpMap(selected, 'headers', value)); } })] }), _jsxs("label", { children: ["\u5DE5\u5177\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09", _jsx("input", { type: "number", min: 1, value: selected.toolCallTimeoutMs ?? 60_000, onChange: (event) => { update(selectedIndex, { ...selected, toolCallTimeoutMs: Number(event.target.value) }); } })] })] }), _jsxs("div", { className: css.runtimeActions, children: [_jsx("button", { type: "button", disabled: !selected.serverName || operations[selected.serverName]?.status === 'pending', onClick: () => { void runtimeAction('probe'); }, children: "\u6D4B\u6D3B" }), _jsx("button", { type: "button", disabled: !selected.serverName || operations[selected.serverName]?.status === 'pending', onClick: () => { void runtimeAction('reload'); }, children: "\u70ED\u91CD\u8F7D" }), operations[selected.serverName] !== undefined && _jsx("span", { role: "status", "data-state": operations[selected.serverName]?.status, children: operations[selected.serverName]?.message })] }), probes[selected.serverName] !== undefined && _jsxs("details", { children: [_jsxs("summary", { children: ["\u5DF2\u53D1\u73B0 ", probes[selected.serverName]?.toolCount, " \u4E2A\u5DE5\u5177"] }), _jsx("ul", { children: probes[selected.serverName]?.tools.map(tool => _jsxs("li", { children: [_jsx("code", { children: tool.name }), tool.description === undefined ? null : _jsx("small", { children: tool.description })] }, tool.name)) })] })] }) })] }), issues.length > 0 && _jsx("ul", { className: css.validation, "aria-label": "MCP \u914D\u7F6E\u95EE\u9898", children: issues.map((issue, index) => _jsx("li", { children: issue.message }, index)) }), message !== undefined && _jsx("p", { className: css.editorMessage, role: "status", children: message }), _jsxs("footer", { className: css.saveBar, children: [_jsx("span", { children: dirty ? '有未保存更改' : '所有更改已保存' }), _jsx("button", { type: "button", disabled: !dirty || saving, onClick: reset, children: "\u91CD\u7F6E" }), _jsx("button", { type: "button", disabled: !dirty || saving || issues.length > 0, onClick: () => { void save(); }, children: saving ? '保存中…' : '保存 MCP' })] })] });
}
//# sourceMappingURL=McpConfigEditor.js.map