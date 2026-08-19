import { useEffect, useState } from 'react'
import type { ChannelThinkingPolicy, ThinkingLevel } from './runtime-config-types.ts'
import css from './RuntimeStatus.module.css'

interface ModelItem {
  id: string
  name: string
  description?: string
}

interface ProviderItem {
  id: string
  name: string
  models: ModelItem[]
}

interface Capability {
  providerId: string
  modelId: string
  supported: boolean
  efforts: readonly { id: string; name: string; description?: string }[]
  defaultEffort?: string
  fallback?: boolean
}

interface Props {
  policies: ChannelThinkingPolicy[]
  saving: boolean
  onChange(policies: ChannelThinkingPolicy[]): void
  onSave(): Promise<void>
}

const LEVELS: readonly { id: ThinkingLevel; label: string }[] = [
  { id: 'minimum', label: '最低' },
  { id: 'low', label: '低' },
  { id: 'medium', label: '中' },
  { id: 'high', label: '高' },
  { id: 'maximum', label: '最高' },
]

function key(policy: Pick<ChannelThinkingPolicy, 'providerId' | 'modelId'>): string {
  return `${policy.providerId}\0${policy.modelId}`
}

export function ThinkingPolicyEditor({ policies, saving, onChange, onSave }: Props) {
  const [providers, setProviders] = useState<ProviderItem[]>([])
  const [providerId, setProviderId] = useState('')
  const [modelId, setModelId] = useState('')
  const [capability, setCapability] = useState<Capability>()
  const [error, setError] = useState<string>()
  const provider = providers.find(item => item.id === providerId)
  const selected = policies.find(policy => policy.providerId === providerId && policy.modelId === modelId)

  useEffect(() => {
    void fetch('/ant-sword/thinking/catalog', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('模型渠道目录加载失败')
      return response.json() as Promise<{ providers: ProviderItem[] }>
    }).then(result => {
      setProviders(result.providers)
      const first = result.providers[0]
      if (first !== undefined) {
        setProviderId(first.id)
        setModelId(first.models[0]?.id ?? '')
      }
    }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [])

  useEffect(() => {
    if (providerId === '' || modelId === '') {
      setCapability(undefined)
      return
    }
    const controller = new AbortController()
    setError(undefined)
    void fetch(`/ant-sword/thinking/capability?provider=${encodeURIComponent(providerId)}&model=${encodeURIComponent(modelId)}`, {
      cache: 'no-store',
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) {
        const body = await response.json() as { message?: string; error?: string }
        throw new Error(body.message ?? body.error ?? '模型能力查询失败')
      }
      return response.json() as Promise<Capability>
    }).then(setCapability).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => controller.abort()
  }, [modelId, providerId])

  const chooseProvider = (nextProviderId: string): void => {
    const next = providers.find(item => item.id === nextProviderId)
    setProviderId(nextProviderId)
    setModelId(next?.models[0]?.id ?? '')
  }

  const setLevel = (level: ThinkingLevel): void => {
    const next: ChannelThinkingPolicy = { providerId, modelId, level }
    onChange([...policies.filter(policy => key(policy) !== key(next)), next])
  }

  const remove = (target: ChannelThinkingPolicy): void => {
    onChange(policies.filter(policy => key(policy) !== key(target)))
  }

  return <div className={css.editorList}>
    <h3>渠道思考强度</h3>
    <p>统一五档会按模型实际暴露的 effort 顺序单调映射；不支持 reasoning 的模型不会注入参数。</p>
    <div className={css.grid}>
      {providers.map(item => <article key={item.id} className={css.card}>
        <div className={css.cardTitle}><strong>{item.name}</strong><span>{item.id}</span></div>
        <small>{item.models.length} 个已发现模型 · {policies.filter(policy => policy.providerId === item.id).length} 条策略</small>
      </article>)}
    </div>
    <fieldset>
      <legend>模型策略</legend>
      <label>渠道<select value={providerId} onChange={event => chooseProvider(event.target.value)}>
        <option value="">选择渠道</option>
        {providers.map(item => <option key={item.id} value={item.id}>{item.name} ({item.id})</option>)}
      </select></label>
      <label>模型<select value={provider?.models.some(item => item.id === modelId) === true ? modelId : ''} onChange={event => setModelId(event.target.value)}>
        <option value="">自定义模型 ID</option>
        {provider?.models.map(item => <option key={item.id} value={item.id}>{item.name} ({item.id})</option>)}
      </select></label>
      <label>自定义模型 ID<input value={modelId} onChange={event => setModelId(event.target.value.trim())} placeholder="provider-owned model id" /></label>
      <div className={css.editorActions} aria-label="五档思考强度">
        {LEVELS.map(level => <button
          type="button"
          key={level.id}
          disabled={capability?.supported !== true}
          aria-pressed={selected?.level === level.id}
          onClick={() => setLevel(level.id)}
        >{level.label}</button>)}
      </div>
      {capability !== undefined && <small>
        {capability.supported
          ? <>
              <span
                className={css.capabilityStatus}
                data-supported="true"
                data-fallback={capability.fallback === true ? 'true' : 'false'}
              >
                {capability.fallback === true ? '使用 Fallback 配置' : '原生支持'}
              </span>
              {' '}
              模型支持 {capability.efforts.length} 档：{capability.efforts.map(effort => effort.name).join(' / ')}
            </>
          : <span className={css.capabilityStatus} data-supported="false">
              该模型不支持 reasoning effort，请在 Fallback 标签页添加配置
            </span>}
      </small>}
      {error !== undefined && <span className={css.installError}>{error}</span>}
    </fieldset>
    {policies.map(policy => <article key={key(policy)} className={css.card}>
      <div className={css.cardTitle}>
        <strong>{policy.providerId} / {policy.modelId}</strong>
        <span>{LEVELS.find(level => level.id === policy.level)?.label}</span>
      </div>
      <button type="button" onClick={() => remove(policy)}>删除策略</button>
    </article>)}
    <div className={css.editorActions}>
      <button type="button" disabled={saving} onClick={() => { void onSave() }}>保存思考策略</button>
    </div>
  </div>
}