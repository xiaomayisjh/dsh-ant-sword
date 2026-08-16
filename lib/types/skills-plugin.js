/**
 * Cordis function-plugin entry for the bundled reverse/CTF skill pack. Registers
 * the data-driven provider from `skills.ts` on the `ctx.skills` seam; the
 * catalog follows the shipped `skills/` directory contents.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/skills
 */
import { skillProvider, SKILL_PROVIDER_NAME } from "./skills.js";
/** Cordis plugin name. */
export const name = SKILL_PROVIDER_NAME;
/** The skill registry must be present before the provider can mount. */
export const inject = ['skills'];
/**
 * Register the bundled skill provider. The registration disposes with ctx.
 * @param ctx - Cordis context carrying the skill registry.
 */
export function apply(ctx) {
    ctx.skills.registerProvider(() => skillProvider);
}
//# sourceMappingURL=skills-plugin.js.map