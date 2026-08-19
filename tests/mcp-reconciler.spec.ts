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

function config(command = 'one', serverName = 'server'): AntSwordRuntimeConfig {
  return AntSwordRuntimeConfigSchema({
    mcpServers: [{ serverName, transport: 'stdio', command }],
    disabledSkills: [], rules: [], thinkingPolicies: [],
  })
}

function configWithServers(servers: Array<{ serverName: string; command: string }>): AntSwordRuntimeConfig {
  return AntSwordRuntimeConfigSchema({
    mcpServers: servers.map(server => ({ ...server, transport: 'stdio' as const })),
    disabledSkills: [], rules: [], thinkingPolicies: [],
  })
}

function fakeContext(): {
  ctx: Context
  mounts: Array<{ config: { serverName: string; command: string; failOnStartupError: boolean }; dispose: ReturnType<typeof vi.fn> }>
  failNextMount: (serverName?: string) => void
  warnings: ReturnType<typeof vi.fn>
} {
  const mounts: Array<{ config: { serverName: string; command: string; failOnStartupError: boolean }; dispose: ReturnType<typeof vi.fn> }> = []
  const failures = new Set<string>()
  const warnings = vi.fn()
  const ctx = {
    plugin: (_plugin: unknown, value: unknown) => {
      const config = value as { serverName: string; command: string; failOnStartupError: boolean }
      const dispose = vi.fn(async () => undefined)
      const record = { config, dispose }
      mounts.push(record)
      return {
        await: async () => {
          if (failures.delete(config.serverName)) {
            throw new Error('connect failed')
          }
        },
        dispose,
      }
    },
    logger: { warn: warnings },
  } as unknown as Context
  return { ctx, mounts, failNextMount: (serverName = 'server') => { failures.add(serverName) }, warnings }
}

describe('MCP reconciler', () => {
  it('uses only applied configuration and reports unknown servers', async () => {
    const { ctx, mounts } = fakeContext()
    const reconciler = new McpReconciler(ctx, undefined, () => true)
    await reconciler.prepare(config('applied'), config()).commit()
    expect(mounts[0]?.config.failOnStartupError).toBe(false)
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

  it('isolates one failed server without rolling back healthy servers', async () => {
    const { ctx, mounts, failNextMount, warnings } = fakeContext()
    const reconciler = new McpReconciler(ctx, undefined, () => true)
    const initial = configWithServers([{ serverName: 'healthy', command: 'old' }])
    await reconciler.prepare(initial, initial).commit()
    failNextMount('broken')

    const next = configWithServers([
      { serverName: 'healthy', command: 'new' },
      { serverName: 'broken', command: 'bad' },
    ])
    await expect(reconciler.prepare(next, initial).commit()).resolves.toBeUndefined()
    expect(mounts.map(item => item.config.command).sort()).toEqual(['bad', 'new', 'old'])
    expect(reconciler.isMounted('healthy')).toBe(true)
    expect(reconciler.isMounted('broken')).toBe(false)
    expect(warnings).toHaveBeenCalledWith(expect.stringContaining('broken'))
  })

  it('reloads one server without disturbing another server', async () => {
    const { ctx, mounts } = fakeContext()
    const reconciler = new McpReconciler(ctx, undefined, () => true)
    const initial = configWithServers([
      { serverName: 'first', command: 'one' },
      { serverName: 'second', command: 'two' },
    ])
    await reconciler.prepare(initial, initial).commit()

    await reconciler.reload('first')
    expect(mounts.map(item => item.config.command).sort()).toEqual(['one', 'one', 'two'])
    expect(reconciler.isMounted('first')).toBe(true)
    expect(reconciler.isMounted('second')).toBe(true)
  })
})
