/** Bounded, cancellable transaction engine for controlled installations. */
/* eslint-disable @stylistic/max-len -- subprocess argv and bounded transport contracts remain auditable inline. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { INSTALL_CATALOG } from "./catalog.js";
import { orderSources, planInstallation } from "./planner.js";
export class InstallerError extends Error {
    retryable;
    constructor(message, retryable) {
        super(message);
        this.retryable = retryable;
        this.name = 'InstallerError';
    }
}
const MAX_LOG_BYTES = 64 * 1024;
const MAX_ATTEMPTS_PER_SOURCE = 2;
function boundedLogs(logs, next) {
    const entries = [...logs, next];
    while (Buffer.byteLength(entries.join('\n'), 'utf8') > MAX_LOG_BYTES)
        entries.shift();
    return entries;
}
function abortError(signal) {
    return signal.reason instanceof Error ? signal.reason : new InstallerError('installation cancelled', false);
}
function abortableDelay(milliseconds, signal) {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(abortError(signal));
            return;
        }
        const timer = setTimeout(resolve, milliseconds);
        signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(abortError(signal));
        }, { once: true });
    });
}
export class InstallManager {
    runner;
    platform;
    architecture;
    catalog;
    random;
    operations = new Map();
    locks = new Set();
    constructor(runner, platform, architecture, catalog = INSTALL_CATALOG, random = Math.random) {
        this.runner = runner;
        this.platform = platform;
        this.architecture = architecture;
        this.catalog = catalog;
        this.random = random;
    }
    start(componentId, sourcePolicy) {
        if (this.locks.has(componentId))
            throw new InstallerError(`component "${componentId}" already has an active installation`, false);
        const plan = planInstallation(componentId, this.platform, this.architecture, this.catalog);
        const id = randomUUID();
        const controller = new AbortController();
        const snapshot = { id, componentId, sourcePolicy, phase: 'queued', progress: 0, attempt: 0, logs: [] };
        this.locks.add(componentId);
        const done = this.execute(snapshot, plan, controller.signal).finally(() => this.locks.delete(componentId));
        this.operations.set(id, { snapshot, controller, done });
        return structuredClone(snapshot);
    }
    get(id) {
        const operation = this.operations.get(id);
        return operation === undefined ? undefined : structuredClone(operation.snapshot);
    }
    list() {
        return [...this.operations.values()].map(operation => structuredClone(operation.snapshot));
    }
    cancel(id) {
        const operation = this.operations.get(id);
        if (operation === undefined || ['succeeded', 'failed', 'cancelled'].includes(operation.snapshot.phase))
            return false;
        operation.controller.abort(new InstallerError('installation cancelled', false));
        return true;
    }
    async wait(id) {
        const operation = this.operations.get(id);
        if (operation === undefined)
            return undefined;
        await operation.done;
        return this.get(id);
    }
    publish(snapshot, patch, log) {
        Object.assign(snapshot, patch);
        if (log !== undefined)
            snapshot.logs = boundedLogs(snapshot.logs, log);
    }
    async execute(snapshot, plan, signal) {
        const committed = [];
        try {
            for (const [index, { component, variant }] of plan.entries()) {
                this.publish(snapshot, { phase: 'probing', progress: index / plan.length }, `Probing ${component.label}`);
                if (await this.runner.probe(component, signal))
                    continue;
                for (const step of variant.steps)
                    await this.executeStep(snapshot, component, step, snapshot.sourcePolicy, signal);
                await this.runner.refreshEnvironment();
                if (variant.steps.some(step => step.kind !== 'external-action') && !await this.runner.probe(component, signal)) {
                    throw new InstallerError(`post-install probe failed for "${component.id}"`, false);
                }
                committed.push(component);
            }
            const targetEntry = plan.at(-1);
            if (targetEntry === undefined)
                throw new InstallerError('installation plan is empty', false);
            const target = targetEntry.component;
            const requiresExternalAction = plan.some(entry => entry.variant.steps.some(step => step.kind === 'external-action'));
            this.publish(snapshot, {
                phase: requiresExternalAction ? 'external-action-required' : target.restartRequired ? 'restart-required' : 'succeeded',
                progress: 1,
            }, requiresExternalAction ? `Additional action required for ${target.label}` : `Installed ${target.label}`);
        }
        catch (error) {
            await Promise.allSettled(committed.reverse().map(component => this.runner.rollback(component)));
            if (signal.aborted) {
                this.publish(snapshot, { phase: 'cancelled', error: 'installation cancelled' }, 'Installation cancelled');
            }
            else {
                const message = error instanceof Error ? error.message : String(error);
                this.publish(snapshot, { phase: 'failed', error: message }, message);
            }
        }
    }
    async executeStep(snapshot, component, step, policy, signal) {
        this.publish(snapshot, { phase: step.phase });
        if (step.kind === 'external-action') {
            this.publish(snapshot, {}, step.message);
            return;
        }
        if (step.kind === 'command') {
            const output = await this.runner.command(step.executable, step.args, step.timeoutMs, signal);
            this.publish(snapshot, {}, output);
            return;
        }
        const staging = join(tmpdir(), 'dsh-ant-sword-installer', snapshot.id);
        await mkdir(staging, { recursive: true });
        const target = join(staging, step.targetName);
        try {
            const sources = orderSources(step.sources, policy);
            let lastError;
            for (const source of sources) {
                for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_SOURCE; attempt += 1) {
                    this.publish(snapshot, { attempt }, `Downloading from ${source.id}, attempt ${String(attempt)}`);
                    try {
                        await this.runner.download(source.url, target, step.timeoutMs, signal);
                        const expectedSha256 = step.sha256 ?? (step.officialDigest === undefined
                            ? undefined
                            : await this.runner.resolveOfficialDigest(step.officialDigest.apiUrl, step.officialDigest.assetName, signal));
                        if (expectedSha256 === undefined)
                            throw new InstallerError(`download step for "${component.id}" has no trusted digest`, false);
                        this.publish(snapshot, { phase: 'verifying' }, `Verifying ${step.targetName}`);
                        await this.runner.verifySha256(target, expectedSha256);
                        this.publish(snapshot, { phase: 'installing' }, `Committing ${component.label}`);
                        await this.runner.commitArtifact(component, target, signal);
                        return;
                    }
                    catch (error) {
                        lastError = error;
                        if (!(error instanceof InstallerError) || !error.retryable)
                            throw error;
                        if (attempt < MAX_ATTEMPTS_PER_SOURCE)
                            await abortableDelay(250 * 2 ** (attempt - 1) + Math.floor(this.random() * 100), signal);
                    }
                }
            }
            if (lastError instanceof Error)
                throw lastError;
            throw new InstallerError('all download sources failed', true);
        }
        finally {
            await rm(staging, { recursive: true, force: true });
        }
    }
}
export function createSubprocessInstallRunner(subprocess) {
    const backups = new Map();
    const toolsRoot = join(homedir(), '.dsh', 'tools');
    const command = async (executable, args, timeoutMs, signal) => {
        const resolved = await subprocess.resolveExecutable(executable, undefined, signal);
        const deadline = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
        const handle = subprocess.spawn({
            argv: [resolved, ...args], cwd: process.cwd(), signal: deadline, graceMs: 2_000,
            stdio: { stdin: 'ignore', stdout: { maxBytes: 32 * 1024 }, stderr: { maxBytes: 32 * 1024 } },
        });
        const outcome = await handle.done;
        const stdout = handle.collected.stdout?.readFrom(0).text ?? '';
        const stderr = handle.collected.stderr?.readFrom(0).text ?? '';
        if (outcome.exitCode !== 0)
            throw new InstallerError(stderr || `${executable} exited with ${String(outcome.exitCode)}`, false);
        return stdout.trim();
    };
    return {
        probe: async (component, signal) => {
            if (component.probe.kind === 'http') {
                try {
                    const response = await fetch(component.probe.url, { signal: AbortSignal.any([signal, AbortSignal.timeout(2_000)]), redirect: 'error' });
                    return response.ok;
                }
                catch {
                    return false;
                }
            }
            try {
                await command(component.probe.command, component.probe.args, 5_000, signal);
                return true;
            }
            catch {
                return false;
            }
        },
        command,
        download: async (url, target, timeoutMs, signal) => {
            let response;
            try {
                response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]), redirect: 'error' });
            }
            catch (error) {
                throw new InstallerError(error instanceof Error ? error.message : String(error), true);
            }
            if (!response.ok)
                throw new InstallerError(`download failed with HTTP ${String(response.status)}`, response.status >= 500 || response.status === 408 || response.status === 429);
            const { writeFile } = await import('node:fs/promises');
            await writeFile(target, Buffer.from(await response.arrayBuffer()));
        },
        verifySha256: async (path, expected) => {
            const actual = createHash('sha256').update(await readFile(path)).digest('hex');
            if (actual.toLowerCase() !== expected.toLowerCase())
                throw new InstallerError(`SHA-256 mismatch for ${path}`, false);
        },
        resolveOfficialDigest: async (apiUrl, assetName, signal) => {
            const response = await fetch(apiUrl, {
                signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
                redirect: 'error',
                headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-ant-sword-installer' },
            });
            if (!response.ok)
                throw new InstallerError(`official digest request failed with HTTP ${String(response.status)}`, response.status >= 500 || response.status === 429);
            const release = await response.json();
            const digest = release.assets?.find(asset => asset.name === assetName)?.digest;
            if (typeof digest !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(digest))
                throw new InstallerError(`official release has no SHA-256 digest for ${assetName}`, false);
            return digest.slice('sha256:'.length);
        },
        commitArtifact: async (component, path, signal) => {
            if (component.installDirectory === undefined)
                throw new InstallerError(`component "${component.id}" has no managed install directory`, false);
            await mkdir(toolsRoot, { recursive: true });
            const extracted = join(toolsRoot, `.${component.id}-${randomUUID()}`);
            const target = join(toolsRoot, component.installDirectory);
            const backup = join(toolsRoot, `.${component.id}-backup-${randomUUID()}`);
            await mkdir(extracted, { recursive: true });
            if (process.platform === 'win32') {
                await command('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force', path, extracted], 10 * 60_000, signal);
            }
            else {
                await command('unzip', ['-q', path, '-d', extracted], 10 * 60_000, signal);
            }
            const entries = await readdir(extracted, { withFileTypes: true });
            const firstEntry = entries[0];
            const source = entries.length === 1 && firstEntry?.isDirectory() === true
                ? join(extracted, firstEntry.name)
                : extracted;
            try {
                await rename(target, backup);
                backups.set(component.id, backup);
            }
            catch (error) {
                const code = error instanceof Error && 'code' in error ? error.code : undefined;
                if (code !== 'ENOENT')
                    throw error;
            }
            try {
                await rename(source, target);
            }
            catch (error) {
                const previous = backups.get(component.id);
                if (previous !== undefined)
                    await rename(previous, target);
                throw error;
            }
            finally {
                if (source !== extracted)
                    await rm(extracted, { recursive: true, force: true });
            }
        },
        rollback: async (component) => {
            if (component.installDirectory === undefined)
                return;
            const target = join(toolsRoot, component.installDirectory);
            await rm(target, { recursive: true, force: true });
            const backup = backups.get(component.id);
            if (backup !== undefined) {
                await rename(backup, target);
                backups.delete(component.id);
            }
        },
        refreshEnvironment: () => Promise.resolve(),
    };
}
//# sourceMappingURL=transaction.js.map