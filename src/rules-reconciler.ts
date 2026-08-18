/** Ordered system-prompt sections backed by runtime rules. */

import { randomUUID } from 'node:crypto'
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

function sectionOrder(rule: RuntimeRuleConfig, collisionOffset = 0): number {
  return PLACEMENT_ORDER[rule.placement] + Math.max(-9, Math.min(9, rule.order / 1_000_000)) + collisionOffset / 1_000_000_000
}

export function escapeRuleContent(content: string): string {
  return content.replace(/<\/(system|assistant|user|tool)(?=[\s>])/gi, '<\\/$1')
}

/** Generates a backend-owned id; callers must persist it and reuse it on edits/copies. */
export function createStableRuleId(existing: Iterable<string> = []): string {
  const used = new Set(existing)
  let id = `rule-${randomUUID()}`
  while (used.has(id)) id = `rule-${randomUUID()}`
  return id
}

/** Adds ids to imported/legacy rules while preserving every existing id. */
export function ensureStableRuleIds(rules: readonly RuntimeRuleConfig[]): RuntimeRuleConfig[] {
  const ids = new Set<string>()
  return rules.map(rule => {
    const id = rule.id || createStableRuleId(ids)
    if (ids.has(id)) throw new TypeError(`rules contains duplicate id "${id}"`)
    ids.add(id)
    return id === rule.id ? { ...rule } : { ...rule, id }
  })
}

function registerRules(ctx: Context, rules: readonly RuntimeRuleConfig[]): Array<() => void> {
  const collisions = new Map<string, number>()
  const disposers: Array<() => void> = []
  try {
    for (const rule of rules) {
      const key = `${rule.placement}:${rule.order}`
      const offset = collisions.get(key) ?? 0
      collisions.set(key, offset + 1)
      disposers.push(ctx.systemPrompt.section({
        name: sectionName(rule),
        order: sectionOrder(rule, offset),
        text: escapeRuleContent(rule.content),
      }))
    }
    return disposers
  } catch (error) {
    disposers.forEach(dispose => { dispose() })
    throw error
  }
}

export class RulesReconciler implements RuntimeReconciler {
  readonly name = 'rules'
  private disposers: Array<() => void> = []
  private rules: RuntimeRuleConfig[] = []

  constructor(private readonly ctx: Context) {}

  prepare(next: AntSwordRuntimeConfig, _previousConfig: AntSwordRuntimeConfig): RuntimePreparedChange {
    const desired = ensureStableRuleIds(next.rules)
      .filter(rule => rule.enabled)
      .toSorted((left, right) => left.placement.localeCompare(right.placement)
        || left.order - right.order
        || left.id.localeCompare(right.id))
    const previous = this.rules.map(rule => ({ ...rule }))
    let committed = false
    return {
      commit: () => {
        // Build the replacement before touching the live sections. A failed
        // registration therefore leaves the previous prompt intact.
        const nextDisposers = registerRules(this.ctx, desired)
        const oldDisposers = this.disposers
        this.disposers = nextDisposers
        this.rules = desired
        committed = true
        oldDisposers.forEach(dispose => { dispose() })
      },
      rollback: () => {
        if (!committed && this.disposers.length > 0) return
        this.disposers.forEach(dispose => { dispose() })
        this.disposers = registerRules(this.ctx, previous)
        this.rules = previous
      },
    }
  }
}