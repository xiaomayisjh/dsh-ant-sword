// @vitest-environment jsdom
import { useState } from 'react'
import { fireEvent, render, screen, cleanup, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { McpConfig } from '../src/client/mcp-config-json.ts'
import { McpConfigEditor } from '../src/client/McpConfigEditor.tsx'

const SAVED: McpConfig[] = [{
  serverName: 'filesystem', enabled: true, transport: 'stdio', command: 'npx', args: ['-y'], env: {}, toolCallTimeoutMs: 60_000,
}]

function Harness() {
  const [servers, setServers] = useState<McpConfig[]>(structuredClone(SAVED))
  return <McpConfigEditor servers={servers} savedServers={SAVED} saving={false} onChange={setServers} onSave={vi.fn()} />
}

afterEach(cleanup)

describe('MCP configuration editor', () => {
  it('supports master-detail add, copy, delete, and dirty reset', () => {
    render(<Harness />)
    expect(screen.getByRole('option', { name: /filesystem/ }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '复制' }))
    expect(screen.getByRole('option', { name: /filesystem-copy/ })).toBeTruthy()
    expect(screen.getByText('有未保存更改')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(screen.queryByRole('option', { name: /filesystem-copy/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(within(screen.getByRole('listbox', { name: 'MCP 服务器' })).getAllByRole('option')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '重置' }))
    expect(within(screen.getByRole('listbox', { name: 'MCP 服务器' })).getAllByRole('option')).toHaveLength(1)
    expect(screen.getByText('所有更改已保存')).toBeTruthy()
  })

  it('keeps visual data when pasted JSON is invalid and imports common catalogs', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
    const editor = screen.getByLabelText('MCP JSON')
    fireEvent.change(editor, { target: { value: '{ broken' } })
    fireEvent.click(screen.getByRole('button', { name: '应用到可视化' }))
    expect(screen.getByRole('status').textContent).toContain('当前可视化配置不会被覆盖')
    fireEvent.click(screen.getByRole('button', { name: '可视化' }))
    expect(screen.getByRole('option', { name: /filesystem/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
    fireEvent.change(screen.getByLabelText('MCP JSON'), { target: { value: JSON.stringify({ mcpServers: [{ name: 'remote', url: 'https://example.test/mcp' }] }) } })
    fireEvent.click(screen.getByRole('button', { name: '应用到可视化' }))
    expect(screen.getByRole('option', { name: /remote/ })).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>('URL').value).toBe('https://example.test/mcp')
  })

  it('shows transport-specific fields and keyboard list navigation', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('传输'), { target: { value: 'streamable-http' } })
    expect(screen.getByLabelText('URL')).toBeTruthy()
    expect(screen.queryByLabelText('命令')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    const options = within(screen.getByRole('listbox', { name: 'MCP 服务器' })).getAllByRole('option')
    const first = options[0]
    first?.focus()
    fireEvent.keyDown(first as HTMLElement, { key: 'ArrowDown' })
    expect(within(screen.getByRole('listbox', { name: 'MCP 服务器' })).getAllByRole('option')[1]?.getAttribute('aria-selected')).toBe('true')
  })
})
