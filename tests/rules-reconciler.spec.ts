import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { escapeRuleContent, RulesReconciler } from '../src/rules-reconciler.ts'
import type { AntSwordRuntimeConfig } from '../src/runtime-config.ts'

function runtime(content: string): AntSwordRuntimeConfig {
  return {
    mcpServers: [], disabledSkills: [], thinkingPolicies: [],
    rules: [{ id: 'one', title: 'One', enabled: true, order: 10, placement: 'after-persona', content }],
  }
}

describe('rules reconciler', () => {
  it('escapes prompt frame closing tags', () => {
    expect(escapeRuleContent('x </system> y </TOOL >')).toBe('x <\\/system> y <\\/TOOL >')
  })

  it('keeps live rules on registration failure and disambiguates placement collisions', async () => {
    const disposers = [vi.fn(), vi.fn(), vi.fn()]
    const section = vi.fn()
      .mockReturnValueOnce(disposers[0])
      .mockReturnValueOnce(disposers[1])
      .mockReturnValueOnce(disposers[2])
    const ctx = { systemPrompt: { section } } as unknown as Context
    const reconciler = new RulesReconciler(ctx)
    await reconciler.prepare(runtime('old'), runtime('')).commit()

    const collision = runtime('new')
    collision.rules.push({ ...collision.rules[0]!, id: 'two', title: 'Two' })
    await reconciler.prepare(collision, runtime('old')).commit()
    const firstOrder = section.mock.calls[1]?.[0].order as number
    const secondOrder = section.mock.calls[2]?.[0].order as number
    expect(secondOrder).toBeGreaterThan(firstOrder)
    expect(disposers[0]).toHaveBeenCalledOnce()

    section.mockImplementationOnce(() => { throw new Error('registration failed') })
    expect(() => reconciler.prepare(runtime('broken'), collision).commit()).toThrow('registration failed')
    expect(disposers[1]).not.toHaveBeenCalled()
    expect(disposers[2]).not.toHaveBeenCalled()
  })
})