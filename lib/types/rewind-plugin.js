/**
 * Isolated rewind plugin entry: workspace snapshot capture and `/rewind` as
 * their own Cordis row. Rewind depends only on the base-profile services
 * (`sessions`, `storageDomain`, `commands`, `tools`), so a composition whose
 * MCP or Web rows are absent, disabled, or failed still loads checkpoints —
 * loading it through the bundle's main row would tie that availability to
 * skills/agents/webServer/subprocess/settings/systemPrompt instead.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/rewind
 */
import { applyRewind, RewindConfigSchema } from "./rewind/index.js";
/** Cordis plugin name. */
export const name = 'ant-sword-rewind';
/** Services required by workspace checkpoint capture and restoration. */
export const inject = ['sessions', 'storageDomain', 'commands', 'tools'];
/** Schemastery validation for the rewind plugin configuration. */
export const Config = RewindConfigSchema;
/**
 * Mount workspace checkpoint capture and the `/rewind` command.
 * @param ctx - plugin context carrying rewind's four required services.
 * @param config - validated rewind configuration.
 */
export function apply(ctx, config) {
    applyRewind(ctx, config);
}
//# sourceMappingURL=rewind-plugin.js.map