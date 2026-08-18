import { useEffect, useState } from 'react'
import type { RuntimeRuleConfig as RuleConfig } from './runtime-config-types.ts'
import css from './RuntimeStatus.module.css'

interface Props {
  rules: readonly RuleConfig[]
  saving: boolean
  onChange(rules: readonly RuleConfig[]): void
  onSave(): Promise<void>
}

const PLACEMENTS = ['before-persona', 'after-persona', 'before-tools', 'after-tools'] as const

export function RuleEditor({ rules, saving, onChange, onSave }: Props) {
  const [selectedId, setSelectedId] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const sorted = rules.toSorted((a, b) => a.placement.localeCompare(b.placement) || a.order - b.order || a.id.localeCompare(b.id))
  const selected = sorted.find(item => item.id === selectedId)

  useEffect(() => {
    if (selectedId === '' && sorted.length > 0 && sorted[0] !== undefined) setSelectedId(sorted[0].id)
  }, [selectedId, sorted])

  const create = (): void => {
    const id = `rule-${crypto.randomUUID()}`
    const next: RuleConfig = { id, title: '新规则', enabled: true, order: 0, placement: 'after-persona', content: '' }
    onChange([...rules, next])
    setSelectedId(id)
  }

  const duplicate = (): void => {
    if (!selected) return
    const id = `rule-${crypto.randomUUID()}`
    onChange([...rules, { ...selected, id, title: `${selected.title} 副本` }])
    setSelectedId(id)
  }

  const remove = (): void => {
    if (!selected) return
    onChange(rules.filter(item => item.id !== selectedId))
    setSelectedId('')
  }

  const patch = (patch: Partial<RuleConfig>): void => {
    onChange(rules.map(item => item.id === selectedId ? { ...item, ...patch } : item))
  }

  const move = (delta: number): void => {
    if (!selected) return
    patch({ order: selected.order + delta })
  }

  return (
    <section className={css.editorList}>
      <h3>Rule 列表</h3>
      <div className={css.masterDetail}>
        <aside className={css.serverRail} role="listbox" aria-label="Rule 列表">
          {sorted.map(item => (
            <button key={item.id} role="option" aria-selected={item.id === selectedId} onClick={() => setSelectedId(item.id)}>
              <strong>{item.title}</strong>
              <small>{item.placement} · order {item.order} · {item.enabled ? '启用' : '停用'}</small>
            </button>
          ))}
          <button type="button" onClick={create}>+ 新增</button>
        </aside>
        <main className={css.serverDetail}>
          {selected ? (
            <>
              <div className={css.detailFields}>
                <label>标题<input value={selected.title} onChange={e => patch({ title: e.target.value })} /></label>
                <label>启用
                  <input type="checkbox" checked={selected.enabled} onChange={e => patch({ enabled: e.target.checked })} />
                </label>
                <label>位置
                  <select value={selected.placement} onChange={e => patch({ placement: e.target.value as RuleConfig['placement'] })}>
                    {PLACEMENTS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label>顺序
                  <input
                    type="number"
                    value={selected.order}
                    onChange={e => patch({ order: Number(e.target.value) })}
                  />
                </label>
                <button type="button" onClick={() => move(1)}>order +1</button>
                <button type="button" onClick={() => move(-1)}>order -1</button>
                <label style={{ gridColumn: '1 / -1' }}>正文
                  <textarea value={selected.content} onChange={e => patch({ content: e.target.value })} />
                </label>
              </div>
              <div className={css.saveBar}>
                <span>{selected.id}</span>
                <button type="button" onClick={duplicate}>复制</button>
                <button type="button" onClick={() => setConfirmDelete(true)}>删除</button>
                <button type="button" disabled={saving} onClick={() => { void onSave() }}>保存</button>
              </div>
              {confirmDelete && (
                <div role="alertdialog">
                  <p>确认删除规则 “{selected.title}”？</p>
            <button type="button" onClick={() => { remove(); setConfirmDelete(false) }}>确认</button>
                  <button type="button" onClick={() => setConfirmDelete(false)}>取消</button>
                </div>
              )}
            </>
          ) : (
            <p className={css.editorMessage}>选择或新建一条规则</p>
          )}
        </main>
      </div>
    </section>
  )
}