/** Loader-owned runtime reconciliation wiring. */

import type { Context } from '@deepseek-ai/cordis'
import { McpReconciler } from './mcp-reconciler.ts'
import { RulesReconciler } from './rules-reconciler.ts'
import { RuntimeController } from './runtime-config.ts'
import type { AntSwordRuntimeConfig } from './runtime-config.ts'
import { ThinkingPolicyRuntime } from './thinking-policy.ts'
import { SkillsReconciler } from './skill-runtime.ts'

export interface DynamicRuntime {
  controller: RuntimeController
  mcp: McpReconciler
  thinking: ThinkingPolicyRuntime
}

export function applyDynamicRuntime(
  ctx: Context,
  initialConfig: AntSwordRuntimeConfig,
  getPentestswarmApiKey: () => string | undefined = () => undefined,
  skillsReconciler: SkillsReconciler = new SkillsReconciler(),
): DynamicRuntime {
  const mcp = new McpReconciler(ctx, getPentestswarmApiKey)
  const controller = new RuntimeController(initialConfig, [mcp, skillsReconciler, new RulesReconciler(ctx)])
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
