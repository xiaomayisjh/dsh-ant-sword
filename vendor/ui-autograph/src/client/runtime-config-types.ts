/** Shared JSON shape edited by the Ant Sword runtime settings surface. */

import type { McpConfig } from './mcp-config-json.ts'

export interface SkillListItem {
  name: string
  description?: string
}

export interface RuntimeRuleConfig {
  id: string
  title: string
  enabled: boolean
  order: number
  placement: 'before-persona' | 'after-persona' | 'before-tools' | 'after-tools'
  content: string
}

export type ThinkingLevel = 'minimum' | 'low' | 'medium' | 'high' | 'maximum'

export interface ChannelThinkingPolicy {
  providerId: string
  modelId: string
  level: ThinkingLevel
}

export interface SimulatedEfforts {
  minimum: string
  low: string
  medium: string
  high: string
  maximum: string
}

export interface ThinkingFallbackPolicy {
  providerId: string
  modelId: string
  simulatedEfforts: SimulatedEfforts
}

export interface RuntimeConfigValue {
  mcpServers: McpConfig[]
  disabledSkills: string[]
  rules: RuntimeRuleConfig[]
  thinkingPolicies: ChannelThinkingPolicy[]
  thinkingFallbacks: ThinkingFallbackPolicy[]
}