/**
 * Snapshot provider registry: resolves `auto` / `git` / `copy` per workspace,
 * caching each provider's availability probe so a capture burst does not
 * re-probe git on every mutation.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/rewind/registry
 */

import type { ResolvedRewindConfig, SnapshotProvider } from './types.ts'
import { makeGitProvider } from './providers/git.ts'
import { makeCopyProvider } from './providers/copy.ts'

/** Resolves the snapshot provider for a workspace from the plugin config. */
export class SnapshotProviderRegistry {
  private readonly git: SnapshotProvider
  private readonly copy: SnapshotProvider
  private readonly probeCache = new Map<string, Promise<boolean>>()

  constructor(config: ResolvedRewindConfig) {
    this.git = makeGitProvider(config.gitBin)
    this.copy = makeCopyProvider(config.snapshotDir, config.excludeGlobs)
  }

  private probeGit(cwd: string): Promise<boolean> {
    let cached = this.probeCache.get(cwd)
    if (cached === undefined) {
      cached = this.git.available(cwd)
      this.probeCache.set(cwd, cached)
    }
    return cached
  }

  /**
   * Resolve the provider for `cwd`. `git` fails loud when unusable; `auto`
   * degrades to copy on non-git directories and unborn-HEAD repositories.
   */
  async resolve(kind: 'auto' | 'git' | 'copy', cwd: string): Promise<SnapshotProvider> {
    if (kind === 'copy') return this.copy
    if (kind === 'git') {
      if (await this.probeGit(cwd)) return this.git
      throw new Error(`snapshot provider "git" is not usable for workspace ${cwd}`)
    }
    return (await this.probeGit(cwd)) ? this.git : this.copy
  }
}
