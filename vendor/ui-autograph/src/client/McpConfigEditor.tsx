import { useEffect, useMemo, useState } from 'react'
import type { McpConfig } from './mcp-config-json.ts'
import { formatMcpJson, parseMcpJson } from './mcp-config-json.ts'
import {
  copyMcpServer, createMcpServer, mcpServersEqual, switchMcpTransport, validateMcpServers,
} from './mcp-editor-state.ts'
import { McpKeyValueEditor, withMcpMap } from './McpKeyValueEditor.tsx'
import css from './RuntimeStatus.module.css'

interface ProbeView {
  toolCount: number
  tools: readonly { name: string; description?: string }[]
}

interface OperationState {
  action: 'probe' | 'reload'
  status: 'pending' | 'success' | 'error'
  message: string
}

interface Props {
  servers: readonly McpConfig[]
  savedServers: readonly McpConfig[]
  saving: boolean
  onChange: (servers: McpConfig[]) => void
  onSave: () => Promise<void>
}

function replaceServer(servers: readonly McpConfig[], index: number, value: McpConfig): McpConfig[] {
  return servers.map((server, at) => at === index ? value : server)
}

/** Rich master-detail MCP editor with safe JSON import and runtime actions. */
export function McpConfigEditor({ servers, savedServers, saving, onChange, onSave }: Props) {
  const [mode, setMode] = useState<'visual' | 'json'>('visual')
  const [selectedIndex, setSelectedIndex] = useState(servers.length === 0 ? -1 : 0)
  const [jsonDraft, setJsonDraft] = useState(() => formatMcpJson(servers))
  const [message, setMessage] = useState<string>()
  const [probes, setProbes] = useState<Record<string, ProbeView>>({})
  const [operations, setOperations] = useState<Record<string, OperationState>>({})
  const dirty = !mcpServersEqual(servers, savedServers)
  const issues = useMemo(() => validateMcpServers(servers), [servers])
  const selected = selectedIndex >= 0 ? servers[selectedIndex] : undefined

  useEffect(() => {
    if (servers.length > 0 && selectedIndex < 0) setSelectedIndex(0)
    else if (selectedIndex >= servers.length) setSelectedIndex(servers.length - 1)
  }, [selectedIndex, servers.length])

  const update = (index: number, value: McpConfig): void => {
    const next = replaceServer(servers, index, value)
    onChange(next)
    setJsonDraft(formatMcpJson(next))
  }

  const add = (): void => {
    const next = [...servers, createMcpServer(servers)]
    onChange(next)
    setJsonDraft(formatMcpJson(next))
    setSelectedIndex(next.length - 1)
  }

  const copy = (): void => {
    if (selected === undefined) return
    const next = [...servers, copyMcpServer(selected, servers)]
    onChange(next)
    setJsonDraft(formatMcpJson(next))
    setSelectedIndex(next.length - 1)
  }

  const remove = (): void => {
    if (selected === undefined) return
    const next = servers.filter((_, index) => index !== selectedIndex)
    onChange(next)
    setJsonDraft(formatMcpJson(next))
    setSelectedIndex(Math.min(selectedIndex, next.length - 1))
  }

  const importJson = (): void => {
    try {
      const next = parseMcpJson(jsonDraft)
      onChange(next)
      setSelectedIndex(next.length === 0 ? -1 : 0)
      setJsonDraft(formatMcpJson(next))
      setMessage(`已应用 ${next.length} 个 MCP 到可视化草稿；保存后写入运行时。`)
      setMode('visual')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const reset = (): void => {
    const next = structuredClone(savedServers) as McpConfig[]
    onChange(next)
    setJsonDraft(formatMcpJson(next))
    setSelectedIndex(next.length === 0 ? -1 : 0)
    setMessage('已重置为上次保存的 MCP 配置。')
  }

  const save = async (): Promise<void> => {
    if (issues.length > 0) {
      setMessage(`保存前请修正：${issues[0]?.message ?? '配置无效'}`)
      return
    }
    await onSave()
    setMessage('MCP 配置已保存并热应用。')
  }

  const runtimeAction = async (action: 'probe' | 'reload'): Promise<void> => {
    if (selected === undefined) return
    const name = selected.serverName
    setOperations(current => ({ ...current, [name]: { action, status: 'pending', message: action === 'probe' ? '正在测活…' : '正在重载…' } }))
    try {
      const response = await fetch(`/ant-sword/mcp/${action}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serverName: name }),
      })
      const result = await response.json() as { ok: boolean; error?: string; toolCount?: number; tools?: ProbeView['tools'] }
      if (!response.ok || !result.ok) throw new Error(result.error ?? `${action} 请求失败（${response.status}）`)
      if (action === 'probe') setProbes(current => ({ ...current, [name]: { toolCount: result.toolCount ?? 0, tools: result.tools ?? [] } }))
      setOperations(current => ({ ...current, [name]: { action, status: 'success', message: action === 'probe' ? `测活成功，发现 ${result.toolCount ?? 0} 个工具。` : '热重载成功。' } }))
    } catch (error) {
      setOperations(current => ({ ...current, [name]: { action, status: 'error', message: error instanceof Error ? error.message : String(error) } }))
    }
  }

  return <section className={css.mcpEditor} aria-labelledby="mcp-editor-title">
    <header className={css.mcpHeader}>
      <div><h3 id="mcp-editor-title">MCP 服务器</h3><p>配置本地 stdio 或远程 HTTP MCP 服务。</p></div>
      <div className={css.modeSwitch} role="group" aria-label="MCP 编辑模式">
        <button type="button" aria-pressed={mode === 'visual'} onClick={() =>{  setMode('visual') }}>可视化</button>
        <button type="button" aria-pressed={mode === 'json'} onClick={() => { setJsonDraft(formatMcpJson(servers)); setMode('json') }}>JSON</button>
      </div>
    </header>

    {mode === 'json' ? <div className={css.jsonEditor}>
      <label htmlFor="mcp-json-source">MCP JSON</label>
      <textarea id="mcp-json-source" spellCheck={false} value={jsonDraft} onChange={(event) =>{  setJsonDraft(event.target.value) }} aria-describedby="mcp-json-help" />
      <p id="mcp-json-help">支持直接粘贴 mcpServers 命名对象、mcpServers 数组或服务器数组。解析失败不会覆盖当前可视化草稿。</p>
      <div className={css.editorActions}><button type="button" onClick={importJson}>应用到可视化</button></div>
    </div> : <div className={css.masterDetail}>
      <aside className={css.serverRail} aria-label="MCP 服务器列表">
        <div className={css.serverRailHeader}><strong>服务器</strong><button type="button" onClick={add}>添加</button></div>
        <div role="listbox" aria-label="MCP 服务器" aria-activedescendant={selected === undefined ? undefined : `mcp-server-${selectedIndex}`}>
          {servers.map((server, index) => <button
            id={`mcp-server-${index}`} type="button" role="option" aria-selected={index === selectedIndex}
            key={`${index}-${server.serverName}`} onClick={() =>{  setSelectedIndex(index) }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
              event.preventDefault()
              const step = event.key === 'ArrowDown' ? 1 : -1
              setSelectedIndex((index + step + servers.length) % servers.length)
            }}
          ><span>{server.serverName || '未命名服务器'}</span><small>{server.enabled === false ? '已停用' : server.transport}</small></button>)}
        </div>
        {servers.length === 0 && <p>尚未配置服务器。</p>}
      </aside>

      <div className={css.serverDetail}>
        {selected === undefined ? <div className={css.emptyDetail}><p>添加服务器后在此编辑详情。</p><button type="button" onClick={add}>添加 MCP 服务器</button></div> : <>
          <div className={css.detailToolbar}>
            <label className={css.enableToggle}><input type="checkbox" checked={selected.enabled !== false} onChange={(event) =>{  update(selectedIndex, { ...selected, enabled: event.target.checked }) }} />启用</label>
            <button type="button" onClick={copy}>复制</button><button type="button" onClick={remove}>删除</button>
          </div>
          <div className={css.detailFields}>
            <label>名称
              <input value={selected.serverName} onChange={(event) => {
                update(selectedIndex, { ...selected, serverName: event.target.value })
              }} />
            </label>
            <label>传输
              <select value={selected.transport} onChange={(event) => {
                update(selectedIndex, switchMcpTransport(selected, event.target.value as McpConfig['transport']))
              }}>
                <option value="stdio">stdio</option><option value="sse">HTTP + SSE（旧版）</option>
                <option value="streamable-http">Streamable HTTP</option>
              </select>
            </label>
            {selected.transport === 'stdio' ? <>
              <label>命令<input value={selected.command ?? ''} onChange={(event) =>{  update(selectedIndex, { ...selected, command: event.target.value }) }} /></label>
              <label>参数（每行一项）<textarea value={(selected.args ?? []).join('\n')} onChange={(event) =>{  update(selectedIndex, { ...selected, args: event.target.value.split('\n').map(value => value.trim()).filter(Boolean) }) }} /></label>
              <label>工作目录<input value={selected.cwd ?? ''} onChange={(event) =>{  update(selectedIndex, { ...selected, cwd: event.target.value }) }} /></label>
              <McpKeyValueEditor label="环境变量" value={selected.env ?? {}} onChange={(value) =>{  update(selectedIndex, withMcpMap(selected, 'env', value)) }} />
            </> : <>
              <label>URL<input type="url" value={selected.url ?? ''} onChange={(event) =>{  update(selectedIndex, { ...selected, url: event.target.value }) }} /></label>
              <McpKeyValueEditor label="请求头" value={selected.headers ?? {}} onChange={(value) =>{  update(selectedIndex, withMcpMap(selected, 'headers', value)) }} />
            </>}
            <label>工具超时（毫秒）<input type="number" min={1} value={selected.toolCallTimeoutMs ?? 60_000} onChange={(event) =>{  update(selectedIndex, { ...selected, toolCallTimeoutMs: Number(event.target.value) }) }} /></label>
          </div>
          <div className={css.runtimeActions}>
            <button type="button" disabled={!selected.serverName || operations[selected.serverName]?.status === 'pending'} onClick={() => { void runtimeAction('probe') }}>测活</button>
            <button type="button" disabled={!selected.serverName || operations[selected.serverName]?.status === 'pending'} onClick={() => { void runtimeAction('reload') }}>热重载</button>
            {operations[selected.serverName] !== undefined && <span role="status" data-state={operations[selected.serverName]?.status}>{operations[selected.serverName]?.message}</span>}
          </div>
          {probes[selected.serverName] !== undefined && <details>
            <summary>已发现 {probes[selected.serverName]?.toolCount} 个工具</summary>
            <ul>{probes[selected.serverName]?.tools.map(tool => <li key={tool.name}>
              <code>{tool.name}</code>{tool.description === undefined ? null : <small>{tool.description}</small>}
            </li>)}</ul>
          </details>}
        </>}
      </div>
    </div>}

    {issues.length > 0 && <ul className={css.validation} aria-label="MCP 配置问题">{issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
    {message !== undefined && <p className={css.editorMessage} role="status">{message}</p>}
    <footer className={css.saveBar}><span>{dirty ? '有未保存更改' : '所有更改已保存'}</span><button type="button" disabled={!dirty || saving} onClick={reset}>重置</button><button type="button" disabled={!dirty || saving || issues.length > 0} onClick={() => { void save() }}>{saving ? '保存中…' : '保存 MCP'}</button></footer>
  </section>
}
