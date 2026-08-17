/** Bounded, cancellable transaction engine for controlled installations. */
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import type { InstallComponent, InstallerArchitecture, InstallerPlatform, SourcePolicy } from './catalog.ts';
export type InstallOperationPhase = 'queued' | 'probing' | 'downloading' | 'verifying' | 'installing' | 'configuring' | 'external-action-required' | 'restart-required' | 'succeeded' | 'failed' | 'cancelled';
export interface InstallOperationSnapshot {
    id: string;
    componentId: string;
    sourcePolicy: SourcePolicy;
    phase: InstallOperationPhase;
    progress: number;
    attempt: number;
    logs: readonly string[];
    error?: string;
}
export interface InstallRunner {
    probe(component: InstallComponent, signal: AbortSignal): Promise<boolean>;
    command(executable: string, args: readonly string[], timeoutMs: number, signal: AbortSignal): Promise<string>;
    download(url: string, target: string, timeoutMs: number, signal: AbortSignal): Promise<void>;
    verifySha256(path: string, expected: string): Promise<void>;
    resolveOfficialDigest(apiUrl: string, assetName: string, signal: AbortSignal): Promise<string>;
    commitArtifact(component: InstallComponent, path: string, signal: AbortSignal): Promise<void>;
    rollback(component: InstallComponent): Promise<void>;
    refreshEnvironment(): Promise<void>;
}
export declare class InstallerError extends Error {
    readonly retryable: boolean;
    constructor(message: string, retryable: boolean);
}
export declare class InstallManager {
    private readonly runner;
    private readonly platform;
    private readonly architecture;
    private readonly catalog;
    private readonly random;
    private readonly operations;
    private readonly locks;
    constructor(runner: InstallRunner, platform: InstallerPlatform, architecture: InstallerArchitecture, catalog?: readonly InstallComponent[], random?: () => number);
    start(componentId: string, sourcePolicy: SourcePolicy): InstallOperationSnapshot;
    get(id: string): InstallOperationSnapshot | undefined;
    list(): InstallOperationSnapshot[];
    cancel(id: string): boolean;
    wait(id: string): Promise<InstallOperationSnapshot | undefined>;
    private publish;
    private execute;
    private executeStep;
}
export declare function createSubprocessInstallRunner(subprocess: SubprocessRuntime): InstallRunner;
//# sourceMappingURL=transaction.d.ts.map