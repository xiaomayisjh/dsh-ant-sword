/**
 * Snapshot provider registry: resolves `auto` / `git` / `copy` per workspace,
 * caching each provider's availability probe so a capture burst does not
 * re-probe git on every mutation.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/rewind/registry
 */
import { makeGitProvider } from "./providers/git.js";
import { makeCopyProvider } from "./providers/copy.js";
/** Resolves the snapshot provider for a workspace from the plugin config. */
export class SnapshotProviderRegistry {
    git;
    copy;
    probeCache = new Map();
    constructor(config) {
        this.git = makeGitProvider(config.gitBin);
        this.copy = makeCopyProvider(config.snapshotDir, config.excludeGlobs);
    }
    probeGit(cwd) {
        let cached = this.probeCache.get(cwd);
        if (cached === undefined) {
            cached = this.git.available(cwd);
            this.probeCache.set(cwd, cached);
        }
        return cached;
    }
    /**
     * Resolve the provider for `cwd`. `git` fails loud when unusable; `auto`
     * degrades to copy on non-git directories and unborn-HEAD repositories.
     */
    async resolve(kind, cwd) {
        if (kind === 'copy')
            return this.copy;
        if (kind === 'git') {
            if (await this.probeGit(cwd))
                return this.git;
            throw new Error(`snapshot provider "git" is not usable for workspace ${cwd}`);
        }
        return (await this.probeGit(cwd)) ? this.git : this.copy;
    }
}
//# sourceMappingURL=registry.js.map