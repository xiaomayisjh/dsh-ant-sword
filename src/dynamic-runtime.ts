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
import { ThinkingPolicyRuntime } from './thinking-policy.ts'
import { SkillsReconciler } from './skill-runtime.ts'

export interface DynamicRuntime {
  controller: RuntimeController
  mcp: McpReconciler
  thinking: ThinkingPolicyRuntime
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
    thinkingPolicies: [],
    thinkingFallbacks: [],
  }
  const scope = ctx.settings.register(
    settingsNamespace(ANT_SWORD_SETTINGS_NAMESPACE),
    AntSwordRuntimeConfigSchema,
    { base, applies: 'live', validate: validateRuntimeConfig },
  )
  const mcp = new McpReconciler(ctx, pentestswarmApiKey)
  const controller = new RuntimeController(scope, [mcp, skillsReconciler, new RulesReconciler(ctx)])
  const thinking = new ThinkingPolicyRuntime(ctx, controller)
  const stopThinking = thinking.start()
  let capabilityGeneration = controller.snapshot().generation
  const stopCapabilityRefresh = controller.subscribe(snapshot => {
    if (snapshot.generation === capabilityGeneration) return
    capabilityGeneration = snapshot.generation
    thinking.clearCapabilities()
  })
  const stop = controller.start()
  ctx.effect(() => async () => {
    stopCapabilityRefresh()
    stopThinking()
    await stop()
  }, 'ant-sword-runtime.controller')
  return { controller, mcp, thinking }
}
