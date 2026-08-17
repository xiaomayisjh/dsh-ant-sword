import { useEffect, useState, useSyncExternalStore } from 'react'
import type { SnapshotStore, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { RuntimeConfigEditor, type RuntimeConfigValue } from './RuntimeConfigEditor.tsx'
import css from './RuntimeStatus.module.css'

export type RuntimeAvailability = 'available' | 'missing' | 'configured' | 'disabled'

export interface McpRuntimeStatus {
  readonly serverName: string
  readonly transport: 'stdio' | 'sse' | 'streamable-http'
  readonly availability: RuntimeAvailability
  readonly target: string
  readonly installCommand?: string
  readonly installHint: string
  readonly mounted: boolean
  readonly lastProbe?: {
    readonly checkedAt: number
    readonly toolCount: number
    readonly tools: readonly { readonly name: string; readonly description?: string }[]
  }
}

export interface RedTeamRuntimeStatus {
  readonly checkedAt: number
  readonly skills: {
    readonly available: number
    readonly provider: string
    readonly state: 'ready' | 'error'
    readonly error?: string
  }
  readonly mcp: readonly McpRuntimeStatus[]
}

export interface RuntimeStatusProps {
  readonly runtimeStatus: SnapshotStore<RedTeamRuntimeStatus>
  readonly configScope?: SettingsScope<RuntimeConfigValue>
  readonly compact?: boolean
}

const STATE_LABEL: Record<RuntimeAvailability, string> = {
  available: '可用',
  configured: '已配置',
  missing: '未安装',
  disabled: '已停用',
}

export const INITIAL_RUNTIME_STATUS: RedTeamRuntimeStatus = {
  checkedAt: 0,
  skills: { available: 0, provider: 'ant-sword-skills', state: 'ready' },
  mcp: [
    ['kali', 'stdio', 'kali-server-mcp', 'pip install kali-server-mcp', '安装 kali-server-mcp，并确保命令已加入 PATH。'],
    ['metasploit', 'stdio', 'metasploitmcp', 'pip install metasploit-mcp', '安装 Metasploit MCP bridge，并先完成 Metasploit 初始化。'],
    ['hexstrike', 'stdio', 'hexstrike-ai', 'pip install hexstrike-ai', '安装 HexStrike AI MCP 服务并将命令加入 PATH。'],
    ['pentestswarm', 'stdio', 'pentestswarm', 'pip install pentestswarm', '安装 PentestSwarm，并配置编排器 API key。'],
    ['jshook', 'stdio', 'npx', 'npm install -g @jshookmcp/jshook', '需要 Node.js；也可保留 npx 按需下载模式。'],
    ['anything', 'streamable-http', 'http://localhost:23816/mcp', undefined, '启动 AnythingLLM MCP 服务。'],
    ['idapro', 'streamable-http', 'http://127.0.0.1:13337/mcp', undefined, '在 IDA Pro 中启动 MCP 插件。'],
    ['ghidra', 'streamable-http', 'http://localhost:8765/mcp', undefined, '在 Ghidra 中启动 MCP 插件。'],
  ].map(([serverName, transport, target, installCommand, installHint]) => ({
    serverName: serverName as string,
    transport: transport as 'stdio' | 'streamable-http',
    availability: 'missing' as const,
    mounted: false,
    target: target as string,
    ...(installCommand === undefined ? {} : { installCommand }),
    installHint: installHint as string,
  })),
}

const MCP_COMPONENT: Readonly<Record<string, string>> = {
  jshook: 'jshookmcp',
  idapro: 'idalib-mcp',
  ghidra: 'ghidra-mcp',
}

type SourcePolicy = 'auto' | 'domestic-first' | 'official-first'

interface InstallComponentView {
  id: string
  label: string
  supported: boolean
}

interface InstallOperationView {
  id: string
  componentId: string
  sourcePolicy: SourcePolicy
  phase: string
  progress: number
  logs: readonly string[]
  error?: string
}

interface InstallView {
  components: readonly InstallComponentView[]
  operations: readonly InstallOperationView[]
}

const EMPTY_INSTALL_VIEW: InstallView = { components: [], operations: [] }

async function requestInstall(path: string, body: object): Promise<void> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const result = await response.json() as { error?: string }
    throw new Error(result.error ?? `install request failed: ${String(response.status)}`)
  }
}

export function RuntimeStatus({ runtimeStatus, configScope, compact = false }: RuntimeStatusProps) {
  const snapshot = useSyncExternalStore(
    onStoreChange => runtimeStatus.subscribe(onStoreChange),
    () => runtimeStatus.getSnapshot(),
  )
  const [installView, setInstallView] = useState<InstallView>(EMPTY_INSTALL_VIEW)
  const [sourcePolicy, setSourcePolicy] = useState<SourcePolicy>('auto')
  const [installError, setInstallError] = useState<string>()
  const available = snapshot.mcp.filter(item => item.availability === 'available' || item.availability === 'configured').length
  const missing = snapshot.mcp.filter(item => item.availability === 'missing').length

  useEffect(() => {
    if (compact) return
    let disposed = false
    const refresh = async (): Promise<void> => {
      try {
        const [catalogResponse, statusResponse] = await Promise.all([
          fetch('/ant-sword/install/catalog', { cache: 'no-store' }),
          fetch('/ant-sword/install/status', { cache: 'no-store' }),
        ])
        if (!catalogResponse.ok || !statusResponse.ok) throw new Error('安装状态请求失败')
        const catalog = await catalogResponse.json() as { components: readonly InstallComponentView[] }
        const status = await statusResponse.json() as { operations: readonly InstallOperationView[] }
        if (!disposed) setInstallView({ components: catalog.components, operations: status.operations })
      } catch (error) {
        if (!disposed) setInstallError(error instanceof Error ? error.message : String(error))
      }
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, 1_000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [compact])

  const startInstall = async (componentId: string): Promise<void> => {
    setInstallError(undefined)
    try {
      await requestInstall('/ant-sword/install/start', { componentId, sourcePolicy })
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : String(error))
    }
  }

  const cancelInstall = async (operationId: string): Promise<void> => {
    setInstallError(undefined)
    try {
      await requestInstall('/ant-sword/install/cancel', { operationId })
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : String(error))
    }
  }

  if (compact) {
    return (
      <div className={css.rail} data-runtime-status>
        <span className={css.metric}>Skills <strong>{snapshot.skills.available}</strong></span>
        <span className={css.metric}>MCP <strong>{available}/{snapshot.mcp.length}</strong></span>
        {missing > 0 && <span className={css.warning}>{missing} 项待安装</span>}
      </div>
    )
  }

  return (
    <section className={css.settings} data-runtime-settings>
      <header className={css.settingsHeader}>
        <div>
          <h2>Red Team 运行环境</h2>
          <p>Skill 与 MCP 使用同一实时状态源；缺失组件不会从配置中消失。</p>
        </div>
        <div className={css.summary}>
          <span>Skills {snapshot.skills.available}</span>
          <span>MCP {available}/{snapshot.mcp.length}</span>
        </div>
      </header>
      <div className={css.installToolbar}>
        <label>
          下载源
          <select value={sourcePolicy} onChange={(event) => { setSourcePolicy(event.target.value as SourcePolicy) }}>
            <option value="auto">自动</option>
            <option value="domestic-first">国内优先</option>
            <option value="official-first">官方优先</option>
          </select>
        </label>
        {installError !== undefined && <span className={css.installError}>{installError}</span>}
      </div>
      <div className={css.skillCard} data-state={snapshot.skills.state}>
        <strong>Skills</strong>
        <span>{snapshot.skills.state === 'ready' ? `${snapshot.skills.available} 个已发现` : '加载异常'}</span>
        <small>{snapshot.skills.error ?? `Provider: ${snapshot.skills.provider}`}</small>
      </div>
      <div className={css.grid}>
        {snapshot.mcp.map(server => (
          <article key={server.serverName} className={css.card} data-state={server.availability}>
            <div className={css.cardTitle}>
              <strong>{server.serverName}</strong>
              <span>{STATE_LABEL[server.availability]} · {server.mounted ? '已挂载' : '未挂载'}</span>
            </div>
            <code>{server.target}</code>
            <p>{server.installHint}</p>
            {server.lastProbe !== undefined && <details>
              <summary>最近测活：{server.lastProbe.toolCount} 个工具</summary>
              <ul>
                {server.lastProbe.tools.map(tool => <li key={tool.name}>
                  <code>{`mcp__${server.serverName}__${tool.name}`}</code>
                  {tool.description !== undefined && <small>{tool.description}</small>}
                </li>)}
              </ul>
            </details>}
            {server.installCommand !== undefined && <pre>{server.installCommand}</pre>}
            {(() => {
              const componentId = MCP_COMPONENT[server.serverName]
              if (componentId === undefined) return null
              const component = installView.components.find(item => item.id === componentId)
              const operation = [...installView.operations].reverse().find(item => item.componentId === componentId)
              const active = operation !== undefined && !['succeeded', 'failed', 'cancelled', 'external-action-required', 'restart-required'].includes(operation.phase)
              return (
                <div className={css.installActions}>
                  <button type="button" disabled={component?.supported !== true || active} onClick={() => { void startInstall(componentId) }}>
                    {operation?.phase === 'failed' ? '重试' : '一键补全'}
                  </button>
                  {active && <button type="button" onClick={() => { void cancelInstall(operation.id) }}>取消</button>}
                  {operation !== undefined && (
                    <div className={css.installProgress}>
                      <span>{operation.phase} · {Math.round(operation.progress * 100)}%</span>
                      <progress value={operation.progress} max={1} />
                      <small>{operation.error ?? operation.logs.at(-1)}</small>
                    </div>
                  )}
                </div>
              )
            })()}
          </article>
        ))}
      </div>
      {configScope !== undefined && <RuntimeConfigEditor configScope={configScope} />}
    </section>
  )
}
