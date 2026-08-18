/**
 * Embedded MCP server config: the default eight-server catalog, the enabled
 * filter, and the pentestswarm credential injection — the knobs the dsh
 * plugin-config UI edits. Mounting is asserted by intercepting ctx.plugin.
 */

import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { applyMcpServers, DEFAULT_MCP_SERVERS, McpServerSchema } from '../src/mcp-servers.ts'
import type { McpServerConfig } from '../src/mcp-servers.ts'

/** A Context stand-in that records programmatic plugin mounts. */
function recordingCtx(): { ctx: Context; mounted: { config: unknown }[] } {
  const mounted: { config: unknown }[] = []
  const ctx = {
    plugin: (_plugin: unknown, config: unknown) => {
      mounted.push({ config })
      return { await: () => Promise.resolve({}) }
    },
  } as unknown as Context
  return { ctx, mounted }
}

describe('embedded MCP server catalog', () => {
  it('ships eight enabled servers plus optional disabled catalog entries', () => {
    expect(DEFAULT_MCP_SERVERS.filter(server => server.enabled !== false)).toHaveLength(9)
    const names = DEFAULT_MCP_SERVERS.map(s => s.serverName)
    for (const expected of ['kali', 'metasploit', 'hexstrike', 'pentestswarm', 'jshook', 'anything', 'idapro', 'ghidra']) {
      expect(names).toContain(expected)
    }
  })

  it('includes optional disabled catalog entries for the visual editor', () => {
    expect(DEFAULT_MCP_SERVERS.map(server => server.serverName)).toContain('playwright')
  })
  it('mounts one mcp-client per enabled server, skipping disabled ones', () => {
    const { ctx, mounted } = recordingCtx()
    const servers: McpServerConfig[] = [
      { serverName: 'kali', transport: 'stdio', command: 'kali-server-mcp', args: ['--port', '5000'] },
      { serverName: 'ghidra', transport: 'streamable-http', url: 'http://localhost:8765/mcp', enabled: false },
    ]
    applyMcpServers(ctx, servers, undefined, () => true)
    expect(mounted).toHaveLength(1)
    const cfg = mounted[0]?.config as { transport: string; serverName: string; command: string; failOnStartupError: boolean }
    expect(cfg.transport).toBe('stdio')
    expect(cfg.serverName).toBe('kali')
    expect(cfg.command).toBe('kali-server-mcp')
    expect(cfg.failOnStartupError).toBe(false)
  })

  it('mounts only the servers the operator explicitly enables', () => {
    const { ctx, mounted } = recordingCtx()
    // Operator disables everything except idapro + ghidra in the config UI.
    const servers = DEFAULT_MCP_SERVERS.map(s =>
      (s.serverName === 'idapro' || s.serverName === 'ghidra') ? s : { ...s, enabled: false })
    applyMcpServers(ctx, servers)
    expect(mounted.map(m => (m.config as { serverName: string }).serverName).sort()).toEqual(['ghidra', 'idapro'])
  })

  it('mounts nothing when every server is disabled', () => {
    const { ctx, mounted } = recordingCtx()
    applyMcpServers(ctx, DEFAULT_MCP_SERVERS.map(s => ({ ...s, enabled: false })))
    expect(mounted).toHaveLength(0)
  })

  it('injects the pentestswarm orchestrator key into that server env only', () => {
    const { ctx, mounted } = recordingCtx()
    applyMcpServers(ctx, DEFAULT_MCP_SERVERS, 'sk-orchestrator', () => true)
    const swarm = mounted.find(m => (m.config as { serverName: string }).serverName === 'pentestswarm')
    const kali = mounted.find(m => (m.config as { serverName: string }).serverName === 'kali')
    expect((swarm?.config as { env: Record<string, string> }).env['PENTESTSWARM_ORCHESTRATOR_API_KEY']).toBe('sk-orchestrator')
    expect((kali?.config as { env: Record<string, string> }).env['PENTESTSWARM_ORCHESTRATOR_API_KEY']).toBeUndefined()
  })

  it('omits the key env when no credential is configured', () => {
    const { ctx, mounted } = recordingCtx()
    applyMcpServers(ctx, DEFAULT_MCP_SERVERS, undefined, () => true)
    const swarm = mounted.find(m => (m.config as { serverName: string }).serverName === 'pentestswarm')
    expect((swarm?.config as { env: Record<string, string> }).env['PENTESTSWARM_ORCHESTRATOR_API_KEY']).toBeUndefined()
  })

  it('keeps missing stdio servers unmounted instead of entering reconnect loops', () => {
    const { ctx, mounted } = recordingCtx()
    const servers: McpServerConfig[] = [
      { serverName: 'missing', transport: 'stdio', command: 'missing-mcp' },
      { serverName: 'present', transport: 'stdio', command: 'present-mcp' },
      { serverName: 'remote', transport: 'streamable-http', url: 'http://localhost:8765/mcp' },
    ]
    applyMcpServers(ctx, servers, undefined, command => command === 'present-mcp')
    expect(mounted.map(m => (m.config as { serverName: string }).serverName)).toEqual(['present', 'remote'])
  })

  it('validates a server entry through the schema', () => {
    const parsed = McpServerSchema({ serverName: 'kali', transport: 'stdio', command: 'kali-server-mcp', enabled: true })
    expect(parsed.enabled).toBe(true)
    expect(parsed.serverName).toBe('kali')
    expect(() => McpServerSchema({ transport: 'stdio' } as never)).toThrow()
  })
})
