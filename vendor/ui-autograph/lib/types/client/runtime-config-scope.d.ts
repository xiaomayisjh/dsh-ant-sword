/** Official settings bridge with a loopback HTTP fallback for private namespaces. */
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client';
import type { RuntimeConfigValue } from './runtime-config-types.ts';
interface RuntimeApplyFailure {
    reconciler: string;
    message: string;
    generation: number;
}
export interface RuntimeApplySnapshot {
    desired?: RuntimeConfigValue;
    applied?: RuntimeConfigValue;
    generation: number;
    desiredGeneration: number;
    applying: boolean;
    inSync: boolean;
    lastFailure?: RuntimeApplyFailure;
}
interface FetchResponse {
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}
export type RuntimeConfigFetch = (input: string, init?: RequestInit) => Promise<FetchResponse>;
/**
 * Mirrors the official settings scope while available and otherwise speaks to
 * the owning plugin's loopback endpoint. Writes remain serialized and carry
 * the latest revision, matching the official scope's conflict behavior.
 */
export declare class RuntimeConfigScope implements SettingsScope<RuntimeConfigValue> {
    private readonly native;
    private readonly request;
    private readonly store;
    private readonly runtimeStore;
    private readonly unsubscribeNative;
    private tail;
    private disposed;
    constructor(native: SettingsScope<RuntimeConfigValue>, request?: RuntimeConfigFetch);
    getSnapshot(): SettingsScopeSnapshot<RuntimeConfigValue>;
    subscribe(listener: () => void): () => void;
    getRuntimeSnapshot(): RuntimeApplySnapshot;
    subscribeRuntime(listener: () => void): () => void;
    set(field: string, value: unknown): Promise<void>;
    unset(field: string): Promise<void>;
    refresh(): Promise<void>;
    dispose(): Promise<void>;
    whenIdle(): Promise<void>;
    private write;
    private enqueue;
    private syncNative;
    private reloadFallback;
    private accept;
}
export {};
//# sourceMappingURL=runtime-config-scope.d.ts.map