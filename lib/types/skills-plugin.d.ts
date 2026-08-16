/**
 * Cordis function-plugin entry for the bundled reverse/CTF skill pack. Registers
 * the data-driven provider from `skills.ts` on the `ctx.skills` seam; the
 * catalog follows the shipped `skills/` directory contents.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/skills
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis plugin name. */
export declare const name = "ant-sword-skills";
/** The skill registry must be present before the provider can mount. */
export declare const inject: string[];
/**
 * Register the bundled skill provider. The registration disposes with ctx.
 * @param ctx - Cordis context carrying the skill registry.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=skills-plugin.d.ts.map