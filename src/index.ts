/** Ant Sword Host plugin for DSH 0.2 scoped agent presets. */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import z from '@deepseek-ai/schemastery'
import { applyAutoLoop, AutoLoopConfigSchema } from './auto/index.ts'
import type { AutoLoopConfig } from './auto/index.ts'
import { applyExperience } from './auto/experience.ts'
import { applyModelAdaptation } from './auto/model-adaptation.ts'
import { applyRuntimeStatus } from './runtime-status.ts'
import { applyRuntimeConfigApi } from './runtime-config-api.ts'
import { applyThinkingPolicyApi } from './thinking-policy-api.ts'
import { applyInstallApi } from './installer/api.ts'
import { DEFAULT_MCP_SERVERS, McpServerSchema } from './mcp-servers.ts'
import type { McpServerConfig } from './mcp-servers.ts'
import { applyDynamicRuntime } from './dynamic-runtime.ts'
import { applySkillApi, SkillsReconciler } from './skill-runtime.ts'
import { reconcilePiAiReasoning, installPiAiAdaptiveThinking } from './pi-ai-reasoning.ts'
import {
  ChannelThinkingPolicySchema, RuntimeRuleSchema, SimulatedEffortsSchema,
  ThinkingFallbackPolicySchema,
} from './runtime-config.ts'
import type {
  AntSwordRuntimeConfig, ChannelThinkingPolicy, RuntimeRuleConfig,
  SimulatedEfforts, ThinkingFallbackPolicy,
} from './runtime-config.ts'

export const name = 'ant-sword-harness'

export const inject = [
  'skills', 'sessions', 'storageDomain', 'commands', 'tools', 'agents',
  'goals', 'llm', 'webServer', 'subprocess', 'settings', 'systemPrompt',
]

/** Loader-owned fields are editable through DSH 0.2 SettingsForms. */
export interface Config {
  autoLoop?: AutoLoopConfig
  mcpServers: Volatile<McpServerConfig[]>
  disabledSkills: Volatile<string[]>
  rules: Volatile<RuntimeRuleConfig[]>
  thinkingPolicies: Volatile<ChannelThinkingPolicy[]>
  thinkingFallbacks: Volatile<ThinkingFallbackPolicy[]>
  defaultThinkingFallback: Volatile<SimulatedEfforts | null | undefined>
  pentestswarmApiKey: Volatile<string | undefined>
}

export const Config = z.object({
  autoLoop: AutoLoopConfigSchema,
  mcpServers: z.array(McpServerSchema).default(DEFAULT_MCP_SERVERS.map(server => ({ ...server }))).volatile(),
  disabledSkills: z.array(z.string()).default([]).volatile(),
  rules: z.array(RuntimeRuleSchema).default([]).volatile(),
  thinkingPolicies: z.array(ChannelThinkingPolicySchema).default([]).volatile(),
  thinkingFallbacks: z.array(ThinkingFallbackPolicySchema).default([]).volatile(),
  // Omitted means the built-in fallback; explicit null disables it.
  defaultThinkingFallback: z.union([SimulatedEffortsSchema, z.const(null)]).volatile(),
  pentestswarmApiKey: z.string().role('secret').volatile(),
})

export function apply(ctx: Context, config: Config): void {
  const skillsReconciler = new SkillsReconciler()
  ctx.skills.registerProvider(control => skillsReconciler.provider(control))
  applyModelAdaptation(ctx)
  applyAutoLoop(ctx, config.autoLoop ?? {})
  if (config.autoLoop?.enabled !== false) {
    applyExperience(ctx, { stallThreshold: config.autoLoop?.stallThreshold ?? 3 })
  }

  const runtimeConfig = (): AntSwordRuntimeConfig => structuredClone({
    mcpServers: config.mcpServers.get(),
    disabledSkills: config.disabledSkills.get(),
    rules: config.rules.get(),
    thinkingPolicies: config.thinkingPolicies.get(),
    thinkingFallbacks: config.thinkingFallbacks.get(),
    defaultThinkingFallback: config.defaultThinkingFallback.get(),
  }) as AntSwordRuntimeConfig

  const runtime = applyDynamicRuntime(ctx, runtimeConfig(), () => config.pentestswarmApiKey.get(), skillsReconciler)
  ctx.on('loader/volatile-update', paths => {
    if (!paths.some(([field]) =>
      field === 'mcpServers' || field === 'disabledSkills' || field === 'rules'
      || field === 'thinkingPolicies' || field === 'thinkingFallbacks'
      || field === 'defaultThinkingFallback' || field === 'pentestswarmApiKey')) return
    void runtime.controller.update(runtimeConfig())
  })

  applyRuntimeStatus(ctx, runtime.controller, runtime.mcp)
  applyRuntimeConfigApi(ctx, runtime.controller)
  applyThinkingPolicyApi(ctx, runtime.thinking)
  applyInstallApi(ctx)
  applySkillApi(ctx, skillsReconciler)

  void reconcilePiAiReasoning(ctx).catch(() => undefined)
  const stopAdaptive = installPiAiAdaptiveThinking(ctx)
  ctx.effect(() => stopAdaptive, 'ant-sword-runtime.pi-ai-adaptive-thinking')
}
