/** Shared JSON shape edited by the Ant Sword runtime settings surface. */

import type { McpConfig } from './mcp-config-json.ts'

export interface RuntimeRuleConfig {
  id: string
  title: string
  enabled: boolean
  order: number
  placement: 'before-persona' | 'after-persona' | 'before-tools' | 'after-tools'
  content: string
}

export interface RuntimeConfigValue {
  mcpServers: McpConfig[]
  disabledSkills: string[]
  rules: RuntimeRuleConfig[]
}