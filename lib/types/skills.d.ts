/**
 * Bundled reverse/CTF skill pack provider.
 *
 * Data-driven: walks the `skills/` tree shipped beside the built `lib/`, reads
 * every `SKILL.md`, parses its frontmatter, and exposes each as a bundled
 * candidate on the `ctx.skills` seam. No hand-maintained candidate list — the
 * catalog follows the directory contents.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/skills
 */
import { type SkillProvider } from '@deepseek-ai/dsh-skill';
/** The bundled skill provider exposed on the `ctx.skills` seam. */
export declare const skillProvider: SkillProvider;
/** Test hook: drop the memoized catalog so a re-scan observes new files. */
export declare function resetSkillCatalogCache(): void;
//# sourceMappingURL=skills.d.ts.map