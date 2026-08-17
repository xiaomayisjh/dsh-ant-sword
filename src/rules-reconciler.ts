/** Ordered system-prompt sections backed by runtime rules. */

import type { Context } from '@deepseek-ai/cordis'
import type { AntSwordRuntimeConfig, RuntimePreparedChange, RuntimeReconciler, RuntimeRuleConfig, RulePlacement } from './runtime-config.ts'

const PLACEMENT_ORDER: Record<RulePlacement, number> = {
  'before-persona': -50,
  'after-persona': 50,
  'before-tools': 90,
  'after-tools': 200,
}

function sectionName(rule: RuntimeRuleConfig): string {
  return `ant-sword:rule:${rule.id}`
}

function sectionOrder(rule: RuntimeRuleConfig): number {
  return PLACEMENT_ORDER[rule.placement] + Math.max(-9, Math.min(9, rule.order / 1_000_000))
}

export function escapeRuleContent(content: string): string {
  return content.replace(/<\/(system|assistant|user|tool)(?=[\s>])/gi, '<\\/$1')
}

export class RulesReconciler implements RuntimeReconciler {
  readonly name = 'rules'
  private disposers: Array<() => void> = []
  private rules: RuntimeRuleConfig[] = []

  constructor(private readonly ctx: Context) {}

  prepare(next: AntSwordRuntimeConfig, _previousConfig: AntSwordRuntimeConfig): RuntimePreparedChange {
    const desired = next.rules
      .filter(rule => rule.enabled)
      .toSorted((left, right) => left.placement.localeCompare(right.placement)
        || left.order - right.order
        || left.id.localeCompare(right.id))
    const previous = this.rules
    return {
      commit: () => {
        const oldDisposers = this.disposers
        oldDisposers.forEach((dispose) =>{  dispose() })
        const nextDisposers: Array<() => void> = []
        try {
          for (const rule of desired) {
            nextDisposers.push(this.ctx.systemPrompt.section({
              name: sectionName(rule),
              order: sectionOrder(rule),
              text: escapeRuleContent(rule.content),
            }))
          }
          this.disposers = nextDisposers
          this.rules = desired
        } catch (error) {
          nextDisposers.forEach((dispose) =>{  dispose() })
          this.disposers = previous.map(rule => this.ctx.systemPrompt.section({
            name: sectionName(rule), order: sectionOrder(rule), text: escapeRuleContent(rule.content),
          }))
          this.rules = previous
          throw error
        }
      },
      rollback: () => {
        this.disposers.forEach((dispose) =>{  dispose() })
        this.disposers = previous.map(rule => this.ctx.systemPrompt.section({
          name: sectionName(rule), order: sectionOrder(rule), text: escapeRuleContent(rule.content),
        }))
        this.rules = previous
      },
    }
  }
}
