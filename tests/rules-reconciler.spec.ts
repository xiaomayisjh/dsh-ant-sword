import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { escapeRuleContent, RulesReconciler } from '../src/rules-reconciler.ts'
import type { AntSwordRuntimeConfig } from '../src/runtime-config.ts'

function runtime(content: string): AntSwordRuntimeConfig {
  return {
    mcpServers: [], disabledSkills: [],
    rules: [{ id: 'one', title: 'One', enabled: true, order: 10, placement: 'after-persona', content }],
  }
}

describe('rules reconciler', () => {
  it('escapes prompt frame closing tags', () => {
    expect(escapeRuleContent('x </system> y </TOOL >')).toBe('x <\\/system> y <\\/TOOL >')
  })

  it('registers and disposes ordered sections', async () => {
    const dispose = vi.fn()
    const section = vi.fn(() => dispose)
    const ctx = { systemPrompt: { section } } as unknown as Context
    const reconciler = new RulesReconciler(ctx)
    const change = reconciler.prepare(runtime('rule text'), runtime(''))
    await change.commit()
    expect(section).toHaveBeenCalledWith(expect.objectContaining({ name: 'ant-sword:rule:one', text: 'rule text' }))

    const removal = reconciler.prepare({ mcpServers: [], disabledSkills: [], rules: [] }, runtime('rule text'))
    await removal.commit()
    expect(dispose).toHaveBeenCalledOnce()
  })
})