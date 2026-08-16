/**
 * Git snapshot provider: side-effect-free unreferenced objects via
 * `git stash create` / `git commit-tree`, restored worktree-only with explicit
 * paths. Never `reset --hard`, never `clean`, never touch the index or history.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/rewind/providers/git
 */
import type { SnapshotProvider } from '../types.ts';
/** Create the git provider bound to a `gitBin`. */
export declare function makeGitProvider(gitBin: string): SnapshotProvider;
//# sourceMappingURL=git.d.ts.map