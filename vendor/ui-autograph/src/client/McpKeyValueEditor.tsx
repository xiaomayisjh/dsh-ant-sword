import type { McpConfig } from './mcp-config-json.ts'
import css from './RuntimeStatus.module.css'

interface Props {
  label: string
  value: Record<string, string>
  onChange: (value: Record<string, string>) => void
}

/** Edit string key/value maps used by MCP environment variables and headers. */
export function McpKeyValueEditor({ label, value, onChange }: Props) {
  const entries = Object.entries(value)
  const update = (index: number, key: string, itemValue: string): void => {
    onChange(Object.fromEntries(entries.map((entry, at) => at === index ? [key, itemValue] : entry)))
  }
  return <fieldset className={css.keyValues}>
    <legend>{label}</legend>
    {entries.map(([key, itemValue], index) => <div key={`${index}-${key}`}>
      <input aria-label={`${label}名称 ${index + 1}`} placeholder="名称" value={key} onChange={(event) =>{  update(index, event.target.value, itemValue) }} />
      <input aria-label={`${label}值 ${index + 1}`} placeholder="值" value={itemValue} onChange={(event) =>{  update(index, key, event.target.value) }} />
      <button type="button" aria-label={`删除${label} ${key || index + 1}`} onClick={() =>{  onChange(Object.fromEntries(entries.filter((_, at) => at !== index))) }}>删除</button>
    </div>)}
    <button type="button" onClick={() =>{  onChange({ ...value, [`KEY_${entries.length + 1}`]: '' }) }}>添加{label}</button>
  </fieldset>
}

/** Update one optional map field without widening MCP configuration types. */
export function withMcpMap(server: McpConfig, field: 'env' | 'headers', value: Record<string, string>): McpConfig {
  return { ...server, [field]: value }
}
