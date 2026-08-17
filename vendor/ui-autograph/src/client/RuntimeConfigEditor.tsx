/* eslint-disable @stylistic/max-len -- compact controlled form markup stays readable as field-level JSX. */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { McpConfig } from './mcp-config-json.ts'
import { McpConfigEditor } from './McpConfigEditor.tsx'
import css from './RuntimeStatus.module.css'

interface RuleConfig {
  id: string
  title: string
  enabled: boolean
  order: number
  placement: 'before-persona' | 'after-persona' | 'before-tools' | 'after-tools'
  content: string
}

export interface RuntimeConfigValue {
  mcpServers: McpConfig[]
  disabledSkills: string[]
  rules: RuleConfig[]
}

interface Props {
  configScope: SettingsScope<RuntimeConfigValue>
}

const EMPTY: RuntimeConfigValue = { mcpServers: [], disabledSkills: [], rules: [] }

function newRule(): RuleConfig {
  return { id: `rule-${Date.now()}`, title: '新规则', enabled: true, order: 0, placement: 'after-persona', content: '' }
}

/** Settings editor for MCP, Skill overlays, and runtime rules. */
export function RuntimeConfigEditor({ configScope }: Props) {
  const snapshot = useSyncExternalStore(
    listener => configScope.subscribe(listener),
    () => configScope.getSnapshot(),
  )
  const [draft, setDraft] = useState<RuntimeConfigValue>(EMPTY)
  const [tab, setTab] = useState<'mcp' | 'skills' | 'rules'>('mcp')
  const [saving, setSaving] = useState(false)
  const [skillDraft, setSkillDraft] = useState({ name: '', description: '', whenToUse: '', modelInvocable: true, userInvocable: true, content: '' })
  const [skillError, setSkillError] = useState<string>()

  useEffect(() => {
    if (snapshot.status === 'ready' && snapshot.value !== undefined) setDraft(structuredClone(snapshot.value))
  }, [snapshot.revision, snapshot.status, snapshot.value])

  const save = async (field: keyof RuntimeConfigValue): Promise<void> => {
    setSaving(true)
    try {
      await configScope.set(field, draft[field])
    } finally {
      setSaving(false)
    }
  }

  const saveSkill = async (): Promise<void> => {
    setSkillError(undefined)
    const response = await fetch('/ant-sword/skills/upsert', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(skillDraft) })
    if (!response.ok) {
      const result = await response.json() as { error?: string }
      setSkillError(result.error ?? 'Skill 保存失败')
    }
  }

  const deleteSkill = async (): Promise<void> => {
    setSkillError(undefined)
    const response = await fetch('/ant-sword/skills/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: skillDraft.name }) })
    if (!response.ok) {
      const result = await response.json() as { error?: string }
      setSkillError(result.error ?? 'Skill 删除失败')
    }
  }

  if (snapshot.status !== 'ready' || snapshot.value === undefined) return <p className={css.installError}>动态配置尚未连接到本机 Host。</p>

  return <section className={css.configEditor}>
    <nav className={css.tabs} aria-label="Red Team 配置">
      {(['mcp', 'skills', 'rules'] as const).map(value => <button type="button" key={value} aria-current={tab === value ? 'page' : undefined} data-active={tab === value} onClick={() =>{  setTab(value) }}>{value === 'mcp' ? 'MCP' : value === 'skills' ? 'Skills' : 'Rules'}</button>)}
    </nav>

    {tab === 'mcp' && <McpConfigEditor
      servers={draft.mcpServers}
      savedServers={snapshot.value.mcpServers}
      saving={saving}
      onChange={(mcpServers) =>{  setDraft(current => ({ ...current, mcpServers })) }}
      onSave={() => save('mcpServers')}
    />}

    {tab === 'skills' && <div className={css.editorList}>
      <label>停用 Skill（每行一个名称）<textarea value={draft.disabledSkills.join('\n')} onChange={(event) =>{  setDraft(current => ({ ...current, disabledSkills: event.target.value.split('\n').map(value => value.trim()).filter(Boolean) })) }} /></label>
      <div className={css.editorActions}><button type="button" disabled={saving} onClick={() => { void save('disabledSkills') }}>保存 Skill 状态</button></div>
      <fieldset>
        <legend>用户 Skill overlay</legend>
        <label>名称<input value={skillDraft.name} onChange={(event) =>{  setSkillDraft(current => ({ ...current, name: event.target.value })) }} /></label>
        <label>描述<input value={skillDraft.description} onChange={(event) =>{  setSkillDraft(current => ({ ...current, description: event.target.value })) }} /></label>
        <label>使用时机<input value={skillDraft.whenToUse} onChange={(event) =>{  setSkillDraft(current => ({ ...current, whenToUse: event.target.value })) }} /></label>
        <label>模型可调用<input type="checkbox" checked={skillDraft.modelInvocable} onChange={(event) =>{  setSkillDraft(current => ({ ...current, modelInvocable: event.target.checked })) }} /></label>
        <label>用户可调用<input type="checkbox" checked={skillDraft.userInvocable} onChange={(event) =>{  setSkillDraft(current => ({ ...current, userInvocable: event.target.checked })) }} /></label>
        <label>正文<textarea value={skillDraft.content} onChange={(event) =>{  setSkillDraft(current => ({ ...current, content: event.target.value })) }} /></label>
        <div className={css.editorActions}><button type="button" onClick={() => { void saveSkill() }}>保存 overlay</button><button type="button" onClick={() => { void deleteSkill() }}>删除 overlay</button></div>
        {skillError !== undefined && <span className={css.installError}>{skillError}</span>}
      </fieldset>
    </div>}

    {tab === 'rules' && <div className={css.editorList}>
      {draft.rules.map((rule, index) => <fieldset key={rule.id}>
        <legend>{rule.title}</legend>
        <label>标题<input value={rule.title} onChange={(event) =>{  setDraft(current => ({ ...current, rules: current.rules.map((item, at) => at === index ? { ...item, title: event.target.value } : item) })) }} /></label>
        <label>启用<input type="checkbox" checked={rule.enabled} onChange={(event) =>{  setDraft(current => ({ ...current, rules: current.rules.map((item, at) => at === index ? { ...item, enabled: event.target.checked } : item) })) }} /></label>
        <label>位置<select value={rule.placement} onChange={(event) =>{  setDraft(current => ({ ...current, rules: current.rules.map((item, at) => at === index ? { ...item, placement: event.target.value as RuleConfig['placement'] } : item) })) }}><option value="before-persona">Persona 前</option><option value="after-persona">Persona 后</option><option value="before-tools">工具前</option><option value="after-tools">工具后</option></select></label>
        <label>顺序<input type="number" value={rule.order} onChange={(event) =>{  setDraft(current => ({ ...current, rules: current.rules.map((item, at) => at === index ? { ...item, order: Number(event.target.value) } : item) })) }} /></label>
        <label>正文<textarea value={rule.content} onChange={(event) =>{  setDraft(current => ({ ...current, rules: current.rules.map((item, at) => at === index ? { ...item, content: event.target.value } : item) })) }} /></label>
        <button type="button" onClick={() =>{  setDraft(current => ({ ...current, rules: current.rules.filter((_, at) => at !== index) })) }}>删除</button>
      </fieldset>)}
      <div className={css.editorActions}><button type="button" onClick={() =>{  setDraft(current => ({ ...current, rules: [...current.rules, newRule()] })) }}>添加 Rule</button><button type="button" disabled={saving} onClick={() => { void save('rules') }}>保存 Rules</button></div>
    </div>}
  </section>
}
