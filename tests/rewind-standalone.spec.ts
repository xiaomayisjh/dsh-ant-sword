/**
 * REAL-composition verification that the `ant-sword-rewind` row mounts
 * independently on the base-profile services (`sessions`, `storageDomain`,
 * `commands`, `tools`) without any MCP/Web-dependent service, and that its
 * `/rewind` command lands on the live command registry.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import type { Session } from '@deepseek-ai/dsh-session'
import { apply as applyRewind, name as rewindPluginName } from '../src/rewind-plugin.ts'

/** Minimal `Agent` stand-in: `list`/`find` only need id + session shape. */
function fakeAgent(session: Session): unknown {
  return { session }
}

async function bootBaseServices(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend())
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  return ctx
}

describe('ant-sword-rewind standalone row', () => {
  it('mounts on sessions/storageDomain/commands alone and registers /rewind', async () => {
    const ctx = await bootBaseServices()
    await ctx.plugin(CommandRuntime)

    // Simulate the Loader activating the rewind row: apply with defaults.
    applyRewind(ctx, {})

    // The /rewind command is visible to any agent through the global registry.
    const commands = ctx.get('commands') as InstanceType<typeof CommandRuntime>
    const agent = fakeAgent({ id: 's-standalone' } as Session)
    const registered = commands.list(agent as never)
    expect(registered.some(command => command.name === 'rewind')).toBe(true)
  })

  it('exposes the plugin name the patch row resolves to', () => {
    expect(rewindPluginName).toBe('ant-sword-rewind')
  })
})
