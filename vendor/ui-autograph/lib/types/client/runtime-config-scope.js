/** Official settings bridge with a loopback HTTP fallback for private namespaces. */
import { createSnapshotStore, } from '@deepseek-ai/dsh-client-runtime/client';
const ENDPOINT = '/ant-sword/runtime-config';
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isRuntimeConfig(value) {
    return isRecord(value)
        && Array.isArray(value.mcpServers)
        && Array.isArray(value.disabledSkills)
        && Array.isArray(value.rules);
}
function decodeView(value) {
    if (!isRecord(value) || !isRuntimeConfig(value.value))
        return undefined;
    if (!Number.isSafeInteger(value.revision) || value.revision < 0)
        return undefined;
    if (typeof value.writable !== 'boolean')
        return undefined;
    return {
        value: value.value,
        ...(isRecord(value.base) ? { base: value.base } : {}),
        ...(isRecord(value.user) ? { user: value.user } : {}),
        revision: value.revision,
        writable: value.writable,
    };
}
function initialSnapshot() {
    return {
        status: 'loading',
        value: undefined,
        base: undefined,
        user: undefined,
        revision: undefined,
        writable: false,
        mode: 'host',
    };
}
/**
 * Mirrors the official settings scope while available and otherwise speaks to
 * the owning plugin's loopback endpoint. Writes remain serialized and carry
 * the latest revision, matching the official scope's conflict behavior.
 */
export class RuntimeConfigScope {
    native;
    request;
    store;
    unsubscribeNative;
    tail = Promise.resolve();
    disposed = false;
    constructor(native, request = globalThis.fetch.bind(globalThis)) {
        this.native = native;
        this.request = request;
        this.store = createSnapshotStore(initialSnapshot());
        this.unsubscribeNative = native.subscribe(() => { this.syncNative(); });
        this.syncNative();
        void this.refresh();
    }
    getSnapshot() {
        return this.store.getSnapshot();
    }
    subscribe(listener) {
        return this.store.subscribe(listener);
    }
    set(field, value) {
        return this.write({ op: 'set', field, value });
    }
    unset(field) {
        return this.write({ op: 'unset', field });
    }
    refresh() {
        return this.enqueue(async () => {
            if (this.native.getSnapshot().status === 'ready') {
                this.syncNative();
                return;
            }
            try {
                const response = await this.request(ENDPOINT, { method: 'GET', cache: 'no-store' });
                if (!response.ok)
                    return;
                const view = decodeView(await response.json());
                if (view !== undefined)
                    this.accept(view);
            }
            catch {
                // Keep the last accepted value. The settings panel renders its existing
                // unavailable state when neither bridge can reach the local Host.
            }
        });
    }
    async dispose() {
        this.disposed = true;
        this.unsubscribeNative();
        await this.tail;
    }
    whenIdle() {
        return this.tail;
    }
    write(operation) {
        return this.enqueue(async () => {
            if (this.native.getSnapshot().status === 'ready') {
                if (operation.op === 'set')
                    await this.native.set(operation.field, operation.value);
                else
                    await this.native.unset(operation.field);
                this.syncNative();
                return;
            }
            const revision = this.store.getSnapshot().revision;
            try {
                const response = await this.request(ENDPOINT, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        op: operation.op,
                        field: operation.field,
                        ...(operation.op === 'set' ? { value: operation.value } : {}),
                        ...(revision === undefined ? {} : { expectedRevision: revision }),
                    }),
                });
                if (!response.ok) {
                    await this.reloadFallback();
                    return;
                }
                const view = decodeView(await response.json());
                if (view !== undefined)
                    this.accept(view);
            }
            catch {
                await this.reloadFallback();
            }
        });
    }
    enqueue(operation) {
        if (this.disposed)
            return Promise.resolve();
        const task = this.tail.then(async () => {
            if (!this.disposed)
                await operation();
        });
        this.tail = task.catch(() => undefined);
        return task;
    }
    syncNative() {
        const snapshot = this.native.getSnapshot();
        if (snapshot.status === 'ready')
            this.store.set(snapshot);
    }
    async reloadFallback() {
        try {
            const response = await this.request(ENDPOINT, { method: 'GET', cache: 'no-store' });
            if (!response.ok)
                return;
            const view = decodeView(await response.json());
            if (view !== undefined)
                this.accept(view);
        }
        catch {
            // Recovery is best-effort, matching the official scope's failed-read path.
        }
    }
    accept(view) {
        this.store.set({
            status: 'ready',
            value: view.value,
            base: view.base,
            user: view.user,
            revision: view.revision,
            writable: view.writable,
            mode: 'host',
        });
    }
}
//# sourceMappingURL=runtime-config-scope.js.map