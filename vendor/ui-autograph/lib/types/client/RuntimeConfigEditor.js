import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/* eslint-disable @stylistic/max-len -- compact controlled form markup stays readable as field-level JSX. */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { McpConfigEditor } from "./McpConfigEditor.js";
import css from './RuntimeStatus.module.css';
const EMPTY = { mcpServers: [], disabledSkills: [], rules: [] };
function newRule() {
    return { id: `rule-${Date.now()}`, title: '新规则', enabled: true, order: 0, placement: 'after-persona', content: '' };
}
/** Settings editor for MCP, Skill overlays, and runtime rules. */
export function RuntimeConfigEditor({ configScope }) {
    const snapshot = useSyncExternalStore(listener => configScope.subscribe(listener), () => configScope.getSnapshot());
    const [draft, setDraft] = useState(EMPTY);
    const [tab, setTab] = useState('mcp');
    const [saving, setSaving] = useState(false);
    const [skillDraft, setSkillDraft] = useState({ name: '', description: '', whenToUse: '', modelInvocable: true, userInvocable: true, content: '' });
    const [skillError, setSkillError] = useState();
    useEffect(() => {
        if (snapshot.status === 'ready' && snapshot.value !== undefined)
            setDraft(structuredClone(snapshot.value));
    }, [snapshot.revision, snapshot.status, snapshot.value]);
    const save = async (field) => {
        setSaving(true);
        try {
            await configScope.set(field, draft[field]);
        }
        finally {
            setSaving(false);
        }
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
    if (snapshot.status !== 'ready' || snapshot.value === undefined)
        return _jsx("p", { className: css.installError, children: "\u52A8\u6001\u914D\u7F6E\u5C1A\u672A\u8FDE\u63A5\u5230\u672C\u673A Host\u3002" });
    return _jsxs("section", { className: css.configEditor, children: [_jsx("nav", { className: css.tabs, "aria-label": "Red Team \u914D\u7F6E", children: ['mcp', 'skills', 'rules'].map(value => _jsx("button", { type: "button", "aria-current": tab === value ? 'page' : undefined, "data-active": tab === value, onClick: () => { setTab(value); }, children: value === 'mcp' ? 'MCP' : value === 'skills' ? 'Skills' : 'Rules' }, value)) }), tab === 'mcp' && _jsx(McpConfigEditor, { servers: draft.mcpServers, savedServers: snapshot.value.mcpServers, saving: saving, onChange: (mcpServers) => { setDraft(current => ({ ...current, mcpServers })); }, onSave: () => save('mcpServers') }), tab === 'skills' && _jsxs("div", { className: css.editorList, children: [_jsxs("label", { children: ["\u505C\u7528 Skill\uFF08\u6BCF\u884C\u4E00\u4E2A\u540D\u79F0\uFF09", _jsx("textarea", { value: draft.disabledSkills.join('\n'), onChange: (event) => { setDraft(current => ({ ...current, disabledSkills: event.target.value.split('\n').map(value => value.trim()).filter(Boolean) })); } })] }), _jsx("div", { className: css.editorActions, children: _jsx("button", { type: "button", disabled: saving, onClick: () => { void save('disabledSkills'); }, children: "\u4FDD\u5B58 Skill \u72B6\u6001" }) }), _jsxs("fieldset", { children: [_jsx("legend", { children: "\u7528\u6237 Skill overlay" }), _jsxs("label", { children: ["\u540D\u79F0", _jsx("input", { value: skillDraft.name, onChange: (event) => { setSkillDraft(current => ({ ...current, name: event.target.value })); } })] }), _jsxs("label", { children: ["\u63CF\u8FF0", _jsx("input", { value: skillDraft.description, onChange: (event) => { setSkillDraft(current => ({ ...current, description: event.target.value })); } })] }), _jsxs("label", { children: ["\u4F7F\u7528\u65F6\u673A", _jsx("input", { value: skillDraft.whenToUse, onChange: (event) => { setSkillDraft(current => ({ ...current, whenToUse: event.target.value })); } })] }), _jsxs("label", { children: ["\u6A21\u578B\u53EF\u8C03\u7528", _jsx("input", { type: "checkbox", checked: skillDraft.modelInvocable, onChange: (event) => { setSkillDraft(current => ({ ...current, modelInvocable: event.target.checked })); } })] }), _jsxs("label", { children: ["\u7528\u6237\u53EF\u8C03\u7528", _jsx("input", { type: "checkbox", checked: skillDraft.userInvocable, onChange: (event) => { setSkillDraft(current => ({ ...current, userInvocable: event.target.checked })); } })] }), _jsxs("label", { children: ["\u6B63\u6587", _jsx("textarea", { value: skillDraft.content, onChange: (event) => { setSkillDraft(current => ({ ...current, content: event.target.value })); } })] }), _jsxs("div", { className: css.editorActions, children: [_jsx("button", { type: "button", onClick: () => { void saveSkill(); }, children: "\u4FDD\u5B58 overlay" }), _jsx("button", { type: "button", onClick: () => { void deleteSkill(); }, children: "\u5220\u9664 overlay" })] }), skillError !== undefined && _jsx("span", { className: css.installError, children: skillError })] })] }), tab === 'rules' && _jsxs("div", { className: css.editorList, children: [draft.rules.map((rule, index) => _jsxs("fieldset", { children: [_jsx("legend", { children: rule.title }), _jsxs("label", { children: ["\u6807\u9898", _jsx("input", { value: rule.title, onChange: (event) => { setDraft(current => ({ ...current, rules: current.rules.map((item, at) => at === index ? { ...item, title: event.target.value } : item) })); } })] }), _jsxs("label", { children: ["\u542F\u7528", _jsx("input", { type: "checkbox", checked: rule.enabled, onChange: (event) => { setDraft(current => ({ ...current, rules: current.rules.map((item, at) => at === index ? { ...item, enabled: event.target.checked } : item) })); } })] }), _jsxs("label", { children: ["\u4F4D\u7F6E", _jsxs("select", { value: rule.placement, onChange: (event) => { setDraft(current => ({ ...current, rules: current.rules.map((item, at) => at === index ? { ...item, placement: event.target.value } : item) })); }, children: [_jsx("option", { value: "before-persona", children: "Persona \u524D" }), _jsx("option", { value: "after-persona", children: "Persona \u540E" }), _jsx("option", { value: "before-tools", children: "\u5DE5\u5177\u524D" }), _jsx("option", { value: "after-tools", children: "\u5DE5\u5177\u540E" })] })] }), _jsxs("label", { children: ["\u987A\u5E8F", _jsx("input", { type: "number", value: rule.order, onChange: (event) => { setDraft(current => ({ ...current, rules: current.rules.map((item, at) => at === index ? { ...item, order: Number(event.target.value) } : item) })); } })] }), _jsxs("label", { children: ["\u6B63\u6587", _jsx("textarea", { value: rule.content, onChange: (event) => { setDraft(current => ({ ...current, rules: current.rules.map((item, at) => at === index ? { ...item, content: event.target.value } : item) })); } })] }), _jsx("button", { type: "button", onClick: () => { setDraft(current => ({ ...current, rules: current.rules.filter((_, at) => at !== index) })); }, children: "\u5220\u9664" })] }, rule.id)), _jsxs("div", { className: css.editorActions, children: [_jsx("button", { type: "button", onClick: () => { setDraft(current => ({ ...current, rules: [...current.rules, newRule()] })); }, children: "\u6DFB\u52A0 Rule" }), _jsx("button", { type: "button", disabled: saving, onClick: () => { void save('rules'); }, children: "\u4FDD\u5B58 Rules" })] })] })] });
}
//# sourceMappingURL=RuntimeConfigEditor.js.map