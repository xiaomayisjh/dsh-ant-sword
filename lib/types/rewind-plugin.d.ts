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
import type { Context } from '@deepseek-ai/cordis';
import type { RewindPluginConfig } from './rewind/index.ts';
/** Cordis plugin name. */
export declare const name = "ant-sword-rewind";
/** Services required by workspace checkpoint capture and restoration. */
export declare const inject: string[];
/** Rewind plugin configuration. */
export type Config = RewindPluginConfig;
/** Schemastery validation for the rewind plugin configuration. */
export declare const Config: import("@deepseek-ai/schemastery").default<import("./rewind/types.ts").RewindConfig>;
/**
 * Mount workspace checkpoint capture and the `/rewind` command.
 * @param ctx - plugin context carrying rewind's four required services.
 * @param config - validated rewind configuration.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=rewind-plugin.d.ts.map