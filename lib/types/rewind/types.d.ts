/**
 * Shared types for the self-contained rewind capability: workspace snapshots
 * captured before mutations and a `/rewind` command that restores files and
 * forks the session back to a checkpoint's turn boundary.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/rewind/types
 */
/** How one checkpoint's workspace bytes were captured. */
type SnapshotProviderKind = 'git' | 'copy';
/**
 * A durable checkpoint record. `ref` is provider-owned: a hex git object id
 * for the git provider, a snapshot-directory-relative token for the copy
 * provider. Only the owning provider interprets it.
 */
export interface CheckpointRecord {
    /** Unique checkpoint id (hex); addressable by any unique prefix. */
    readonly id: string;
    /** Session that owns this checkpoint. */
    readonly sessionId: string;
    /** Provider that captured it. */
    readonly provider: SnapshotProviderKind;
    /** Provider-owned snapshot reference. */
    readonly ref: string;
    /** Workspace absolute path the snapshot covers. */
    readonly cwd: string;
    /** What captured this checkpoint (an fs intent or a tool name). */
    readonly trigger: string;
    /** Files captured, when the provider can report a count. */
    readonly fileCount?: number;
    /** Incremental bytes this checkpoint added, for quota accounting. */
    readonly byteSize: number;
    /** Capture wall-clock time (ms since epoch). */
    readonly time: number;
    /** Turn the capture landed in, when known. */
    readonly turn?: number;
    /** Step the capture landed in, when known. */
    readonly step?: number;
    /** Last seq of the step the capture landed in, backfilled at `step/end`. */
    readonly stepEndSeq?: number;
    /** Fork boundary (a `turn/end` seq), backfilled at `turn/end`. */
    readonly forkSeq?: number;
    /** Whether this record is a pre-rewind guard checkpoint. */
    readonly guard?: boolean;
}
/** Plugin configuration. Every field is optional; defaults are documented per key. */
export interface RewindConfig {
    /** Master switch; `false` removes command and listeners. Default true. */
    readonly enabled?: boolean;
    /** Snapshot provider: `auto` (git if usable, else copy), `git`, or `copy`. Default `auto`. */
    readonly provider?: 'auto' | 'git' | 'copy';
    /** Git executable. Default `git`. */
    readonly gitBin?: string;
    /** Root for copy-provider snapshots. Default `<home>/.dsh/ant-sword-rewind`. */
    readonly snapshotDir?: string;
    /** Checkpoints kept per session (oldest pruned first). Default 50. */
    readonly maxSnapshots?: number;
    /** Global incremental-byte soft quota. Default 512 MiB. */
    readonly maxSnapshotBytes?: number;
    /** Prune when a turn ends. Default true. */
    readonly pruneOnTurnEnd?: boolean;
    /** Tool names treated as mutating at `tools/pre-execute`. */
    readonly mutationTools?: string[];
    /** Glob-ish segments the copy provider skips. */
    readonly excludeGlobs?: string[];
    /** Checkpoints listed by a bare `/rewind`. Default 10. */
    readonly listLimit?: number;
    /** Pre-rewind guard checkpoint: `warn` | `require` | `off`. Default `warn`. */
    readonly preRewindCheckpoint?: 'warn' | 'require' | 'off';
}
/** Resolved configuration with every default applied. */
export interface ResolvedRewindConfig {
    readonly enabled: boolean;
    readonly provider: 'auto' | 'git' | 'copy';
    readonly gitBin: string;
    readonly snapshotDir: string;
    readonly maxSnapshots: number;
    readonly maxSnapshotBytes: number;
    readonly pruneOnTurnEnd: boolean;
    readonly mutationTools: string[];
    readonly excludeGlobs: string[];
    readonly listLimit: number;
    readonly preRewindCheckpoint: 'warn' | 'require' | 'off';
}
/** Result of a provider capture. */
export interface CaptureResult {
    /** Provider-owned snapshot reference. */
    readonly ref: string;
    /** Files captured, when known. */
    readonly fileCount?: number;
    /** Incremental bytes added. */
    readonly byteSize: number;
}
/** A snapshot backend. Implementations must fail closed and never destroy state. */
export interface SnapshotProvider {
    /** Provider kind tag. */
    readonly kind: SnapshotProviderKind;
    /** Probe whether this provider can serve the workspace; cached per workspace by the registry. */
    readonly available: (cwd: string) => Promise<boolean>;
    /** Capture a snapshot of `cwd`; resolves its reference and incremental size. */
    readonly capture: (cwd: string, signal?: AbortSignal) => Promise<CaptureResult>;
    /** Restore the captured files into `cwd` (overwrite, never delete). */
    readonly restore: (cwd: string, ref: string, signal?: AbortSignal) => Promise<{
        restored: number;
    }>;
    /** Read-only impact of a restore: paths that would be overwritten, paths kept. */
    readonly preview: (cwd: string, ref: string) => Promise<{
        overwritten: string[];
        kept: string[];
    }>;
}
export {};
//# sourceMappingURL=types.d.ts.map