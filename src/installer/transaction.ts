/** Bounded, cancellable transaction engine for controlled installations. */

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import type { InstallComponent, InstallerArchitecture, InstallerPlatform, InstallStep, SourcePolicy } from './catalog.ts'
import { INSTALL_CATALOG } from './catalog.ts'
import { orderSources, planInstallation } from './planner.ts'

export type InstallOperationPhase = 'queued' | 'probing' | 'downloading' | 'verifying' | 'installing' | 'configuring' | 'external-action-required' | 'restart-required' | 'succeeded' | 'failed' | 'cancelled'

export interface InstallOperationSnapshot {
  id: string
  componentId: string
  sourcePolicy: SourcePolicy
  phase: InstallOperationPhase
  progress: number
  attempt: number
  logs: readonly string[]
  error?: string
}

export interface InstallRunner {
  probe(component: InstallComponent, signal: AbortSignal): Promise<boolean>
  command(executable: string, args: readonly string[], timeoutMs: number, signal: AbortSignal): Promise<string>
  download(url: string, target: string, timeoutMs: number, signal: AbortSignal): Promise<void>
  verifySha256(path: string, expected: string): Promise<void>
  resolveOfficialDigest(apiUrl: string, assetName: string, signal: AbortSignal): Promise<string>
  commitArtifact(component: InstallComponent, path: string, signal: AbortSignal): Promise<void>
  rollback(component: InstallComponent): Promise<void>
  refreshEnvironment(): Promise<void>
}

export class InstallerError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message)
    this.name = 'InstallerError'
  }
}

const MAX_LOG_BYTES = 64 * 1024
const MAX_ATTEMPTS_PER_SOURCE = 2

function boundedLogs(logs: readonly string[], next: string): string[] {
  const entries = [...logs, next]
  while (Buffer.byteLength(entries.join('\n'), 'utf8') > MAX_LOG_BYTES) entries.shift()
  return entries
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(resolve, milliseconds)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}

export class InstallManager {
  private readonly operations = new Map<string, { snapshot: InstallOperationSnapshot; controller: AbortController; done: Promise<void> }>()
  private readonly locks = new Set<string>()

  constructor(
    private readonly runner: InstallRunner,
    private readonly platform: InstallerPlatform,
    private readonly architecture: InstallerArchitecture,
    private readonly catalog: readonly InstallComponent[] = INSTALL_CATALOG,
    private readonly random: () => number = Math.random,
  ) {}

  start(componentId: string, sourcePolicy: SourcePolicy): InstallOperationSnapshot {
    if (this.locks.has(componentId)) throw new InstallerError(`component "${componentId}" already has an active installation`, false)
    const plan = planInstallation(componentId, this.platform, this.architecture, this.catalog)
    const id = randomUUID()
    const controller = new AbortController()
    const snapshot: InstallOperationSnapshot = { id, componentId, sourcePolicy, phase: 'queued', progress: 0, attempt: 0, logs: [] }
    this.locks.add(componentId)
    const done = this.execute(snapshot, plan, controller.signal).finally(() => this.locks.delete(componentId))
    this.operations.set(id, { snapshot, controller, done })
    return this.get(id)!
  }

  get(id: string): InstallOperationSnapshot | undefined {
    const operation = this.operations.get(id)
    return operation === undefined ? undefined : structuredClone(operation.snapshot)
  }

  list(): InstallOperationSnapshot[] {
    return [...this.operations.values()].map(operation => structuredClone(operation.snapshot))
  }

  cancel(id: string): boolean {
    const operation = this.operations.get(id)
    if (operation === undefined || ['succeeded', 'failed', 'cancelled'].includes(operation.snapshot.phase)) return false
    operation.controller.abort(new InstallerError('installation cancelled', false))
    return true
  }

  async wait(id: string): Promise<InstallOperationSnapshot | undefined> {
    const operation = this.operations.get(id)
    if (operation === undefined) return undefined
    await operation.done
    return this.get(id)
  }

  private publish(snapshot: InstallOperationSnapshot, patch: Partial<InstallOperationSnapshot>, log?: string): void {
    Object.assign(snapshot, patch)
    if (log !== undefined) snapshot.logs = boundedLogs(snapshot.logs, log)
  }

  private async execute(snapshot: InstallOperationSnapshot, plan: ReturnType<typeof planInstallation>, signal: AbortSignal): Promise<void> {
    const committed: InstallComponent[] = []
    try {
      for (let index = 0; index < plan.length; index += 1) {
        const { component, variant } = plan[index]!
        this.publish(snapshot, { phase: 'probing', progress: index / plan.length }, `Probing ${component.label}`)
        if (await this.runner.probe(component, signal)) continue
        for (const step of variant.steps) await this.executeStep(snapshot, component, step, snapshot.sourcePolicy, signal)
        await this.runner.refreshEnvironment()
        if (variant.steps.some(step => step.kind !== 'external-action') && !await this.runner.probe(component, signal)) {
          throw new InstallerError(`post-install probe failed for "${component.id}"`, false)
        }
        committed.push(component)
      }
      const target = plan.at(-1)!.component
      const requiresExternalAction = plan.some(entry => entry.variant.steps.some(step => step.kind === 'external-action'))
      this.publish(snapshot, {
        phase: requiresExternalAction ? 'external-action-required' : target.restartRequired ? 'restart-required' : 'succeeded',
        progress: 1,
      }, requiresExternalAction ? `Additional action required for ${target.label}` : `Installed ${target.label}`)
    } catch (error) {
      await Promise.allSettled(committed.reverse().map(component => this.runner.rollback(component)))
      if (signal.aborted) {
        this.publish(snapshot, { phase: 'cancelled', error: 'installation cancelled' }, 'Installation cancelled')
      } else {
        const message = error instanceof Error ? error.message : String(error)
        this.publish(snapshot, { phase: 'failed', error: message }, message)
      }
    }
  }

  private async executeStep(snapshot: InstallOperationSnapshot, component: InstallComponent, step: InstallStep, policy: SourcePolicy, signal: AbortSignal): Promise<void> {
    this.publish(snapshot, { phase: step.phase })
    if (step.kind === 'external-action') {
      this.publish(snapshot, {}, step.message)
      return
    }
    if (step.kind === 'command') {
      const output = await this.runner.command(step.executable, step.args, step.timeoutMs, signal)
      this.publish(snapshot, {}, output)
      return
    }
    const staging = join(tmpdir(), 'dsh-ant-sword-installer', snapshot.id)
    await mkdir(staging, { recursive: true })
    const target = join(staging, step.targetName)
    try {
      const sources = orderSources(step.sources, policy)
      let lastError: unknown
      for (const source of sources) {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_SOURCE; attempt += 1) {
          this.publish(snapshot, { attempt }, `Downloading from ${source.id}, attempt ${String(attempt)}`)
          try {
            await this.runner.download(source.url, target, step.timeoutMs, signal)
            const expectedSha256 = step.sha256 ?? (step.officialDigest === undefined
              ? undefined
              : await this.runner.resolveOfficialDigest(step.officialDigest.apiUrl, step.officialDigest.assetName, signal))
            if (expectedSha256 === undefined) throw new InstallerError(`download step for "${component.id}" has no trusted digest`, false)
            this.publish(snapshot, { phase: 'verifying' }, `Verifying ${step.targetName}`)
            await this.runner.verifySha256(target, expectedSha256)
            this.publish(snapshot, { phase: 'installing' }, `Committing ${component.label}`)
            await this.runner.commitArtifact(component, target, signal)
            return
          } catch (error) {
            lastError = error
            if (!(error instanceof InstallerError) || !error.retryable) throw error
            if (attempt < MAX_ATTEMPTS_PER_SOURCE) await abortableDelay(250 * 2 ** (attempt - 1) + Math.floor(this.random() * 100), signal)
          }
        }
      }
      throw lastError ?? new InstallerError('all download sources failed', true)
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  }
}

export function createSubprocessInstallRunner(subprocess: SubprocessRuntime): InstallRunner {
  const backups = new Map<string, string>()
  const toolsRoot = join(homedir(), '.dsh', 'tools')
  const command = async (executable: string, args: readonly string[], timeoutMs: number, signal: AbortSignal): Promise<string> => {
    const resolved = await subprocess.resolveExecutable(executable, undefined, signal)
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
    const handle = subprocess.spawn({
      argv: [resolved, ...args], cwd: process.cwd(), signal: deadline, graceMs: 2_000,
      stdio: { stdin: 'ignore', stdout: { maxBytes: 32 * 1024 }, stderr: { maxBytes: 32 * 1024 } },
    })
    const outcome = await handle.done
    const stdout = handle.collected.stdout?.readFrom(0).text ?? ''
    const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
    if (outcome.exitCode !== 0) throw new InstallerError(stderr || `${executable} exited with ${String(outcome.exitCode)}`, false)
    return stdout.trim()
  }
  return {
    probe: async (component, signal) => {
      if (component.probe.kind === 'http') {
        try {
          const response = await fetch(component.probe.url, { signal: AbortSignal.any([signal, AbortSignal.timeout(2_000)]), redirect: 'error' })
          return response.ok
        } catch {
          return false
        }
      }
      try {
        await command(component.probe.command, component.probe.args, 5_000, signal)
        return true
      } catch {
        return false
      }
    },
    command,
    download: async (url, target, timeoutMs, signal) => {
      let response: Response
      try {
        response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]), redirect: 'error' })
      } catch (error) {
        throw new InstallerError(error instanceof Error ? error.message : String(error), true)
      }
      if (!response.ok) throw new InstallerError(`download failed with HTTP ${String(response.status)}`, response.status >= 500 || response.status === 408 || response.status === 429)
      const { writeFile } = await import('node:fs/promises')
      await writeFile(target, Buffer.from(await response.arrayBuffer()))
    },
    verifySha256: async (path, expected) => {
      const actual = createHash('sha256').update(await readFile(path)).digest('hex')
      if (actual.toLowerCase() !== expected.toLowerCase()) throw new InstallerError(`SHA-256 mismatch for ${path}`, false)
    },
    resolveOfficialDigest: async (apiUrl, assetName, signal) => {
      const response = await fetch(apiUrl, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
        redirect: 'error',
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-ant-sword-installer' },
      })
      if (!response.ok) throw new InstallerError(`official digest request failed with HTTP ${String(response.status)}`, response.status >= 500 || response.status === 429)
      const release = await response.json() as { assets?: Array<{ name?: string; digest?: string | null }> }
      const digest = release.assets?.find(asset => asset.name === assetName)?.digest
      if (typeof digest !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(digest)) throw new InstallerError(`official release has no SHA-256 digest for ${assetName}`, false)
      return digest.slice('sha256:'.length)
    },
    commitArtifact: async (component, path, signal) => {
      if (component.installDirectory === undefined) throw new InstallerError(`component "${component.id}" has no managed install directory`, false)
      await mkdir(toolsRoot, { recursive: true })
      const extracted = join(toolsRoot, `.${component.id}-${randomUUID()}`)
      const target = join(toolsRoot, component.installDirectory)
      const backup = join(toolsRoot, `.${component.id}-backup-${randomUUID()}`)
      await mkdir(extracted, { recursive: true })
      if (process.platform === 'win32') {
        await command('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force', path, extracted], 10 * 60_000, signal)
      } else {
        await command('unzip', ['-q', path, '-d', extracted], 10 * 60_000, signal)
      }
      const entries = await readdir(extracted, { withFileTypes: true })
      const source = entries.length === 1 && entries[0]!.isDirectory() ? join(extracted, entries[0]!.name) : extracted
      try {
        await rename(target, backup)
        backups.set(component.id, backup)
      } catch (error) {
        const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined
        if (code !== 'ENOENT') throw error
      }
      try {
        await rename(source, target)
      } catch (error) {
        const previous = backups.get(component.id)
        if (previous !== undefined) await rename(previous, target)
        throw error
      } finally {
        if (source !== extracted) await rm(extracted, { recursive: true, force: true })
      }
    },
    rollback: async component => {
      if (component.installDirectory === undefined) return
      const target = join(toolsRoot, component.installDirectory)
      await rm(target, { recursive: true, force: true })
      const backup = backups.get(component.id)
      if (backup !== undefined) {
        await rename(backup, target)
        backups.delete(component.id)
      }
    },
    refreshEnvironment: async () => undefined,
  }
}