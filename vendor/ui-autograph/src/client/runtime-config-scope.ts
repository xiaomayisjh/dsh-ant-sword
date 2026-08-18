/** Official settings bridge with a loopback HTTP fallback for private namespaces. */

import {
  createSnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {
  SettingsScope, SettingsScopeSnapshot, SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { RuntimeConfigValue } from './runtime-config-types.ts'

const ENDPOINT = '/ant-sword/runtime-config'

interface RuntimeApplyFailure {
  reconciler: string
  message: string
  generation: number
}

export interface RuntimeApplySnapshot {
  desired?: RuntimeConfigValue
  applied?: RuntimeConfigValue
  generation: number
  desiredGeneration: number
  applying: boolean
  inSync: boolean
  lastFailure?: RuntimeApplyFailure
}

interface RuntimeConfigApiView {
  value: RuntimeConfigValue
  desired: RuntimeConfigValue
  applied: RuntimeConfigValue
  base?: Partial<RuntimeConfigValue>
  user?: Partial<RuntimeConfigValue>
  revision: number
  writable: boolean
  generation: number
  desiredGeneration: number
  applying: boolean
  inSync: boolean
  lastFailure?: RuntimeApplyFailure
}

interface FetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export type RuntimeConfigFetch = (input: string, init?: RequestInit) => Promise<FetchResponse>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRuntimeConfig(value: unknown): value is RuntimeConfigValue {
  return isRecord(value)
    && Array.isArray(value.mcpServers)
    && Array.isArray(value.disabledSkills)
    && Array.isArray(value.rules)
    && Array.isArray(value.thinkingPolicies)
}

function decodeFailure(value: unknown): RuntimeApplyFailure | undefined {
  if (!isRecord(value) || typeof value.reconciler !== 'string' || typeof value.message !== 'string') return undefined
  if (!Number.isSafeInteger(value.generation) || (value.generation as number) < 0) return undefined
  return { reconciler: value.reconciler, message: value.message, generation: value.generation as number }
}

function decodeView(value: unknown): RuntimeConfigApiView | undefined {
  if (!isRecord(value) || !isRuntimeConfig(value.value)) return undefined
  if (!isRuntimeConfig(value.desired) || !isRuntimeConfig(value.applied)) return undefined
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) return undefined
  if (!Number.isSafeInteger(value.generation) || (value.generation as number) < 0) return undefined
  if (!Number.isSafeInteger(value.desiredGeneration) || (value.desiredGeneration as number) < 0) return undefined
  if (typeof value.writable !== 'boolean' || typeof value.applying !== 'boolean' || typeof value.inSync !== 'boolean') return undefined
  const lastFailure = decodeFailure(value.lastFailure)
  return {
    value: value.value,
    desired: value.desired,
    applied: value.applied,
    ...(isRecord(value.base) ? { base: value.base } : {}),
    ...(isRecord(value.user) ? { user: value.user } : {}),
    revision: value.revision as number,
    writable: value.writable,
    generation: value.generation as number,
    desiredGeneration: value.desiredGeneration as number,
    applying: value.applying,
    inSync: value.inSync,
    ...(lastFailure === undefined ? {} : { lastFailure }),
  }
}

function initialSnapshot(): SettingsScopeSnapshot<RuntimeConfigValue> {
  return {
    status: 'loading',
    value: undefined,
    base: undefined,
    user: undefined,
    revision: undefined,
    writable: false,
    mode: 'host',
  }
}

/**
 * Mirrors the official settings scope while available and otherwise speaks to
 * the owning plugin's loopback endpoint. Writes remain serialized and carry
 * the latest revision, matching the official scope's conflict behavior.
 */
export class RuntimeConfigScope implements SettingsScope<RuntimeConfigValue> {
  private readonly store: SnapshotStore<SettingsScopeSnapshot<RuntimeConfigValue>>
  private readonly runtimeStore = createSnapshotStore<RuntimeApplySnapshot>({
    generation: 0,
    desiredGeneration: 0,
    applying: false,
    inSync: true,
  })
  private readonly unsubscribeNative: () => void
  private tail: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(
    private readonly native: SettingsScope<RuntimeConfigValue>,
    private readonly request: RuntimeConfigFetch = globalThis.fetch.bind(globalThis),
  ) {
    this.store = createSnapshotStore(initialSnapshot())
    this.unsubscribeNative = native.subscribe(() => { this.syncNative() })
    this.syncNative()
    void this.refresh()
  }

  getSnapshot(): SettingsScopeSnapshot<RuntimeConfigValue> {
    return this.store.getSnapshot()
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener)
  }

  getRuntimeSnapshot(): RuntimeApplySnapshot {
    return this.runtimeStore.getSnapshot()
  }

  subscribeRuntime(listener: () => void): () => void {
    return this.runtimeStore.subscribe(listener)
  }

  set(field: string, value: unknown): Promise<void> {
    return this.write({ op: 'set', field, value })
  }

  unset(field: string): Promise<void> {
    return this.write({ op: 'unset', field })
  }

  refresh(): Promise<void> {
    return this.enqueue(async () => {
      if (this.native.getSnapshot().status === 'ready') this.syncNative()
      try {
        const response = await this.request(ENDPOINT, { method: 'GET', cache: 'no-store' })
        if (!response.ok) return
        const view = decodeView(await response.json())
        if (view !== undefined) this.accept(view)
      } catch {
        // Keep the last accepted value. The settings panel renders its existing
        // unavailable state when neither bridge can reach the local Host.
      }
    })
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.unsubscribeNative()
    await this.tail
  }

  whenIdle(): Promise<void> {
    return this.tail
  }

  private write(operation: { op: 'set' | 'unset'; field: string; value?: unknown }): Promise<void> {
    return this.enqueue(async () => {
      if (this.native.getSnapshot().status === 'ready') {
        if (operation.op === 'set') await this.native.set(operation.field, operation.value)
        else await this.native.unset(operation.field)
        this.syncNative()
        await this.reloadFallback()
        return
      }
      const revision = this.store.getSnapshot().revision
      try {
        const response = await this.request(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            op: operation.op,
            field: operation.field,
            ...(operation.op === 'set' ? { value: operation.value } : {}),
            ...(revision === undefined ? {} : { expectedRevision: revision }),
          }),
        })
        if (!response.ok) {
          await this.reloadFallback()
          return
        }
        const view = decodeView(await response.json())
        if (view !== undefined) this.accept(view)
      } catch {
        await this.reloadFallback()
      }
    })
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    if (this.disposed) return Promise.resolve()
    const task = this.tail.then(async () => {
      if (!this.disposed) await operation()
    })
    this.tail = task.catch(() => undefined)
    return task
  }

  private syncNative(): void {
    const snapshot = this.native.getSnapshot()
    if (snapshot.status === 'ready') this.store.set(snapshot)
  }

  private async reloadFallback(): Promise<void> {
    try {
      const response = await this.request(ENDPOINT, { method: 'GET', cache: 'no-store' })
      if (!response.ok) return
      const view = decodeView(await response.json())
      if (view !== undefined) this.accept(view)
    } catch {
      // Recovery is best-effort, matching the official scope's failed-read path.
    }
  }

  private accept(view: RuntimeConfigApiView): void {
    this.runtimeStore.set({
      desired: view.desired,
      applied: view.applied,
      generation: view.generation,
      desiredGeneration: view.desiredGeneration,
      applying: view.applying,
      inSync: view.inSync,
      ...(view.lastFailure === undefined ? {} : { lastFailure: view.lastFailure }),
    })
    if (this.native.getSnapshot().status === 'ready') return
    this.store.set({
      status: 'ready',
      value: view.value,
      base: view.base,
      user: view.user,
      revision: view.revision,
      writable: view.writable,
      mode: 'host',
    })
  }
}