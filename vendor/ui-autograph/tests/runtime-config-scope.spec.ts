// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type {
  SettingsScope, SettingsScopeSnapshot,
} from '@deepseek-ai/dsh-client-runtime/client'
import {
  RuntimeConfigScope,
} from '../src/client/runtime-config-scope.ts'
import type {
  RuntimeConfigFetch,
} from '../src/client/runtime-config-scope.ts'
import type { RuntimeConfigValue } from '../src/client/runtime-config-types.ts'

vi.mock('@deepseek-ai/dsh-client-runtime/client', () => ({
  createSnapshotStore: <T,>(initial: T) => {
    let snapshot = initial
    const listeners = new Set<() => void>()
    return {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      set: (value: T) => {
        snapshot = value
        for (const listener of listeners) listener()
      },
    }
  },
}))

const EMPTY: RuntimeConfigValue = { mcpServers: [], disabledSkills: [], rules: [] }

function response(value: unknown, status = 200): Awaited<ReturnType<RuntimeConfigFetch>> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  }
}

function nativeScope(initial: SettingsScopeSnapshot<RuntimeConfigValue>): {
  scope: SettingsScope<RuntimeConfigValue>
  set: ReturnType<typeof vi.fn>
  unset: ReturnType<typeof vi.fn>
} {
  let current = initial
  const listeners = new Set<() => void>()
  const set = vi.fn(async (field: string, value: unknown) => {
    current = {
      ...current,
      value: current.value === undefined ? undefined : { ...current.value, [field]: value },
    }
    for (const listener of listeners) listener()
  })
  const unset = vi.fn(async () => undefined)
  return {
    scope: {
      getSnapshot: () => current,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      set,
      unset,
    },
    set,
    unset,
  }
}

describe('runtime config scope', () => {
  it('loads and mutates through the loopback fallback when Host omits the namespace', async () => {
    const native = nativeScope({
      status: 'unavailable', value: undefined, base: undefined, user: undefined,
      revision: undefined, writable: false, mode: 'host',
    })
    const next = { ...EMPTY, disabledSkills: ['reverse-engineering'] }
    const request = vi.fn<RuntimeConfigFetch>()
      .mockResolvedValueOnce(response({ value: EMPTY, revision: 3, writable: true }))
      .mockResolvedValueOnce(response({ value: next, revision: 4, writable: true }))
    const scope = new RuntimeConfigScope(native.scope, request)
    await scope.whenIdle()

    expect(scope.getSnapshot()).toMatchObject({ status: 'ready', value: EMPTY, revision: 3, writable: true })
    await scope.set('disabledSkills', next.disabledSkills)

    expect(request).toHaveBeenNthCalledWith(2, '/ant-sword/runtime-config', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        op: 'set', field: 'disabledSkills', value: next.disabledSkills, expectedRevision: 3,
      }),
    }))
    expect(scope.getSnapshot()).toMatchObject({ value: next, revision: 4 })
    expect(native.set).not.toHaveBeenCalled()
    await scope.dispose()
  })

  it('prefers the official settings bridge when the namespace is exposed', async () => {
    const native = nativeScope({
      status: 'ready', value: EMPTY, base: EMPTY, user: {},
      revision: 7, writable: true, mode: 'host',
    })
    const request = vi.fn<RuntimeConfigFetch>()
    const scope = new RuntimeConfigScope(native.scope, request)
    await scope.whenIdle()
    await scope.set('rules', [])

    expect(request).not.toHaveBeenCalled()
    expect(native.set).toHaveBeenCalledWith('rules', [])
    expect(scope.getSnapshot()).toMatchObject({ status: 'ready', revision: 7 })
    await scope.dispose()
  })
})