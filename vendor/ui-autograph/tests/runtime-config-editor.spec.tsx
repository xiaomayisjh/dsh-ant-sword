// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { RuntimeConfigEditor } from '../src/client/RuntimeConfigEditor.tsx'
import type { RuntimeConfigEditorScope } from '../src/client/RuntimeConfigEditor.tsx'
import type { RuntimeConfigValue } from '../src/client/runtime-config-types.ts'

const value: RuntimeConfigValue = {
  mcpServers: [{ serverName: 'filesystem', enabled: true, transport: 'stdio', command: 'npx', args: [], env: {}, toolCallTimeoutMs: 60_000 }],
  disabledSkills: [],
  rules: [],
  thinkingPolicies: [],
}

function scopeFixture(): { scope: RuntimeConfigEditorScope; set: ReturnType<typeof vi.fn> } {
  const snapshot: SettingsScopeSnapshot<RuntimeConfigValue> = {
    status: 'ready', value, base: {}, user: {}, revision: 1, writable: true, mode: 'host',
  }
  const set = vi.fn(() => Promise.resolve())
  const runtimeSnapshot = {
    desired: value,
    applied: value,
    generation: 1,
    desiredGeneration: 1,
    applying: false,
    inSync: true,
  }
  return {
    set,
    scope: {
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
      getRuntimeSnapshot: () => runtimeSnapshot,
      subscribeRuntime: () => () => {},
      set,
      unset: () => Promise.resolve(),
    },
  }
}

afterEach(cleanup)

describe('runtime settings MCP contract', () => {
  it('renders the MCP editor from a ready settings scope and writes mcpServers', async () => {
    const { scope, set } = scopeFixture()
    render(<RuntimeConfigEditor configScope={scope} />)
    await screen.findByRole('heading', { name: 'MCP 服务器' })
    fireEvent.change(screen.getByLabelText('命令'), { target: { value: 'node' } })
    fireEvent.click(screen.getByRole('button', { name: '保存 MCP' }))
    await waitFor(() => { expect(set).toHaveBeenCalledTimes(1) })
    expect(set.mock.calls[0]?.[0]).toBe('mcpServers')
    expect(set.mock.calls[0]?.[1]).toMatchObject([{ serverName: 'filesystem', command: 'node' }])
  })
})
