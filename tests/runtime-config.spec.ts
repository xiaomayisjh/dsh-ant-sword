import { describe, expect, it, vi } from 'vitest'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import {
  AntSwordRuntimeConfigSchema,
  RuntimeController,
  validateRuntimeConfig,
} from '../src/runtime-config.ts'
import type {
  AntSwordRuntimeConfig,
  RuntimePreparedChange,
  RuntimeReconciler,
} from '../src/runtime-config.ts'

function config(patch: Partial<AntSwordRuntimeConfig> = {}): AntSwordRuntimeConfig {
  return AntSwordRuntimeConfigSchema({
    mcpServers: [],
    disabledSkills: [],
    rules: [],
    ...patch,
  })
}

function settingsScope(initial: AntSwordRuntimeConfig): {
  scope: SettingsScope<AntSwordRuntimeConfig>
  publish(next: AntSwordRuntimeConfig): Promise<void>
} {
  let current = initial
  let watcher: ((next: AntSwordRuntimeConfig, previous: AntSwordRuntimeConfig) => void | Promise<void>) | undefined
  return {
    scope: {
      get: () => current,
      watch: (callback) => {
        watcher = callback
        return () => { watcher = undefined }
      },
      update: async () => undefined,
      replace: async () => undefined,
    },
    publish: async (next) => {
      const previous = current
      current = next
      await watcher?.(next, previous)
    },
  }
}

function reconciler(name: string, change: RuntimePreparedChange): RuntimeReconciler {
  return {
    name,
    prepare: vi.fn(() => {
      return change
    }),
  }
}

describe('ant-sword runtime config', () => {
  it('rejects duplicate identities and invalid transport fields', () => {
    expect(() => {
      validateRuntimeConfig(config({
        mcpServers: [
          { serverName: 'same', transport: 'stdio', command: 'one' },
          { serverName: 'same', transport: 'stdio', command: 'two' },
        ],
      }))
    }).toThrow('duplicate')

    expect(() => {
      validateRuntimeConfig(config({
        mcpServers: [{ serverName: 'remote', transport: 'streamable-http', url: 'file:///tmp/mcp' }],
      }))
    }).toThrow('http or https')
  })

  it('enforces skill and rule text boundaries', () => {
    expect(() => {
      validateRuntimeConfig(config({ disabledSkills: ['../escape'] }))
    }).toThrow('disabled skill')
    expect(() => {
      validateRuntimeConfig(config({
        rules: [{ id: 'rule', title: 'Rule', enabled: true, order: 0, placement: 'after-persona', content: 'bad\0frame' }],
      }))
    }).toThrow('NUL')
  })

  it('serializes committed settings generations', async () => {
    const state = settingsScope(config())
    const commits: string[] = []
    const controller = new RuntimeController(state.scope, [reconciler('mcp', {
      commit: () => { commits.push('commit') },
      rollback: () => { commits.push('rollback') },
    })])
    const stop = controller.start()
    await controller.whenIdle()
    await state.publish(config({ disabledSkills: ['reverse-engineering'] }))
    await controller.whenIdle()

    expect(controller.snapshot().generation).toBe(2)
    expect(controller.snapshot().config.disabledSkills).toEqual(['reverse-engineering'])
    expect(commits).toEqual(['commit', 'commit'])
    await stop()
  })

  it('rolls back committed reconcilers and retains the last good config', async () => {
    const initial = config()
    const state = settingsScope(initial)
    const firstRollback = vi.fn()
    const controller = new RuntimeController(state.scope, [
      reconciler('mcp', { commit: vi.fn(), rollback: firstRollback }),
      reconciler('rules', { commit: () => { throw new Error('rules unavailable') }, rollback: vi.fn() }),
    ])
    const stop = controller.start()
    await controller.whenIdle()

    expect(controller.snapshot().generation).toBe(0)
    expect(controller.snapshot().config).toEqual(initial)
    expect(controller.snapshot().lastFailure).toEqual({ reconciler: 'rules', message: 'rules unavailable' })
    expect(firstRollback).toHaveBeenCalledOnce()
    await stop()
  })
})