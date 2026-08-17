// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { RuntimeConfigEditor, type RuntimeConfigValue } from '../src/client/RuntimeConfigEditor.tsx'

const value: RuntimeConfigValue = {
  mcpServers: [{ serverName: 'filesystem', enabled: true, transport: 'stdio', command: 'npx', args: [], env: {}, toolCallTimeoutMs: 60_000 }],
  disabledSkills: [],
  rules: [],
}

function scopeFixture(): { scope: SettingsScope<RuntimeConfigValue>; set: ReturnType<typeof vi.fn> } {
  const snapshot: SettingsScopeSnapshot<RuntimeConfigValue> = {
    status: 'ready', value, base: {}, user: {}, revision: 1, writable: true, mode: 'host',
  }
  const set = vi.fn(() => Promise.resolve())
  return {
    set,
    scope: {
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
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
