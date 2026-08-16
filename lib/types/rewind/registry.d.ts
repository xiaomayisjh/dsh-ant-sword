/**
 * Snapshot provider registry: resolves `auto` / `git` / `copy` per workspace,
 * caching each provider's availability probe so a capture burst does not
 * re-probe git on every mutation.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/rewind/registry
 */
import type { ResolvedRewindConfig, SnapshotProvider } from './types.ts';
/** Resolves the snapshot provider for a workspace from the plugin config. */
export declare class SnapshotProviderRegistry {
    private readonly git;
    private readonly copy;
    private readonly probeCache;
    constructor(config: ResolvedRewindConfig);
    private probeGit;
    /**
     * Resolve the provider for `cwd`. `git` fails loud when unusable; `auto`
     * degrades to copy on non-git directories and unborn-HEAD repositories.
     */
    resolve(kind: 'auto' | 'git' | 'copy', cwd: string): Promise<SnapshotProvider>;
}
//# sourceMappingURL=registry.d.ts.map