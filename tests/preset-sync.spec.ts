/**
 * Red-team preset sync: the bundled preset is materialized into the harness's
 * writable user preset root, idempotently, and carries the required files.
 */

import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const homes: string[] = []

async function freshHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'ant-sword-preset-home-'))
  homes.push(home)
  return home
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map(home => rm(home, { recursive: true, force: true })))
})

describe('syncRedTeamPreset', () => {
  it('materializes the red-team preset into the user preset root, idempotently', async () => {
    const home = await freshHome()
    process.env['DSH_HOME'] = home
    // Re-import after setting DSH_HOME so dshHomePath resolves the test root.
    const { syncRedTeamPreset, RED_TEAM_PRESET_ID } = await import('../src/preset-sync.ts')

    const target = await syncRedTeamPreset()
    expect(target).toBe(join(home, '.agent-presets', RED_TEAM_PRESET_ID))

    const composition = await readFile(join(target, 'agent.cordis.yml'), 'utf8')
    expect(composition).toContain("'@deepseek-ai/dsh-persona'")
    expect(composition).toContain('red-team operator')

    const metadata = await readFile(join(target, 'preset.yml'), 'utf8')
    expect(metadata).toContain('Red Team')

    // Idempotent: a second sync succeeds and keeps the files present.
    await syncRedTeamPreset()
    expect((await stat(join(target, 'agent.cordis.yml'))).isFile()).toBe(true)
  })

  it('materializes the red-team-auto preset with its MCP rows and autonomous persona', async () => {
    const home = await freshHome()
    process.env['DSH_HOME'] = home
    const { syncRedTeamAutoPreset, RED_TEAM_AUTO_PRESET_ID } = await import('../src/preset-sync.ts')

    const target = await syncRedTeamAutoPreset()
    expect(target).toBe(join(home, '.agent-presets', RED_TEAM_AUTO_PRESET_ID))

    const composition = await readFile(join(target, 'agent.cordis.yml'), 'utf8')
    expect(composition).toContain('AUTONOMOUS red-team operator')
    // MCP servers are mounted programmatically from bundle config, not preset rows.
    expect(composition).toContain('mcpServers')
    expect(composition).not.toContain('serverName: kali')
    // No plan-mode gate: the autonomous loop must not be gated.
    expect(composition).not.toContain('dsh-plan-mode')

    const metadata = await readFile(join(target, 'preset.yml'), 'utf8')
    expect(metadata).toContain('Red Team (Auto)')

    await syncRedTeamAutoPreset()
    expect((await stat(join(target, 'agent.cordis.yml'))).isFile()).toBe(true)
  })
})
