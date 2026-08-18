import { useEffect, useMemo, useState } from 'react'
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

interface Props {
  scopeList: readonly SkillEntry[]
  onChange(items: readonly SkillEntry[]): void
  onSave(): Promise<void>
}

export function SkillEditor({ scopeList, onChange: _onChange, onSave }: Props) {
  const [list, setList] = useState<SkillEntry[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  const selected = list.find(item => item.id === selectedId)
  const filtered = useMemo(() => list.toSorted((a, b) => a.name.localeCompare(b.name)), [list])

  useEffect(() => {
    setList(scopeList.map(item => ({ ...item })))
  }, [scopeList])

  const newSkill = (): void => {
    const id = `skill-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const next: SkillEntry = {
      id, name: '', description: '', whenToUse: '', modelInvocable: true, userInvocable: true, content: '', userOwned: false,
    }
    setList(current => [...current, next])
    setSelectedId(id)
  }

  const updateSelected = <K extends keyof SkillEntry>(field: K, value: SkillEntry[K]): void => {
    setList(current => current.map(item => item.id === selectedId ? { ...item, [field]: value } : item))
  }

  const remove = (): void => {
    if (!selected) return
    const result = list.filter(item => item.id !== selectedId)
    setList(result)
    const first = result[0]
    if (first !== undefined) setSelectedId(first.id)
    else setSelectedId('')
  }

  const saveOverlay = async (): Promise<void> => {
    if (!selected || !selected.name.trim()) return
    setSaving(true)
    try {
      setError(undefined)
      await fetch('/ant-sword/skills/upsert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: selected.name.trim(),
          description: selected.description ?? '',
          whenToUse: selected.whenToUse,
          modelInvocable: selected.modelInvocable,
          userInvocable: selected.userInvocable,
          content: selected.content,
        }),
      }).then(async response => {
        const text = await response.text()
        try {
          const json = JSON.parse(text)
          if (!response.ok) throw new Error(json.error ?? '保存失败')
        } catch {
          if (!response.ok) throw new Error(response.statusText)
        }
        await onSave()
      })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const deleteOverlay = async (): Promise<void> => {
    if (!selected) return
    setSaving(true)
    try {
      setError(undefined)
      const response = await fetch('/ant-sword/skills/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: selected.name }),
      })
      const json = await response.json() as { error?: string }
      if (!response.ok) throw new Error(json.error ?? '删除失败')
      await onSave()
      remove()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={css.editorList}>
      <h3>Skill 列表</h3>
      <div className={css.masterDetail}>
        <aside className={css.serverRail} role="listbox" aria-label="Skill 列表">
          {filtered.map(item => (
            <button
              key={item.id}
              role="option"
              aria-selected={item.id === selectedId}
              onClick={() => setSelectedId(item.id)}
            >
              <strong>{item.name}</strong>
              <small>{item.userOwned ? '用户' : '内置'} · {item.description?.slice(0, 50)}</small>
            </button>
          ))}
          <button type="button" onClick={newSkill}>+ 新增</button>
        </aside>
        <main className={css.serverDetail}>
          {selected ? (
            <>
              <div className={css.detailFields}>
                <label>名称
                  <input
                    placeholder="name"
                    value={selected.name}
                    onChange={e => updateSelected('name', e.target.value)}
                  />
                </label>
                <label>描述
                  <input
                    placeholder="description"
                    value={selected.description}
                    onChange={e => updateSelected('description', e.target.value)}
                  />
                </label>
                <label>使用时机
                  <input
                    placeholder="whenToUse"
                    value={selected.whenToUse}
                    onChange={e => updateSelected('whenToUse', e.target.value)}
                  />
                </label>
                <label>模型可调用
                  <input
                    type="checkbox"
                    checked={selected.modelInvocable}
                    onChange={e => updateSelected('modelInvocable', e.target.checked)}
                  />
                </label>
                <label>用户可调用
                  <input
                    type="checkbox"
                    checked={selected.userInvocable}
                    onChange={e => updateSelected('userInvocable', e.target.checked)}
                  />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>正文
                  <textarea
                    value={selected.content}
                    onChange={e => updateSelected('content', e.target.value)}
                  />
                </label>
              </div>
              <div className={css.saveBar}>
                <span>{selected.userOwned ? '用户覆盖' : '只读（内置）'}</span>
                {selected.userOwned && (
                  <>
                    <button type="button" disabled={saving} onClick={saveOverlay}>保存</button>
                    <button type="button" disabled={saving} onClick={deleteOverlay}>删除</button>
                  </>
                )}
              </div>
              {error && <span className={css.installError}>{error}</span>}
            </>
          ) : (
            <p className={css.editorMessage}>选择或新建一个 Skill</p>
          )}
        </main>
      </div>
    </section>
  )
}