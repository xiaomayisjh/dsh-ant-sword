import { describe, expect, it, vi } from 'vitest'
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
    thinkingPolicies: [],
    thinkingFallbacks: [],
    ...patch,
  })
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

  it('enforces channel thinking policy identities and selectors', () => {
    expect(() => validateRuntimeConfig(config({
      thinkingPolicies: [
        { providerId: 'custom', modelId: 'model-a', level: 'low' },
        { providerId: 'custom', modelId: 'model-a', level: 'high' },
      ],
    }))).toThrow('duplicate')
    expect(() => validateRuntimeConfig(config({
      thinkingPolicies: [{ providerId: ' custom ', modelId: 'model-a', level: 'medium' }],
    }))).toThrow('providerId')
  })

  it('serializes committed Loader config generations', async () => {
    const commits: string[] = []
    const controller = new RuntimeController(config(), [reconciler('mcp', {
      commit: () => { commits.push('commit') },
      rollback: () => { commits.push('rollback') },
    })])
    const stop = controller.start()
    await controller.whenIdle()
    await controller.update(config({ disabledSkills: ['reverse-engineering'] }))
    await controller.whenIdle()

    expect(controller.snapshot().generation).toBe(2)
    expect(controller.snapshot().desiredGeneration).toBe(2)
    expect(controller.snapshot().desired.disabledSkills).toEqual(['reverse-engineering'])
    expect(controller.snapshot().applied.disabledSkills).toEqual(['reverse-engineering'])
    expect(commits).toEqual(['commit', 'commit'])
    await stop()
  })

  it('rolls back committed reconcilers and retains the last good config', async () => {
    const initial = config()
    const firstRollback = vi.fn()
    const controller = new RuntimeController(initial, [
      reconciler('mcp', { commit: vi.fn(), rollback: firstRollback }),
      reconciler('rules', { commit: () => { throw new Error('rules unavailable') }, rollback: vi.fn() }),
    ])
    const stop = controller.start()
    await controller.whenIdle()

    expect(controller.snapshot().generation).toBe(0)
    expect(controller.snapshot().desired).toEqual(initial)
    expect(controller.snapshot().applied).toEqual(initial)
    expect(controller.snapshot().lastFailure).toEqual({ reconciler: 'rules', message: 'rules unavailable', generation: 1 })
    expect(firstRollback).toHaveBeenCalledOnce()
    await stop()
  })
})
