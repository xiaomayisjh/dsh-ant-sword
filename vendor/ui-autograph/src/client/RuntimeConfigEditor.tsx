/* eslint-disable @stylistic/max-len -- compact controlled form markup stays readable as field-level JSX. */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import css from './RuntimeStatus.module.css'
import { formatMcpJson, parseMcpJson } from './mcp-config-json.ts'
import type { McpConfig } from './mcp-config-json.ts'

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

interface McpProbeView {
  toolCount: number
  tools: readonly { name: string; description?: string }[]
}

interface Props {
  configScope: SettingsScope<RuntimeConfigValue>
}

const EMPTY: RuntimeConfigValue = { mcpServers: [], disabledSkills: [], rules: [] }

function newMcp(): McpConfig {
  return { enabled: true, serverName: `server-${Date.now()}`, transport: 'stdio', command: '', args: [], toolCallTimeoutMs: 60_000 }
}

function newRule(): RuleConfig {
  return { id: `rule-${Date.now()}`, title: '新规则', enabled: true, order: 0, placement: 'after-persona', content: '' }
}

function KeyValueEditor({ value, onChange, label }: { value: Record<string, string>; onChange: (value: Record<string, string>) => void; label: string }) {
  const entries = Object.entries(value)
  return <div className={css.keyValues}><strong>{label}</strong>{entries.map(([key, itemValue], index) => <div key={`${key}-${index}`}>
    <input aria-label={`${label} key`} value={key} onChange={(event) =>{  onChange(Object.fromEntries(entries.map((entry, at) => at === index ? [event.target.value, entry[1]] : entry))) }} />
    <input aria-label={`${label} value`} value={itemValue} onChange={(event) =>{  onChange(Object.fromEntries(entries.map((entry, at) => at === index ? [entry[0], event.target.value] : entry))) }} />
    <button type="button" onClick={() =>{  onChange(Object.fromEntries(entries.filter((_, at) => at !== index))) }}>删除</button>
  </div>)}<button type="button" onClick={() =>{  onChange({ ...value, [`KEY_${entries.length + 1}`]: '' }) }}>添加</button></div>
}

function McpProbeDetails({ probe }: { probe: McpProbeView | undefined }) {
  if (probe === undefined) return null
  return <details>
    <summary>已发现 {probe.toolCount} 个工具</summary>
    <ul>{probe.tools.map(tool => <li key={tool.name}><code>{tool.name}</code>{tool.description === undefined ? null : <small>{tool.description}</small>}</li>)}</ul>
  </details>
}

export function RuntimeConfigEditor({ configScope }: Props) {
  const snapshot = useSyncExternalStore(
    listener => configScope.subscribe(listener),
    () => configScope.getSnapshot(),
  )
  const [draft, setDraft] = useState<RuntimeConfigValue>(EMPTY)
  const [tab, setTab] = useState<'mcp' | 'skills' | 'rules'>('mcp')
  const [saving, setSaving] = useState(false)
  const [mcpJson, setMcpJson] = useState('')
  const [mcpMessage, setMcpMessage] = useState<string>()
  const [mcpProbes, setMcpProbes] = useState<Record<string, McpProbeView>>({})
  const [skillDraft, setSkillDraft] = useState({ name: '', description: '', whenToUse: '', modelInvocable: true, userInvocable: true, content: '' })
  const [skillError, setSkillError] = useState<string>()

  useEffect(() => {
    if (snapshot.status === 'ready' && snapshot.value !== undefined) setDraft(structuredClone(snapshot.value))
  }, [snapshot.revision, snapshot.status, snapshot.value])

  const save = async (field: keyof RuntimeConfigValue): Promise<void> => {
    setSaving(true)
    setMcpMessage(undefined)
    try {
      await configScope.set(field, draft[field])
      if (field === 'mcpServers') setMcpMessage('MCP 配置已保存并热应用。')
    } catch (error) {
      if (field === 'mcpServers') setMcpMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const importMcpJson = (): void => {
    try {
      const entries = parseMcpJson(mcpJson)
      setDraft(current => ({ ...current, mcpServers: entries }))
      setMcpMessage(`已导入 ${entries.length} 个 MCP；点击保存后热应用。`)
    } catch (error) {
      setMcpMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const exportMcpJson = (): void => {
    setMcpJson(formatMcpJson(draft.mcpServers))
    setMcpMessage('可视化配置已同步到 JSON。')
  }

  const runMcpAction = async (serverName: string, action: 'probe' | 'reload'): Promise<void> => {
    setMcpMessage(action === 'probe' ? `正在测活 ${serverName}…` : `正在重载 ${serverName}…`)
    const response = await fetch(`/ant-sword/mcp/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ serverName }),
    })
    const result = await response.json() as { ok: boolean; error?: string; toolCount?: number; tools?: readonly { name: string; description?: string }[] }
    if (!result.ok) {
      setMcpMessage(result.error ?? `${serverName} 操作失败。`)
      return
    }
    if (action === 'probe') {
      setMcpProbes(current => ({ ...current, [serverName]: { toolCount: result.toolCount ?? 0, tools: result.tools ?? [] } }))
    }
    setMcpMessage(action === 'probe'
      ? `${serverName} 测活成功，发现 ${result.toolCount ?? 0} 个工具。`
      : `${serverName} 已热重载。`)
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

  if (snapshot.status !== 'ready') return <p className={css.installError}>动态配置尚未连接到本机 Host。</p>

  return (
    <section className={css.configEditor}>
      <nav className={css.tabs} aria-label="Red Team 配置">
        {(['mcp', 'skills', 'rules'] as const).map(value => <button type="button" key={value} data-active={tab === value} onClick={() =>{  setTab(value) }}>{value.toUpperCase()}</button>)}
      </nav>

      {tab === 'mcp' && <div className={css.editorList}>
        <fieldset>
          <legend>JSON 配置同步</legend>
          <label>支持直接粘贴 MCP JSON 或 `mcpServers` 对象<textarea value={mcpJson} onChange={(event) => { setMcpJson(event.target.value) }} /></label>
          <div className={css.editorActions}><button type="button" onClick={importMcpJson}>JSON → 可视化</button><button type="button" onClick={exportMcpJson}>可视化 → JSON</button></div>
          {mcpMessage !== undefined && <span className={css.installError}>{mcpMessage}</span>}
        </fieldset>
        {draft.mcpServers.map((server, index) => <fieldset key={`${server.serverName}-${index}`}>
          <legend>{server.serverName || `MCP ${index + 1}`}</legend>
          <label>名称<input value={server.serverName} onChange={(event) =>{  setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { ...item, serverName: event.target.value } : item) })) }} /></label>
          <label>启用<input type="checkbox" checked={server.enabled !== false} onChange={(event) =>{  setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { ...item, enabled: event.target.checked } : item) })) }} /></label>
          <label>传输<select value={server.transport} onChange={(event) =>{  setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { serverName: item.serverName, enabled: item.enabled ?? true, transport: event.target.value as McpConfig['transport'], toolCallTimeoutMs: item.toolCallTimeoutMs ?? 60_000, ...(event.target.value === 'stdio' ? { command: '', args: [] } : { url: '' }) } : item) })) }}><option value="stdio">stdio</option><option value="sse">HTTP + SSE（旧版）</option><option value="streamable-http">Streamable HTTP</option></select></label>
          {server.transport === 'stdio' ? <>
            <label>命令<input value={server.command ?? ''} onChange={(event) =>{  setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { ...item, command: event.target.value } : item) })) }} /></label>
            <label>参数（每行一项）<textarea value={(server.args ?? []).join('\n')} onChange={(event) =>{  setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { ...item, args: event.target.value.split('\n').filter(Boolean) } : item) })) }} /></label>
            <label>工作目录<input value={server.cwd ?? ''} onChange={(event) =>{  setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { ...item, cwd: event.target.value } : item) })) }} /></label>
            <KeyValueEditor label="环境变量" value={server.env ?? {}} onChange={(env) =>{  setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { ...item, env } : item) })) }} />
          </> : <>
            <label>URL<input value={server.url ?? ''} onChange={(event) =>{  setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { ...item, url: event.target.value } : item) })) }} /></label>
            <KeyValueEditor label="请求头" value={server.headers ?? {}} onChange={(headers) =>{  setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { ...item, headers } : item) })) }} />
          </>}
          <label>工具超时（毫秒）<input type="number" min={1} value={server.toolCallTimeoutMs ?? 60_000} onChange={(event) =>{  setDraft(current => ({ ...current, mcpServers: current.mcpServers.map((item, at) => at === index ? { ...item, toolCallTimeoutMs: Number(event.target.value) } : item) })) }} /></label>
          <McpProbeDetails probe={mcpProbes[server.serverName]} />
          <button type="button" onClick={() => { void runMcpAction(server.serverName, 'probe') }}>测活</button>
          <button type="button" onClick={() => { void runMcpAction(server.serverName, 'reload') }}>热重载</button>
          <button type="button" onClick={() =>{  setDraft(current => ({ ...current, mcpServers: current.mcpServers.filter((_, at) => at !== index) })) }}>删除</button>
        </fieldset>)}
        <div className={css.editorActions}><button type="button" onClick={() =>{  setDraft(current => ({ ...current, mcpServers: [...current.mcpServers, newMcp()] })) }}>添加 MCP</button><button type="button" disabled={saving} onClick={() => { void save('mcpServers') }}>保存 MCP</button></div>
      </div>}

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
  )
}
