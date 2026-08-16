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
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { RewindConfig } from './types.ts';
/** Rewind configuration; all keys optional, defaults applied at mount time. */
export type RewindPluginConfig = RewindConfig;
/** Schemastery validation for {@link RewindPluginConfig}. */
export declare const RewindConfigSchema: z<RewindPluginConfig>;
/**
 * Mount the rewind capability. Registers the snapshot listeners, the session
 * lifecycle backfill, and the `/rewind` command; everything disposes with ctx.
 * @param ctx - plugin context carrying sessions, storageDomain, and commands.
 * @param config - rewind configuration; defaults applied per key.
 */
export declare function applyRewind(ctx: Context, config: RewindPluginConfig): void;
//# sourceMappingURL=index.d.ts.map