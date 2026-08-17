/** Settings registration and runtime reconciliation wiring. */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { McpReconciler } from './mcp-reconciler.ts'
import { RulesReconciler } from './rules-reconciler.ts'
import {
  ANT_SWORD_SETTINGS_NAMESPACE,
  AntSwordRuntimeConfigSchema,
  RuntimeController,
  validateRuntimeConfig,
} from './runtime-config.ts'
import type { AntSwordRuntimeConfig } from './runtime-config.ts'
import type { McpServerConfig } from './mcp-servers.ts'
import { SkillsReconciler } from './skill-runtime.ts'

export interface DynamicRuntime {
  controller: RuntimeController
  mcp: McpReconciler
}

export function applyDynamicRuntime(
  ctx: Context,
  mcpServers: readonly McpServerConfig[],
  pentestswarmApiKey?: string,
  skillsReconciler: SkillsReconciler = new SkillsReconciler(),
): DynamicRuntime {
  const base: Partial<AntSwordRuntimeConfig> = {
    mcpServers: mcpServers.map(server => ({ ...server })),
    disabledSkills: [],
    rules: [],
  }
  const scope = ctx.settings.register(
    settingsNamespace(ANT_SWORD_SETTINGS_NAMESPACE),
    AntSwordRuntimeConfigSchema,
    { base, applies: 'live', validate: validateRuntimeConfig },
  )
  const mcp = new McpReconciler(ctx, pentestswarmApiKey)
  const controller = new RuntimeController(scope, [mcp, skillsReconciler, new RulesReconciler(ctx)])
  const stop = controller.start()
  ctx.effect(() => stop, 'ant-sword-runtime.controller')
  return { controller, mcp }
}
