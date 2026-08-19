import { useState } from 'react'
import type { ThinkingFallbackPolicy } from './runtime-config-types.ts'
import css from './RuntimeStatus.module.css'

interface Props {
  fallbacks: ThinkingFallbackPolicy[]
  saving: boolean
  onChange(fallbacks: ThinkingFallbackPolicy[]): void
  onSave(): Promise<void>
}

function key(fallback: Pick<ThinkingFallbackPolicy, 'providerId' | 'modelId'>): string {
  return `${fallback.providerId}\0${fallback.modelId}`
}

const COMMON_FALLBACKS: Array<{ label: string; config: ThinkingFallbackPolicy }> = [
  {
    label: 'OpenAI o1 系列',
    config: {
      providerId: 'custom-openai',
      modelId: 'o1-*',
      simulatedEfforts: { minimum: 'low', low: 'medium', medium: 'medium', high: 'high', maximum: 'high' },
    },
  },
  {
    label: 'Claude 3.5 Sonnet',
    config: {
      providerId: 'custom-anthropic',
      modelId: 'claude-3-5-sonnet-*',
      simulatedEfforts: { minimum: 'low', low: 'medium', medium: 'medium', high: 'high', maximum: 'high' },
    },
  },
  {
    label: 'Gemini 2.0 Flash Thinking',
    config: {
      providerId: 'custom-google',
      modelId: 'gemini-2.0-flash-thinking-*',
      simulatedEfforts: { minimum: 'low', low: 'medium', medium: 'medium', high: 'high', maximum: 'high' },
    },
  },
]

export function ThinkingFallbackEditor({ fallbacks, saving, onChange, onSave }: Props) {
  const [editing, setEditing] = useState<ThinkingFallbackPolicy | null>(null)
  const [showPresets, setShowPresets] = useState(false)

  const startEdit = (fallback?: ThinkingFallbackPolicy): void => {
    setEditing(fallback ?? {
      providerId: '',
      modelId: '',
      simulatedEfforts: { minimum: 'low', low: 'medium', medium: 'medium', high: 'high', maximum: 'high' },
    })
  }

  const saveEdit = (): void => {
    if (editing === null || editing.providerId === '' || editing.modelId === '') return
    const next = [...fallbacks.filter(fb => key(fb) !== key(editing)), editing]
    onChange(next)
    setEditing(null)
  }

  const remove = (target: ThinkingFallbackPolicy): void => {
    onChange(fallbacks.filter(fb => key(fb) !== key(target)))
  }

  const addPreset = (preset: ThinkingFallbackPolicy): void => {
    if (fallbacks.some(fb => key(fb) === key(preset))) return
    onChange([...fallbacks, preset])
    setShowPresets(false)
  }

  return (
    <div className={css.editorList}>
      <div className={css.editorHeader}>
        <div>
          <h3>思考强度 Fallback</h3>
          <p>为不支持原生 reasoning 的自定义模型配置思考强度映射。支持通配符（如 <code>o1-*</code>）。</p>
        </div>
        <div className={css.editorActions}>
          <button type="button" onClick={() => setShowPresets(!showPresets)}>
            {showPresets ? '隐藏' : '显示'}预设配置
          </button>
          <button type="button" onClick={() => startEdit()}>添加 Fallback</button>
        </div>
      </div>

      {showPresets && (
        <div className={css.presetPanel}>
          <h4>常用模型预设</h4>
          <div className={css.presetGrid}>
            {COMMON_FALLBACKS.map((preset, index) => (
              <article key={index} className={css.presetCard}>
                <strong>{preset.label}</strong>
                <div className={css.presetDetails}>
                  <code>{preset.config.providerId}</code>
                  <code>{preset.config.modelId}</code>
                </div>
                <button
                  type="button"
                  disabled={fallbacks.some(fb => key(fb) === key(preset.config))}
                  onClick={() => addPreset(preset.config)}
                >
                  {fallbacks.some(fb => key(fb) === key(preset.config)) ? '已添加' : '添加'}
                </button>
              </article>
            ))}
          </div>
        </div>
      )}

      {editing !== null && (
        <div className={css.editPanel}>
          <h4>编辑 Fallback 配置</h4>
          <div className={css.editFields}>
            <label>
              Provider ID
              <input
                value={editing.providerId}
                onChange={e => setEditing({ ...editing, providerId: e.target.value })}
                placeholder="custom-openai"
              />
            </label>
            <label>
              Model ID（支持通配符 *）
              <input
                value={editing.modelId}
                onChange={e => setEditing({ ...editing, modelId: e.target.value })}
                placeholder="o1-* 或 o1-preview"
              />
            </label>
            <fieldset className={css.effortMapping}>
              <legend>Effort 映射</legend>
              {(['minimum', 'low', 'medium', 'high', 'maximum'] as const).map(level => (
                <label key={level}>
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                  <input
                    value={editing.simulatedEfforts[level]}
                    onChange={e =>
                      setEditing({
                        ...editing,
                        simulatedEfforts: { ...editing.simulatedEfforts, [level]: e.target.value },
                      })
                    }
                    placeholder="low, medium, high"
                  />
                </label>
              ))}
            </fieldset>
            <div className={css.editActions}>
              <button type="button" onClick={() => setEditing(null)}>取消</button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={editing.providerId === '' || editing.modelId === ''}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={css.fallbackList}>
        {fallbacks.length === 0 && editing === null && (
          <div className={css.emptyState}>
            <p>尚未配置 Fallback。自定义渠道的模型如果不支持原生 reasoning，可以添加 Fallback 配置来启用思考强度调整。</p>
            <button type="button" onClick={() => startEdit()}>添加第一个 Fallback</button>
          </div>
        )}
        {fallbacks.map(fallback => (
          <article key={key(fallback)} className={css.fallbackCard}>
            <div className={css.cardHeader}>
              <div className={css.cardTitle}>
                <strong>{fallback.providerId}</strong>
                <code>{fallback.modelId}</code>
                {fallback.modelId.includes('*') && <span className={css.badge}>通配符</span>}
              </div>
              <div className={css.cardActions}>
                <button type="button" onClick={() => startEdit(fallback)}>编辑</button>
                <button type="button" onClick={() => remove(fallback)}>删除</button>
              </div>
            </div>
            <div className={css.effortPreview}>
              {Object.entries(fallback.simulatedEfforts).map(([level, effort]) => (
                <div key={level} className={css.effortItem}>
                  <span className={css.effortLevel}>{level}</span>
                  <span className={css.effortArrow}>→</span>
                  <code className={css.effortValue}>{effort}</code>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className={css.editorFooter}>
        <button type="button" disabled={saving} onClick={() => { void onSave() }}>
          {saving ? '保存中...' : '保存 Fallback 配置'}
        </button>
      </div>
    </div>
  )
}
