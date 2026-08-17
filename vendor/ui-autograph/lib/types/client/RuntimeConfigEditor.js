import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/* eslint-disable @stylistic/max-len -- compact controlled form markup stays readable as field-level JSX. */
import { useEffect, useState, useSyncExternalStore } from 'react';
import css from './RuntimeStatus.module.css';
import { formatMcpJson, parseMcpJson } from "./mcp-config-json.js";
const EMPTY = { mcpServers: [], disabledSkills: [], rules: [] };
function newMcp() {
    return { enabled: true, serverName: `server-${Date.now()}`, transport: 'stdio', command: '', args: [], toolCallTimeoutMs: 60_000 };
}
function newRule() {
    return { id: `rule-${Date.now()}`, title: '新规则', enabled: true, order: 0, placement: 'after-persona', content: '' };
}
function KeyValueEditor({ value, onChange, label }) {
    const entries = Object.entries(value);
    return _jsxs("div", { className: css.keyValues, children: [_jsx("strong", { children: label }), entries.map(([key, itemValue], index) => _jsxs("div", { children: [_jsx("input", { "aria-label": `${label} key`, value: key, onChange: (event) => { onChange(Object.fromEntries(entries.map((entry, at) => at === index ? [event.target.value, entry[1]] : entry))); } }), _jsx("input", { "aria-label": `${label} value`, value: itemValue, onChange: (event) => { onChange(Object.fromEntries(entries.map((entry, at) => at === index ? [entry[0], event.target.value] : entry))); } }), _jsx("button", { type: "button", onClick: () => { onChange(Object.fromEntries(entries.filter((_, at) => at !== index))); }, children: "\u5220\u9664" })] }, `${key}-${index}`)), _jsx("button", { type: "button", onClick: () => { onChange({ ...value, [`KEY_${entries.length + 1}`]: '' }); }, children: "\u6DFB\u52A0" })] });
}
function McpProbeDetails({ probe }) {
    if (probe === undefined)
        return null;
    return _jsxs("details", { children: [_jsxs("summary", { children: ["\u5DF2\u53D1\u73B0 ", probe.toolCount, " \u4E2A\u5DE5\u5177"] }), _jsx("ul", { children: probe.tools.map(tool => _jsxs("li", { children: [_jsx("code", { children: tool.name }), tool.description === undefined ? null : _jsx("small", { children: tool.description })] }, tool.name)) })] });
}
export function RuntimeConfigEditor({ configScope }) {
    const snapshot = useSyncExternalStore(listener => configScope.subscribe(listener), () => configScope.getSnapshot());
    const [draft, setDraft] = useState(EMPTY);
    const [tab, setTab] = useState('mcp');
    const [saving, setSaving] = useState(false);
    const [mcpJson, setMcpJson] = useState('');
    const [mcpMessage, setMcpMessage] = useState();
    const [mcpProbes, setMcpProbes] = useState({});
    const [skillDraft, setSkillDraft] = useState({ name: '', description: '', whenToUse: '', modelInvocable: true, userInvocable: true, content: '' });
    const [skillError, setSkillError] = useState();
    useEffect(() => {
        if (snapshot.status === 'ready' && snapshot.value !== undefined)
            setDraft(structuredClone(snapshot.value));
    }, [snapshot.revision, snapshot.status, snapshot.value]);
    const save = async (field) => {
        setSaving(true);
        setMcpMessage(undefined);
        try {
            await configScope.set(field, draft[field]);
            if (field === 'mcpServers')
                setMcpMessage('MCP 配置已保存并热应用。');
        }
        catch (error) {
            if (field === 'mcpServers')
                setMcpMessage(error instanceof Error ? error.message : String(error));
        }
        finally {
            setSaving(false);
        }
    };
    const importMcpJson = () => {
        try {
            const entries = parseMcpJson(mcpJson);
            setDraft(current => ({ ...current, mcpServers: entries }));
            setMcpMessage(`已导入 ${entries.length} 个 MCP；点击保存后热应用。`);
        }
        catch (error) {
            setMcpMessage(error instanceof Error ? error.message : String(error));
        }
    };
    const exportMcpJson = () => {
        setMcpJson(formatMcpJson(draft.mcpServers));
        setMcpMessage('可视化配置已同步到 JSON。');
    };
    const runMcpAction = async (serverName, action) => {
        setMcpMessage(action === 'probe' ? `正在测活 ${serverName}…` : `正在重载 ${serverName}…`);
        const response = await fetch(`/ant-sword/mcp/${action}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ serverName }),
        });
        const result = await response.json();
        if (!result.ok) {
            setMcpMessage(result.error ?? `${serverName} 操作失败。`);
            return;
        }
        if (action === 'probe') {
            setMcpProbes(current => ({ ...current, [serverName]: { toolCount: result.toolCount ?? 0, tools: result.tools ?? [] } }));
        }
        setMcpMessage(action === 'probe'
            ? `${serverName} 测活成功，发现 ${result.toolCount ?? 0} 个工具。`
            : `${serverName} 已热重载。`);
    };
    const saveSkill = async () => {
        setSkillError(undefined);
        const response = await fetch('/ant-sword/skills/upsert', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(skillDraft) });
        if (!response.ok) {
            const result = await response.json();
            setSkillError(result.error ?? 'Skill 保存失败');
        }
    };
    const deleteSkill = async () => {
        setSkillError(undefined);
        const response = await fetch('/ant-sword/skills/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: skillDraft.name }) });
        if (!response.ok) {
            const result = await response.json();
            setSkillError(result.error ?? 'Skill 删除失败');
        }
    };
    if (snapshot.status !== 'ready')
        return _jsx("p", { className: css.installError, children: "\u52A8\u6001\u914D\u7F6E\u5C1A\u672A\u8FDE\u63A5\u5230\u672C\u673A Host\u3002" });
    return (_jsxs("section", { className: css.configEditor, children: [_jsx("nav", { className: css.tabs, "aria-label": "Red Team \u914D\u7F6E", children: ['mcp', 'skills', 'rules'].map(value => _jsx("button", { type: "button", "data-active": tab === value, onClick: () => { setTab(value); }, children: value.toUpperCase() }, value)) }), tab === 'mcp' && _jsxs("div", { className: css.editorList, children: [_jsxs("fieldset", { children: [_jsx("legend", { children: "JSON \u914D\u7F6E\u540C\u6B65" }), _jsxs("label", { children: ["\u652F\u6301\u76F4\u63A5\u7C98\u8D34 MCP JSON \u6216 `mcpServers` \u5BF9\u8C61", _jsx("textarea", { value: mcpJson, onChange: (event) => { setMcpJson(event.target.value); } })] }), _jsxs("div", { className: css.editorActions, children: [_jsx("button", { type: "button", onClick: importMcpJson, children: "JSON \u2192 \u53EF\u89C6\u5316" }), _jsx("button", { type: "button", onClick: exportMcpJson, children: "\u53EF\u89C6\u5316 \u2192 JSON" })] }), mcpMessage !== undefined && _jsx("span", { className: css.installError, children: mcpMessage })] }), draft.mcpServers.map((server, index) => _jsxs("fieldset", { children: [_jsx("legend", { children: server.serverName || `MCP ${index + 1}` }), _jsxs("label", { children: ["\u540D\u79F0", _jsx("input", { value: server.serverName, onChange: (event) => { setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { ...item, serverName: event.target.value } : item) })); } })] }), _jsxs("label", { children: ["\u542F\u7528", _jsx("input", { type: "checkbox", checked: server.enabled !== false, onChange: (event) => { setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { ...item, enabled: event.target.checked } : item) })); } })] }), _jsxs("label", { children: ["\u4F20\u8F93", _jsxs("select", { value: server.transport, onChange: (event) => { setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { serverName: item.serverName, enabled: item.enabled ?? true, transport: event.target.value, toolCallTimeoutMs: item.toolCallTimeoutMs ?? 60_000, ...(event.target.value === 'stdio' ? { command: '', args: [] } : { url: '' }) } : item) })); }, children: [_jsx("option", { value: "stdio", children: "stdio" }), _jsx("option", { value: "sse", children: "HTTP + SSE\uFF08\u65E7\u7248\uFF09" }), _jsx("option", { value: "streamable-http", children: "Streamable HTTP" })] })] }), server.transport === 'stdio' ? _jsxs(_Fragment, { children: [_jsxs("label", { children: ["\u547D\u4EE4", _jsx("input", { value: server.command ?? '', onChange: (event) => { setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { ...item, command: event.target.value } : item) })); } })] }), _jsxs("label", { children: ["\u53C2\u6570\uFF08\u6BCF\u884C\u4E00\u9879\uFF09", _jsx("textarea", { value: (server.args ?? []).join('\n'), onChange: (event) => { setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { ...item, args: event.target.value.split('\n').filter(Boolean) } : item) })); } })] }), _jsxs("label", { children: ["\u5DE5\u4F5C\u76EE\u5F55", _jsx("input", { value: server.cwd ?? '', onChange: (event) => { setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { ...item, cwd: event.target.value } : item) })); } })] }), _jsx(KeyValueEditor, { label: "\u73AF\u5883\u53D8\u91CF", value: server.env ?? {}, onChange: (env) => { setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { ...item, env } : item) })); } })] }) : _jsxs(_Fragment, { children: [_jsxs("label", { children: ["URL", _jsx("input", { value: server.url ?? '', onChange: (event) => { setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { ...item, url: event.target.value } : item) })); } })] }), _jsx(KeyValueEditor, { label: "\u8BF7\u6C42\u5934", value: server.headers ?? {}, onChange: (headers) => { setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { ...item, headers } : item) })); } })] }), _jsxs("label", { children: ["\u5DE5\u5177\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09", _jsx("input", { type: "number", min: 1, value: server.toolCallTimeoutMs ?? 60_000, onChange: (event) => { setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { ...item, toolCallTimeoutMs: Number(event.target.value) } : item) })); } })] }), _jsx(McpProbeDetails, { probe: mcpProbes[server.serverName] }), _jsx("button", { type: "button", onClick: () => { void runMcpAction(server.serverName, 'probe'); }, children: "\u6D4B\u6D3B" }), _jsx("button", { type: "button", onClick: () => { void runMcpAction(server.serverName, 'reload'); }, children: "\u70ED\u91CD\u8F7D" }), _jsx("button", { type: "button", onClick: () => { setDraft(current => ({ ...current, mcpServers: current.mcpServers.filter((_, at) => at !== index) })); }, children: "\u5220\u9664" })] }, `${server.serverName}-${index}`)), _jsxs("div", { className: css.editorActions, children: [_jsx("button", { type: "button", onClick: () => { setDraft(current => ({ ...current, mcpServers: [...current.mcpServers, newMcp()] })); }, children: "\u6DFB\u52A0 MCP" }), _jsx("button", { type: "button", disabled: saving, onClick: () => { void save('mcpServers'); }, children: "\u4FDD\u5B58 MCP" })] })] }), tab === 'skills' && _jsxs("div", { className: css.editorList, children: [_jsxs("label", { children: ["\u505C\u7528 Skill\uFF08\u6BCF\u884C\u4E00\u4E2A\u540D\u79F0\uFF09", _jsx("textarea", { value: draft.disabledSkills.join('\n'), onChange: (event) => { setDraft(current => ({ ...current, disabledSkills: event.target.value.split('\n').map(value => value.trim()).filter(Boolean) })); } })] }), _jsx("div", { className: css.editorActions, children: _jsx("button", { type: "button", disabled: saving, onClick: () => { void save('disabledSkills'); }, children: "\u4FDD\u5B58 Skill \u72B6\u6001" }) }), _jsxs("fieldset", { children: [_jsx("legend", { children: "\u7528\u6237 Skill overlay" }), _jsxs("label", { children: ["\u540D\u79F0", _jsx("input", { value: skillDraft.name, onChange: (event) => { setSkillDraft(current => ({ ...current, name: event.target.value })); } })] }), _jsxs("label", { children: ["\u63CF\u8FF0", _jsx("input", { value: skillDraft.description, onChange: (event) => { setSkillDraft(current => ({ ...current, description: event.target.value })); } })] }), _jsxs("label", { children: ["\u4F7F\u7528\u65F6\u673A", _jsx("input", { value: skillDraft.whenToUse, onChange: (event) => { setSkillDraft(current => ({ ...current, whenToUse: event.target.value })); } })] }), _jsxs("label", { children: ["\u6A21\u578B\u53EF\u8C03\u7528", _jsx("input", { type: "checkbox", checked: skillDraft.modelInvocable, onChange: (event) => { setSkillDraft(current => ({ ...current, modelInvocable: event.target.checked })); } })] }), _jsxs("label", { children: ["\u7528\u6237\u53EF\u8C03\u7528", _jsx("input", { type: "checkbox", checked: skillDraft.userInvocable, onChange: (event) => { setSkillDraft(current => ({ ...current, userInvocable: event.target.checked })); } })] }), _jsxs("label", { children: ["\u6B63\u6587", _jsx("textarea", { value: skillDraft.content, onChange: (event) => { setSkillDraft(current => ({ ...current, content: event.target.value })); } })] }), _jsxs("div", { className: css.editorActions, children: [_jsx("button", { type: "button", onClick: () => { void saveSkill(); }, children: "\u4FDD\u5B58 overlay" }), _jsx("button", { type: "button", onClick: () => { void deleteSkill(); }, children: "\u5220\u9664 overlay" })] }), skillError !== undefined && _jsx("span", { className: css.installError, children: skillError })] })] }), tab === 'rules' && _jsxs("div", { className: css.editorList, children: [draft.rules.map((rule, index) => _jsxs("fieldset", { children: [_jsx("legend", { children: rule.title }), _jsxs("label", { children: ["\u6807\u9898", _jsx("input", { value: rule.title, onChange: (event) => { setDraft(current => ({ ...current, rules: current.rules.map((item, at) => at === index ? { ...item, title: event.target.value } : item) })); } })] }), _jsxs("label", { children: ["\u542F\u7528", _jsx("input", { type: "checkbox", checked: rule.enabled, onChange: (event) => { setDraft(current => ({ ...current, rules: current.rules.map((item, at) => at === index ? { ...item, enabled: event.target.checked } : item) })); } })] }), _jsxs("label", { children: ["\u4F4D\u7F6E", _jsxs("select", { value: rule.placement, onChange: (event) => { setDraft(current => ({ ...current, rules: current.rules.map((item, at) => at === index ? { ...item, placement: event.target.value } : item) })); }, children: [_jsx("option", { value: "before-persona", children: "Persona \u524D" }), _jsx("option", { value: "after-persona", children: "Persona \u540E" }), _jsx("option", { value: "before-tools", children: "\u5DE5\u5177\u524D" }), _jsx("option", { value: "after-tools", children: "\u5DE5\u5177\u540E" })] })] }), _jsxs("label", { children: ["\u987A\u5E8F", _jsx("input", { type: "number", value: rule.order, onChange: (event) => { setDraft(current => ({ ...current, rules: current.rules.map((item, at) => at === index ? { ...item, order: Number(event.target.value) } : item) })); } })] }), _jsxs("label", { children: ["\u6B63\u6587", _jsx("textarea", { value: rule.content, onChange: (event) => { setDraft(current => ({ ...current, rules: current.rules.map((item, at) => at === index ? { ...item, content: event.target.value } : item) })); } })] }), _jsx("button", { type: "button", onClick: () => { setDraft(current => ({ ...current, rules: current.rules.filter((_, at) => at !== index) })); }, children: "\u5220\u9664" })] }, rule.id)), _jsxs("div", { className: css.editorActions, children: [_jsx("button", { type: "button", onClick: () => { setDraft(current => ({ ...current, rules: [...current.rules, newRule()] })); }, children: "\u6DFB\u52A0 Rule" }), _jsx("button", { type: "button", disabled: saving, onClick: () => { void save('rules'); }, children: "\u4FDD\u5B58 Rules" })] })] })] }));
}
//# sourceMappingURL=RuntimeConfigEditor.js.map