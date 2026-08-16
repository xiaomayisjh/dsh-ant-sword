/**
 * Copy snapshot provider: incremental directory snapshots with hardlink reuse
 * for workspaces that are not git repositories (or have an unborn HEAD).
 * Restore overwrites captured files only and never deletes; symlink traversal
 * out of the workspace is refused on both capture and restore.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/rewind/providers/copy
 */
import type { SnapshotProvider } from '../types.ts';
/** Create the copy provider bound to a snapshot root and exclusion segments. */
export declare function makeCopyProvider(snapshotDir: string, excludeGlobs: readonly string[]): SnapshotProvider;
//# sourceMappingURL=copy.d.ts.map