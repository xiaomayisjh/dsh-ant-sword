import { describe, expect, it, vi } from 'vitest'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsDescriptor } from '@deepseek-ai/dsh-settings'
import {
  mutateRuntimeConfig,
  parseRuntimeConfigMutation,
  runtimeConfigApiView,
} from '../src/runtime-config-api.ts'
import {
  ANT_SWORD_SETTINGS_NAMESPACE,
  AntSwordRuntimeConfigSchema,
} from '../src/runtime-config.ts'
import type { AntSwordRuntimeConfig } from '../src/runtime-config.ts'

function config(patch: Partial<AntSwordRuntimeConfig> = {}): AntSwordRuntimeConfig {
  return AntSwordRuntimeConfigSchema({ mcpServers: [], disabledSkills: [], rules: [], thinkingPolicies: [], ...patch })
}

describe('runtime config loopback API', () => {
  it('accepts only first-level runtime fields and strict mutation shapes', () => {
    expect(parseRuntimeConfigMutation({
      op: 'set', field: 'mcpServers', value: [], expectedRevision: 2,
    })).toEqual({ op: 'set', field: 'mcpServers', value: [], expectedRevision: 2 })
    expect(parseRuntimeConfigMutation({ op: 'unset', field: 'rules' })).toEqual({ op: 'unset', field: 'rules' })
    expect(parseRuntimeConfigMutation({ op: 'set', field: 'thinkingPolicies', value: [] })).toEqual({
      op: 'set', field: 'thinkingPolicies', value: [],
    })
    expect(() => parseRuntimeConfigMutation({ op: 'set', field: 'unknown', value: [] })).toThrow('field must be')
    expect(() => parseRuntimeConfigMutation({ op: 'unset', field: 'rules', value: [] })).toThrow('unsupported fields')
  })

  it('preserves the settings revision fence and waits for hot apply', async () => {
    let value = config()
    let revision = 4
    const descriptor = (): SettingsDescriptor => ({
      ns: settingsNamespace(ANT_SWORD_SETTINGS_NAMESPACE),
      schema: {},
      value,
      base: config(),
      user: { disabledSkills: value.disabledSkills },
      applies: 'live',
      revision,
    })
    const settings = {
      writable: true,
      describe: vi.fn(() => [descriptor()]),
      mutate: vi.fn(async (_namespace, ops, expectedRevision) => {
        expect(expectedRevision).toBe(4)
        expect(ops).toEqual([{ op: 'set', path: ['disabledSkills'], value: ['reverse-engineering'] }])
        value = config({ disabledSkills: ['reverse-engineering'] })
        revision += 1
      }),
    }
    const controller = {
      snapshot: () => ({
        generation: 8,
        desiredGeneration: 8,
        applying: false,
        desired: value,
        applied: value,
      }),
      whenIdle: vi.fn(async () => undefined),
    }

    const view = await mutateRuntimeConfig(settings, controller, {
      op: 'set', field: 'disabledSkills', value: ['reverse-engineering'], expectedRevision: 4,
    })

    expect(controller.whenIdle).toHaveBeenCalledOnce()
    expect(view.revision).toBe(5)
    expect(view.value.disabledSkills).toEqual(['reverse-engineering'])
    expect(view.desired.disabledSkills).toEqual(['reverse-engineering'])
    expect(view.applied.disabledSkills).toEqual(['reverse-engineering'])
    expect(view.inSync).toBe(true)
    expect(runtimeConfigApiView(settings, controller).generation).toBe(8)
  })

  it('reports saved configuration separately from the last applied generation', () => {
    const desired = config({ disabledSkills: ['reverse-engineering'] })
    const applied = config()
    const settings = {
      writable: true,
      describe: () => [{
        ns: settingsNamespace(ANT_SWORD_SETTINGS_NAMESPACE),
        schema: {},
        value: desired,
        applies: 'live' as const,
        revision: 9,
      }],
      mutate: vi.fn(),
    }
    const controller = {
      snapshot: () => ({
        generation: 8,
        desiredGeneration: 9,
        applying: false,
        desired,
        applied,
        lastFailure: { reconciler: 'skills', message: 'refresh failed', generation: 9 },
      }),
      whenIdle: vi.fn(async () => undefined),
    }

    const view = runtimeConfigApiView(settings, controller)
    expect(view.value).toEqual(desired)
    expect(view.desired).toEqual(desired)
    expect(view.applied).toEqual(applied)
    expect(view.inSync).toBe(false)
    expect(view.lastFailure).toEqual({ reconciler: 'skills', message: 'refresh failed', generation: 9 })
  })
})