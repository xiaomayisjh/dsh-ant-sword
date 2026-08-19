/* eslint-disable @stylistic/max-len -- compact controlled form markup stays readable as field-level JSX. */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { McpConfigEditor } from './McpConfigEditor.tsx'
import { RuleEditor } from './RuleEditor.tsx'
import { SkillEditor } from './SkillEditor.tsx'
import { ThinkingPolicyEditor } from './ThinkingPolicyEditor.tsx'
import { ThinkingFallbackEditor } from './ThinkingFallbackEditor.tsx'
import type { RuntimeApplySnapshot } from './runtime-config-scope.ts'
import type { RuntimeConfigValue } from './runtime-config-types.ts'
import css from './RuntimeStatus.module.css'

interface SkillEntry {
  id: string
  name: string
  description?: string
  whenToUse?: string
  modelInvocable: boolean
  userInvocable: boolean
  content: string
  userOwned: boolean
}

export interface RuntimeConfigEditorScope extends SettingsScope<RuntimeConfigValue> {
  getRuntimeSnapshot(): RuntimeApplySnapshot
  subscribeRuntime(listener: () => void): () => void
}

interface Props {
  configScope: RuntimeConfigEditorScope
}

const EMPTY: RuntimeConfigValue = { mcpServers: [], disabledSkills: [], rules: [], thinkingPolicies: [], thinkingFallbacks: [] }

/** Settings editor for MCP, Skill overlays, runtime rules, and thinking policies. */
export function RuntimeConfigEditor({ configScope }: Props) {
  const snapshot = useSyncExternalStore(
    listener => configScope.subscribe(listener),
    () => configScope.getSnapshot(),
  )
  const runtime = useSyncExternalStore(
    listener => configScope.subscribeRuntime(listener),
    () => configScope.getRuntimeSnapshot(),
  )
  const [draft, setDraft] = useState<RuntimeConfigValue>(EMPTY)
  const [tab, setTab] = useState<'mcp' | 'thinking' | 'fallback' | 'skills' | 'rules'>('mcp')
  const [saving, setSaving] = useState(false)
  const [skillList, setSkillList] = useState<readonly SkillEntry[]>([])

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

  const reloadSkills = async (): Promise<void> => {
    try {
      const response = await fetch('/ant-sword/skills/list', { cache: 'no-store' })
      if (!response.ok) return
      const result = await response.json() as { skills: SkillEntry[] }
      setSkillList(result.skills.map(s => ({ ...s, id: s.name, content: s.content ?? '' })))
    } catch { /* transient network error; keep previous list */ }
  }

  useEffect(() => { void reloadSkills() }, [tab])

  if (snapshot.status !== 'ready' || snapshot.value === undefined) return <p className={css.installError}>动态配置尚未连接到本机 Host。</p>

  return (
    <section className={css.configEditor}>
      <div className={runtime.lastFailure !== undefined ? css.installError : css.summary} role="status">
        {runtime.applying
          ? `正在热应用配置（目标代 ${runtime.desiredGeneration}）`
          : runtime.inSync
            ? `已热应用（代 ${runtime.generation}）`
            : runtime.lastFailure === undefined
              ? '配置已保存，等待热应用'
              : `热应用失败：${runtime.lastFailure.reconciler} · ${runtime.lastFailure.message}`}
      </div>
      <nav className={css.tabs} aria-label="Red Team 配置">
        {(['mcp', 'thinking', 'fallback', 'skills', 'rules'] as const).map(value => (
          <button
            type="button"
            key={value}
            aria-current={tab === value ? 'page' : undefined}
            data-active={tab === value}
            onClick={() => { setTab(value) }}
          >
            {value === 'mcp' ? 'MCP' : value === 'thinking' ? '思考强度' : value === 'fallback' ? 'Fallback' : value === 'skills' ? 'Skills' : 'Rules'}
          </button>
        ))}
      </nav>

      {tab === 'mcp' && (
        <McpConfigEditor
          servers={draft.mcpServers}
          savedServers={snapshot.value.mcpServers}
          saving={saving}
          onChange={(mcpServers) => { setDraft(current => ({ ...current, mcpServers })) }}
          onSave={() => save('mcpServers')}
        />
      )}

      {tab === 'thinking' && (
        <ThinkingPolicyEditor
          policies={draft.thinkingPolicies}
          saving={saving}
          onChange={thinkingPolicies => setDraft(current => ({ ...current, thinkingPolicies }))}
          onSave={() => save('thinkingPolicies')}
        />
      )}

      {tab === 'fallback' && (
        <ThinkingFallbackEditor
          fallbacks={draft.thinkingFallbacks}
          saving={saving}
          onChange={thinkingFallbacks => setDraft(current => ({ ...current, thinkingFallbacks }))}
          onSave={() => save('thinkingFallbacks')}
        />
      )}

      {tab === 'skills' && (
        <SkillEditor
          scopeList={skillList}
          onChange={() => { void reloadSkills() }}
          onSave={reloadSkills}
        />
      )}

      {tab === 'rules' && (
        <RuleEditor
          rules={draft.rules}
          saving={saving}
          onChange={rules => setDraft(current => ({ ...current, rules: [...rules] }))}
          onSave={() => save('rules')}
        />
      )}
    </section>
  )
}