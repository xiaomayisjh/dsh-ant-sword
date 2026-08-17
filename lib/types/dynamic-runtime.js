/** Settings registration and runtime reconciliation wiring. */
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { McpReconciler } from "./mcp-reconciler.js";
import { RulesReconciler } from "./rules-reconciler.js";
import { ANT_SWORD_SETTINGS_NAMESPACE, AntSwordRuntimeConfigSchema, RuntimeController, validateRuntimeConfig, } from "./runtime-config.js";
import { SkillsReconciler } from "./skill-runtime.js";
export function applyDynamicRuntime(ctx, mcpServers, pentestswarmApiKey, skillsReconciler = new SkillsReconciler()) {
    const base = {
        mcpServers: mcpServers.map(server => ({ ...server })),
        disabledSkills: [],
        rules: [],
    };
    const scope = ctx.settings.register(settingsNamespace(ANT_SWORD_SETTINGS_NAMESPACE), AntSwordRuntimeConfigSchema, { base, applies: 'live', validate: validateRuntimeConfig });
    const mcp = new McpReconciler(ctx, pentestswarmApiKey);
    const controller = new RuntimeController(scope, [mcp, skillsReconciler, new RulesReconciler(ctx)]);
    const stop = controller.start();
    ctx.effect(() => stop, 'ant-sword-runtime.controller');
    return { controller, mcp };
}
//# sourceMappingURL=dynamic-runtime.js.map