import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { McpReconciler } from '../src/mcp-reconciler.ts'
import { AntSwordRuntimeConfigSchema } from '../src/runtime-config.ts'
import type { AntSwordRuntimeConfig } from '../src/runtime-config.ts'

const probeMcpServer = vi.hoisted(() => vi.fn())
vi.mock('@deepseek-ai/dsh-mcp-client', async importOriginal => ({
  ...(await importOriginal<typeof import('@deepseek-ai/dsh-mcp-client')>()),
  probeMcpServer,
}))

function config(command = 'one'): AntSwordRuntimeConfig {
  return AntSwordRuntimeConfigSchema({
    mcpServers: [{ serverName: 'server', transport: 'stdio', command }],
    disabledSkills: [], rules: [], thinkingPolicies: [],
  })
}

function fakeContext(): {
  ctx: Context
  mounts: Array<{ config: { serverName: string; command: string }; dispose: ReturnType<typeof vi.fn> }>
  failNextMount: () => void
} {
  const mounts: Array<{ config: { serverName: string; command: string }; dispose: ReturnType<typeof vi.fn> }> = []
  let fail = false
  const ctx = {
    plugin: (_plugin: unknown, value: unknown) => {
      const config = value as { serverName: string; command: string }
      const dispose = vi.fn(async () => undefined)
      const record = { config, dispose }
      mounts.push(record)
      return {
        await: async () => {
          if (fail) {
            fail = false
            throw new Error('connect failed')
          }
        },
        dispose,
      }
    },
  } as unknown as Context
  return { ctx, mounts, failNextMount: () => { fail = true } }
}

describe('MCP reconciler', () => {
  it('uses only applied configuration and reports unknown servers', async () => {
    const { ctx } = fakeContext()
    const reconciler = new McpReconciler(ctx, undefined, () => true)
    await reconciler.prepare(config('applied'), config()).commit()
    probeMcpServer.mockResolvedValueOnce({ toolCount: 0, tools: [] })

    await reconciler.probe('server')
    expect(probeMcpServer).toHaveBeenCalledWith(expect.objectContaining({ command: 'applied' }))
    await expect(reconciler.probe('missing')).rejects.toThrow('unknown MCP server')
  })

  it('serializes reload behind a pending commit', async () => {
    const { ctx, mounts } = fakeContext()
    const reconciler = new McpReconciler(ctx, undefined, () => true)
    const commit = reconciler.prepare(config('new'), config()).commit()
    const reload = reconciler.reload('server')
    await Promise.all([commit, reload])

    expect(mounts.map(item => item.config.command)).toEqual(['new', 'new'])
    expect(reconciler.isMounted('server')).toBe(true)
  })

  it('restores the previous applied fiber when a changed mount fails', async () => {
    const { ctx, mounts, failNextMount } = fakeContext()
    const reconciler = new McpReconciler(ctx, undefined, () => true)
    await reconciler.prepare(config('old'), config()).commit()
    failNextMount()

    await expect(reconciler.prepare(config('bad'), config('old')).commit()).rejects.toThrow('connect failed')
    expect(mounts.map(item => item.config.command)).toEqual(['old', 'bad', 'old'])
    expect(reconciler.isMounted('server')).toBe(true)
    probeMcpServer.mockResolvedValueOnce({ toolCount: 0, tools: [] })
    await reconciler.probe('server')
    expect(probeMcpServer).toHaveBeenLastCalledWith(expect.objectContaining({ command: 'old' }))
  })
})