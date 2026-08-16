/**
 * Self-contained rewind capability: capture a workspace snapshot before every
 * mutation, and restore files plus fork the session back to a checkpoint's
 * turn boundary with `/rewind`. Built only on the harness's forward-stable
 * public primitives — `fs/write-intent` / `fs/edit-intent`, `tools/pre-execute`,
 * `ctx.storageDomain`, `ctx.sessions.fork`, and the session `turn`/`step`
 * lifecycle events — so it tracks official upgrades.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/rewind
 */

import { randomBytes } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { CommandInvocation } from '@deepseek-ai/dsh-commands'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { SnapshotProviderRegistry } from './registry.ts'
import { rewindDomain } from './domain.ts'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type {
  CheckpointRecord,
  ResolvedRewindConfig,
  RewindConfig,
} from './types.ts'

/** Rewind configuration; all keys optional, defaults applied at mount time. */
export type RewindPluginConfig = RewindConfig

const DEFAULT_MUTATION_TOOLS = ['bash', 'write', 'edit', 'str_replace_editor', 'pwsh', 'terminal_send'] as const
const DEFAULT_EXCLUDE_GLOBS = ['node_modules', '.git', '.dsh', 'dist', 'build'] as const

/** Schemastery validation for {@link RewindPluginConfig}. */
export const RewindConfigSchema: z<RewindPluginConfig> = z.object({
  enabled: z.boolean(),
  provider: z.union(['auto', 'git', 'copy'] as const),
  gitBin: z.string(),
  snapshotDir: z.string(),
  maxSnapshots: z.number(),
  maxSnapshotBytes: z.number(),
  pruneOnTurnEnd: z.boolean(),
  mutationTools: z.array(z.string()),
  excludeGlobs: z.array(z.string()),
  listLimit: z.number(),
  preRewindCheckpoint: z.union(['warn', 'require', 'off'] as const),
})

type RewindDomain = Domain<typeof rewindDomain>

function resolveConfig(config: RewindPluginConfig): ResolvedRewindConfig {
  return {
    enabled: config.enabled ?? true,
    provider: config.provider ?? 'auto',
    gitBin: config.gitBin ?? 'git',
    snapshotDir: config.snapshotDir ?? '.dsh/ant-sword-rewind',
    maxSnapshots: config.maxSnapshots ?? 50,
    maxSnapshotBytes: config.maxSnapshotBytes ?? 512 * 1024 * 1024,
    pruneOnTurnEnd: config.pruneOnTurnEnd ?? true,
    mutationTools: [...(config.mutationTools ?? DEFAULT_MUTATION_TOOLS)],
    excludeGlobs: [...(config.excludeGlobs ?? DEFAULT_EXCLUDE_GLOBS)],
    listLimit: config.listLimit ?? 10,
    preRewindCheckpoint: config.preRewindCheckpoint ?? 'warn',
  }
}

function newCheckpointId(): string {
  return randomBytes(8).toString('hex')
}

/** Read-only helpers over the checkpoint table. */
function listForSession(domain: RewindDomain, sessionId: string): CheckpointRecord[] {
  const out: CheckpointRecord[] = []
  for (const [, record] of domain.table('checkpoints').entries()) {
    if (record.sessionId === sessionId) out.push(record)
  }
  return out.sort((a, b) => a.time - b.time)
}

function formatList(records: readonly CheckpointRecord[], limit: number): string {
  if (records.length === 0) return 'ant-sword rewind: no checkpoints yet'
  const shown = records.slice(-limit)
  const lines = shown.map((record) => {
    const forkState = record.forkSeq !== undefined ? 'fork: ready' : 'fork: pending'
    const files = record.fileCount !== undefined ? `${record.fileCount} files` : '? files'
    const step = record.step !== undefined ? ` step ${record.step}` : ''
    const turn = record.turn !== undefined ? `turn ${record.turn}` : 'turn ?'
    return `#${record.id} · (${record.provider}) · ${turn}${step} · ${files} · ${forkState}`
  })
  return [
    `ant-sword rewind: ${records.length} checkpoint${records.length === 1 ? '' : 's'} (newest last):`,
    ...lines,
    'run "/rewind <id-prefix>" to restore files and fork the session from that checkpoint',
  ].join('\n')
}

/** Resolve a checkpoint by unique id prefix, `step <N>`, or `latest`. */
function resolveTarget(records: readonly CheckpointRecord[], input: string): CheckpointRecord | undefined {
  const trimmed = input.trim()
  if (trimmed === 'latest') return records.at(-1)
  const stepMatch = /^step\s+(\d+)$/i.exec(trimmed)
  if (stepMatch?.[1] !== undefined) {
    const target = Number.parseInt(stepMatch[1], 10)
    let best: CheckpointRecord | undefined
    for (const record of records) {
      const step = record.step
      if (step === undefined || step > target) continue
      if (best === undefined || step > (best.step ?? -1)) best = record
    }
    return best
  }
  const matches = records.filter(record => record.id.startsWith(trimmed))
  return matches.length === 1 ? matches[0] : undefined
}

/**
 * Mount the rewind capability. Registers the snapshot listeners, the session
 * lifecycle backfill, and the `/rewind` command; everything disposes with ctx.
 * @param ctx - plugin context carrying sessions, storageDomain, and commands.
 * @param config - rewind configuration; defaults applied per key.
 */
export function applyRewind(ctx: Context, config: RewindPluginConfig): void {
  const resolved = resolveConfig(config)
  if (!resolved.enabled) return

  const registry = new SnapshotProviderRegistry(resolved)
  const mutationTools = new Set(resolved.mutationTools)

  // Per-session open-turn / open-step tracking, keyed by session id.
  const openTurn = new Map<string, number>()
  const openStep = new Map<string, { turn: number; step: number }>()

  const domainReady = (async (): Promise<RewindDomain> => ctx.storageDomain.open(rewindDomain))()
  void domainReady.catch(() => undefined)
  ctx.effect(async () => {
    const domain = await domainReady.catch(() => undefined)
    return () => { void domain?.close() }
  }, 'ant-sword-rewind: domain')

  /** Capture a checkpoint for one session's workspace before a mutation. */
  async function capture(session: Session | undefined, trigger: string): Promise<void> {
    if (session === undefined) return
    const cwd = session.header.cwd
    if (cwd === undefined) return
    const domain = await domainReady
    try {
      const provider = await registry.resolve(resolved.provider, cwd)
      const result = await provider.capture(cwd)
      const turn = openTurn.get(session.id)
      const step = openStep.get(session.id)?.step
      const record: CheckpointRecord = {
        id: newCheckpointId(),
        sessionId: session.id,
        provider: provider.kind,
        ref: result.ref,
        cwd,
        trigger,
        byteSize: result.byteSize,
        time: Date.now(),
        ...(result.fileCount !== undefined ? { fileCount: result.fileCount } : {}),
        ...(turn !== undefined ? { turn } : {}),
        ...(step !== undefined ? { step } : {}),
      }
      await domain.table('checkpoints').put(record.id, record)
      await prune(domain, session.id)
    } catch {
      // A failed capture must never block the mutation it precedes.
    }
  }

  /** Apply per-session and global-byte quotas, oldest first. */
  async function prune(domain: RewindDomain, sessionId: string): Promise<void> {
    const table = domain.table('checkpoints')
    const mine = listForSession(domain, sessionId)
    const newest = mine.at(-1)
    const overflow = mine.length - resolved.maxSnapshots
    if (overflow > 0) {
      for (const record of mine.slice(0, overflow)) {
        if (record.id === newest?.id) continue
        await table.delete(record.id)
      }
    }
    let total = 0
    const all: CheckpointRecord[] = []
    for (const [, record] of table.entries()) {
      total += record.byteSize
      all.push(record)
    }
    if (total <= resolved.maxSnapshotBytes) return
    all.sort((a, b) => a.time - b.time)
    for (const record of all) {
      if (total <= resolved.maxSnapshotBytes) break
      if (record.id === newest?.id) continue
      await table.delete(record.id)
      total -= record.byteSize
    }
  }

  // Snapshot hooks: a pass-through on the mutating tool pipeline. Returning
  // next() leaves the policy decision to the permission layer untouched.
  ctx.on('tools/pre-execute', async (exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> => {
    if (mutationTools.has(exec.name)) {
      await capture(exec.agent?.session, exec.name)
    }
    return next()
  })

  // Turn/step lifecycle backfill: fork boundaries land on turn/end seqs only.
  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    void (async () => {
      if (event.type === 'turn/start') {
        openTurn.set(session.id, event.data.turn)
        return
      }
      if (event.type === 'step/start') {
        openStep.set(session.id, { turn: event.data.turn, step: event.data.step })
        return
      }
      if (event.type === 'step/end') {
        const domain = await domainReady.catch(() => undefined)
        if (domain === undefined) return
        for (const record of listForSession(domain, session.id)) {
          if (record.step === event.data.step && record.stepEndSeq === undefined) {
            await domain.table('checkpoints').update(record.id, current => ({ ...current, stepEndSeq: event.seq }))
          }
        }
        openStep.delete(session.id)
        return
      }
      if (event.type === 'turn/end') {
        const domain = await domainReady.catch(() => undefined)
        if (domain !== undefined) {
          for (const record of listForSession(domain, session.id)) {
            if (record.forkSeq === undefined) {
              await domain.table('checkpoints').update(record.id, current => ({ ...current, forkSeq: event.seq }))
            }
          }
          if (resolved.pruneOnTurnEnd) await prune(domain, session.id)
        }
        openTurn.delete(session.id)
      }
    })()
  }, { global: true })

  ctx.commands.register({
    name: 'rewind',
    description: 'List workspace checkpoints, or restore one: files plus a forked session from its turn boundary',
    input: { hint: '[checkpoint-id-prefix | step <N> | latest | preview <target> | clear]' },
    handler: invocation => handleRewind(ctx, invocation, registry, resolved, domainReady),
  })
}

async function handleRewind(
  ctx: Context,
  invocation: CommandInvocation,
  registry: SnapshotProviderRegistry,
  config: ResolvedRewindConfig,
  domainReady: Promise<RewindDomain>,
): Promise<{ kind: 'success'; text?: string } | { kind: 'error'; text: string }> {
  const session = invocation.agent.session
  const domain = await domainReady.catch(() => undefined)
  if (domain === undefined) {
    return { kind: 'error', text: 'ant-sword rewind: checkpoint registry unavailable (storage domain failed to open)' }
  }
  const records = listForSession(domain, session.id)
  const input = invocation.rawInput.trim()

  if (input === '') {
    return { kind: 'success', text: formatList(records, config.listLimit) }
  }
  if (input === 'clear') {
    for (const record of records) {
      await domain.table('checkpoints').delete(record.id)
    }
    return { kind: 'success', text: `ant-sword rewind: cleared ${records.length} checkpoint(s); workspace files untouched` }
  }

  const previewMode = input.startsWith('preview')
  const target = previewMode ? input.slice('preview'.length).trim() : input
  const record = resolveTarget(records, target)
  if (record === undefined) {
    return { kind: 'error', text: `ant-sword rewind: no unique checkpoint matches ${JSON.stringify(target)}` }
  }

  const cwd = session.header.cwd ?? record.cwd
  const provider = await registry.resolve(record.provider, cwd).catch(() => undefined)
  if (provider === undefined) {
    return { kind: 'error', text: `ant-sword rewind: snapshot provider "${record.provider}" is not usable for ${cwd}` }
  }

  if (previewMode) {
    const impact = await provider.preview(cwd, record.ref)
    return {
      kind: 'success',
      text: [
        `ant-sword rewind preview: checkpoint #${record.id} (provider ${record.provider})`,
        `restoring it would overwrite ${impact.overwritten.length} file(s):`,
        ...impact.overwritten.map(path => `  ${path}`),
        `${impact.kept.length} file(s) already match the checkpoint (not touched).`,
        'no files are deleted by a restore.',
        'run "/rewind <id-prefix>" to confirm and apply',
      ].join('\n'),
    }
  }

  // Three-phase transaction: guard checkpoint, restore files, fork the session.
  let guardId: string | undefined
  if (config.preRewindCheckpoint !== 'off') {
    try {
      const guardProvider = await registry.resolve(config.provider, cwd)
      const guardResult = await guardProvider.capture(cwd)
      const guard: CheckpointRecord = {
        id: newCheckpointId(),
        sessionId: session.id,
        provider: guardProvider.kind,
        ref: guardResult.ref,
        cwd,
        trigger: 'rewind-guard',
        ...guardResult.fileCount !== undefined ? { fileCount: guardResult.fileCount } : {},
        byteSize: guardResult.byteSize,
        time: Date.now(),
        guard: true,
      }
      await domain.table('checkpoints').put(guard.id, guard)
      guardId = guard.id
    } catch (error) {
      if (config.preRewindCheckpoint === 'require') {
        return { kind: 'error', text: `ant-sword rewind: aborted — the pre-rewind guard checkpoint could not be captured (${error instanceof Error ? error.message : String(error)})` }
      }
    }
  }

  const restored = await provider.restore(cwd, record.ref, invocation.signal).catch((error: unknown) => error as Error)
  if (restored instanceof Error) {
    return { kind: 'error', text: `ant-sword rewind: restore failed — ${restored.message}. No files forked, checkpoint kept.` }
  }

  if (record.forkSeq === undefined) {
    return {
      kind: 'success',
      text: [
        `ant-sword rewind: restored ${restored.restored} file(s) from checkpoint #${record.id} (provider ${record.provider})`,
        'but the session was NOT forked: this checkpoint has no closed turn boundary yet.',
        guardId !== undefined ? `rewind guard: ${guardId}` : '',
      ].filter(line => line !== '').join('\n'),
    }
  }

  let child: Session
  try {
    child = ctx.sessions.fork(session, record.forkSeq)
  } catch (error) {
    return {
      kind: 'error',
      text: `ant-sword rewind: restored ${restored.restored} file(s), but the session was NOT forked (${error instanceof Error ? error.message : String(error)}).`
        + (guardId !== undefined ? ` Undo with "/rewind ${guardId}".` : ''),
    }
  }

  return {
    kind: 'success',
    text: [
      `ant-sword rewind: restored ${restored.restored} file(s) from checkpoint #${record.id} (provider ${record.provider})`,
      `and forked a new session at seq ${record.forkSeq}.`,
      `session: ${child.id}`,
      guardId !== undefined ? `rewind guard: ${guardId} (run "/rewind ${guardId}" to undo this rewind)` : '',
    ].filter(line => line !== '').join('\n'),
  }
}
