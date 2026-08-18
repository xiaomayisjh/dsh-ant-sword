// src/rewind/index.ts
import { randomBytes as randomBytes2 } from "node:crypto";
import z2 from "@deepseek-ai/schemastery";

// src/rewind/providers/git.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var execFileP = promisify(execFile);
var HEX = /^[0-9a-f]{40,64}$/i;
function assertHexRef(ref) {
  if (!HEX.test(ref)) {
    throw new Error(`refusing to use a non-hex git ref: ${JSON.stringify(ref)}`);
  }
}
async function git(gitBin, cwd, args, signal) {
  const { stdout } = await execFileP(gitBin, ["-C", cwd, ...args], {
    signal,
    maxBuffer: 64 * 1024 * 1024
  });
  return stdout;
}
async function probe(gitBin, cwd, signal) {
  try {
    const inside = await git(gitBin, cwd, ["rev-parse", "--is-inside-work-tree"], signal);
    if (inside.trim() !== "true") return false;
    await git(gitBin, cwd, ["rev-parse", "--verify", "HEAD"], signal);
    return true;
  } catch {
    return false;
  }
}
async function capture(gitBin, cwd, signal) {
  const created = (await git(gitBin, cwd, ["stash", "create"], signal)).trim();
  let ref;
  if (created !== "" && HEX.test(created)) {
    ref = created;
  } else {
    const tree = (await git(gitBin, cwd, ["rev-parse", "HEAD^{tree}"], signal)).trim();
    assertHexRef(tree);
    const head = (await git(gitBin, cwd, ["rev-parse", "HEAD"], signal)).trim();
    assertHexRef(head);
    ref = (await git(gitBin, cwd, ["commit-tree", tree, "-p", head, "-m", "ant-sword checkpoint"], signal)).trim();
  }
  assertHexRef(ref);
  const listing = await git(gitBin, cwd, ["ls-tree", "-r", "--name-only", ref], signal);
  const fileCount = listing === "" ? 0 : listing.split("\n").filter((line) => line !== "").length;
  const numstat = await git(gitBin, cwd, ["diff-tree", "-r", "--numstat", "HEAD", ref], signal).catch(() => "");
  let byteSize = 0;
  for (const line of numstat.split("\n")) {
    const added = line.split("	")[0];
    if (added !== void 0 && added !== "" && added !== "-") {
      const n = Number.parseInt(added, 10);
      if (Number.isFinite(n)) byteSize += n;
    }
  }
  return { ref, fileCount, byteSize };
}
async function trackedPaths(gitBin, cwd, ref, signal) {
  assertHexRef(ref);
  const listing = await git(gitBin, cwd, ["ls-tree", "-r", "--name-only", ref], signal);
  return listing.split("\n").map((line) => line.trim()).filter((line) => line !== "");
}
function makeGitProvider(gitBin) {
  return {
    kind: "git",
    available: (cwd) => probe(gitBin, cwd),
    capture: (cwd, signal) => capture(gitBin, cwd, signal),
    async restore(cwd, ref, signal) {
      assertHexRef(ref);
      const paths = await trackedPaths(gitBin, cwd, ref, signal);
      if (paths.length === 0) return { restored: 0 };
      await git(gitBin, cwd, ["restore", "--worktree", `--source=${ref}`, "--", ...paths], signal);
      return { restored: paths.length };
    },
    async preview(cwd, ref) {
      const paths = await trackedPaths(gitBin, cwd, ref);
      const status = await git(gitBin, cwd, ["status", "--porcelain", "--", ...paths]).catch(() => "");
      const changed = new Set(
        status.split("\n").map((line) => line.slice(3)).map((line) => line.trim()).filter((line) => line !== "")
      );
      const overwritten = paths.filter((path) => changed.has(path));
      const kept = paths.filter((path) => !changed.has(path));
      return { overwritten, kept };
    }
  };
}

// src/rewind/providers/copy.ts
import { mkdir, readdir, readFile, stat, lstat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
function newRef() {
  return randomBytes(16).toString("hex");
}
function assertRef(ref) {
  if (!/^[0-9a-f]{32}$/.test(ref)) {
    throw new Error(`refusing to use a malformed copy snapshot ref: ${JSON.stringify(ref)}`);
  }
}
function isExcluded(rel, excludeGlobs) {
  const segments = rel.split(sep);
  for (const pattern of excludeGlobs) {
    if (!pattern.includes("/")) {
      if (segments.includes(pattern)) return true;
      continue;
    }
    if (rel === pattern || rel.startsWith(pattern + sep)) return true;
  }
  return false;
}
async function hasSymlinkInChain(root, path) {
  let current = path;
  const rootResolved = resolve(root);
  while (true) {
    const rel = relative(rootResolved, current);
    if (rel === "") break;
    if (rel.startsWith("..")) return true;
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) return true;
    } catch {
      return true;
    }
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }
  return false;
}
async function* walkFiles(root, excludeGlobs, dir = root) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    const rel = relative(root, path);
    if (rel === "" || isExcluded(rel, excludeGlobs)) continue;
    if (entry.isDirectory()) yield* walkFiles(root, excludeGlobs, path);
    else if (entry.isFile()) yield path;
  }
}
function makeCopyProvider(snapshotDir, excludeGlobs) {
  return {
    kind: "copy",
    available: () => Promise.resolve(true),
    async capture(cwd, signal) {
      const ref = newRef();
      const target = join(snapshotDir, ref);
      await mkdir(target, { recursive: true });
      let fileCount = 0;
      let byteSize = 0;
      for await (const file of walkFiles(cwd, excludeGlobs)) {
        if (signal?.aborted === true) throw new Error("snapshot capture aborted");
        if (await hasSymlinkInChain(cwd, file)) continue;
        const rel = relative(cwd, file);
        const dest = join(target, rel);
        if (relative(target, dest).startsWith("..")) continue;
        await mkdir(resolve(dest, ".."), { recursive: true });
        const info = await stat(file);
        byteSize += info.size;
        try {
          await writeFile(dest, await readFile(file));
        } catch {
          continue;
        }
        fileCount++;
      }
      return { ref, fileCount, byteSize };
    },
    async restore(cwd, ref, signal) {
      assertRef(ref);
      const source = join(snapshotDir, ref);
      if (relative(snapshotDir, source).startsWith("..")) {
        throw new Error(`refusing to restore from outside the snapshot root: ${JSON.stringify(ref)}`);
      }
      let restored = 0;
      for await (const file of walkFiles(source, [])) {
        if (signal?.aborted === true) throw new Error("snapshot restore aborted");
        if (await hasSymlinkInChain(source, file)) continue;
        const rel = relative(source, file);
        const dest = join(cwd, rel);
        if (relative(cwd, dest).startsWith("..")) continue;
        if (await hasSymlinkInChain(cwd, dest)) continue;
        await mkdir(resolve(dest, ".."), { recursive: true });
        try {
          await writeFile(dest, await readFile(file));
          restored++;
        } catch {
          continue;
        }
      }
      return { restored };
    },
    async preview(cwd, ref) {
      assertRef(ref);
      const source = join(snapshotDir, ref);
      const overwritten = [];
      const kept = [];
      for await (const file of walkFiles(source, [])) {
        const rel = relative(source, file);
        const dest = join(cwd, rel);
        try {
          const current = await readFile(dest);
          const snapshot = await readFile(file);
          if (current.equals(snapshot)) kept.push(rel);
          else overwritten.push(rel);
        } catch {
          overwritten.push(rel);
        }
      }
      return { overwritten, kept };
    }
  };
}

// src/rewind/registry.ts
var SnapshotProviderRegistry = class {
  git;
  copy;
  probeCache = /* @__PURE__ */ new Map();
  constructor(config) {
    this.git = makeGitProvider(config.gitBin);
    this.copy = makeCopyProvider(config.snapshotDir, config.excludeGlobs);
  }
  probeGit(cwd) {
    let cached = this.probeCache.get(cwd);
    if (cached === void 0) {
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
    if (kind === "copy") return this.copy;
    if (kind === "git") {
      if (await this.probeGit(cwd)) return this.git;
      throw new Error(`snapshot provider "git" is not usable for workspace ${cwd}`);
    }
    return await this.probeGit(cwd) ? this.git : this.copy;
  }
};

// src/rewind/domain.ts
import z from "zod";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
var checkpointSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  provider: z.enum(["git", "copy"]),
  ref: z.string(),
  cwd: z.string(),
  trigger: z.string(),
  fileCount: z.number().optional(),
  byteSize: z.number(),
  time: z.number(),
  turn: z.number().optional(),
  step: z.number().optional(),
  stepEndSeq: z.number().optional(),
  forkSeq: z.number().optional(),
  guard: z.boolean().optional()
});
var rewindDomain = defineDomain({
  name: "ant_sword_rewind",
  version: 1,
  tables: {
    checkpoints: domainTable(checkpointSchema)
  }
});

// src/rewind/index.ts
var DEFAULT_MUTATION_TOOLS = ["bash", "write", "edit", "str_replace_editor", "pwsh", "terminal_send"];
var DEFAULT_EXCLUDE_GLOBS = ["node_modules", ".git", ".dsh", "dist", "build"];
var RewindConfigSchema = z2.object({
  enabled: z2.boolean(),
  provider: z2.union(["auto", "git", "copy"]),
  gitBin: z2.string(),
  snapshotDir: z2.string(),
  maxSnapshots: z2.number(),
  maxSnapshotBytes: z2.number(),
  pruneOnTurnEnd: z2.boolean(),
  mutationTools: z2.array(z2.string()),
  excludeGlobs: z2.array(z2.string()),
  listLimit: z2.number(),
  preRewindCheckpoint: z2.union(["warn", "require", "off"])
});
function resolveConfig(config) {
  return {
    enabled: config.enabled ?? true,
    provider: config.provider ?? "auto",
    gitBin: config.gitBin ?? "git",
    snapshotDir: config.snapshotDir ?? ".dsh/ant-sword-rewind",
    maxSnapshots: config.maxSnapshots ?? 50,
    maxSnapshotBytes: config.maxSnapshotBytes ?? 512 * 1024 * 1024,
    pruneOnTurnEnd: config.pruneOnTurnEnd ?? true,
    mutationTools: [...config.mutationTools ?? DEFAULT_MUTATION_TOOLS],
    excludeGlobs: [...config.excludeGlobs ?? DEFAULT_EXCLUDE_GLOBS],
    listLimit: config.listLimit ?? 10,
    preRewindCheckpoint: config.preRewindCheckpoint ?? "warn"
  };
}
function newCheckpointId() {
  return randomBytes2(8).toString("hex");
}
function listForSession(domain, sessionId) {
  const out = [];
  for (const [, record] of domain.table("checkpoints").entries()) {
    if (record.sessionId === sessionId) out.push(record);
  }
  return out.sort((a, b) => a.time - b.time);
}
function formatList(records, limit) {
  if (records.length === 0) return "ant-sword rewind: no checkpoints yet";
  const shown = records.slice(-limit);
  const lines = shown.map((record) => {
    const forkState = record.forkSeq !== void 0 ? "fork: ready" : "fork: pending";
    const files = record.fileCount !== void 0 ? `${record.fileCount} files` : "? files";
    const step = record.step !== void 0 ? ` step ${record.step}` : "";
    const turn = record.turn !== void 0 ? `turn ${record.turn}` : "turn ?";
    return `#${record.id} \xB7 (${record.provider}) \xB7 ${turn}${step} \xB7 ${files} \xB7 ${forkState}`;
  });
  return [
    `ant-sword rewind: ${records.length} checkpoint${records.length === 1 ? "" : "s"} (newest last):`,
    ...lines,
    'run "/rewind <id-prefix>" to restore files and fork the session from that checkpoint'
  ].join("\n");
}
function resolveTarget(records, input) {
  const trimmed = input.trim();
  if (trimmed === "latest") return records.at(-1);
  const stepMatch = /^step\s+(\d+)$/i.exec(trimmed);
  if (stepMatch?.[1] !== void 0) {
    const target = Number.parseInt(stepMatch[1], 10);
    let best;
    for (const record of records) {
      const step = record.step;
      if (step === void 0 || step > target) continue;
      if (best === void 0 || step > (best.step ?? -1)) best = record;
    }
    return best;
  }
  const matches = records.filter((record) => record.id.startsWith(trimmed));
  return matches.length === 1 ? matches[0] : void 0;
}
function applyRewind(ctx, config) {
  const resolved = resolveConfig(config);
  if (!resolved.enabled) return;
  const registry = new SnapshotProviderRegistry(resolved);
  const mutationTools = new Set(resolved.mutationTools);
  const openTurn = /* @__PURE__ */ new Map();
  const openStep = /* @__PURE__ */ new Map();
  const domainReady = (async () => ctx.storageDomain.open(rewindDomain))();
  void domainReady.catch(() => void 0);
  ctx.effect(async () => {
    const domain = await domainReady.catch(() => void 0);
    return () => {
      void domain?.close();
    };
  }, "ant-sword-rewind: domain");
  async function capture2(session, trigger) {
    if (session === void 0) return;
    const cwd = session.header.cwd;
    if (cwd === void 0) return;
    const domain = await domainReady;
    try {
      const provider = await registry.resolve(resolved.provider, cwd);
      const result = await provider.capture(cwd);
      const turn = openTurn.get(session.id);
      const step = openStep.get(session.id)?.step;
      const record = {
        id: newCheckpointId(),
        sessionId: session.id,
        provider: provider.kind,
        ref: result.ref,
        cwd,
        trigger,
        byteSize: result.byteSize,
        time: Date.now(),
        ...result.fileCount !== void 0 ? { fileCount: result.fileCount } : {},
        ...turn !== void 0 ? { turn } : {},
        ...step !== void 0 ? { step } : {}
      };
      await domain.table("checkpoints").put(record.id, record);
      await prune(domain, session.id);
    } catch {
    }
  }
  async function prune(domain, sessionId) {
    const table = domain.table("checkpoints");
    const mine = listForSession(domain, sessionId);
    const newest = mine.at(-1);
    const overflow = mine.length - resolved.maxSnapshots;
    if (overflow > 0) {
      for (const record of mine.slice(0, overflow)) {
        if (record.id === newest?.id) continue;
        await table.delete(record.id);
      }
    }
    let total = 0;
    const all = [];
    for (const [, record] of table.entries()) {
      total += record.byteSize;
      all.push(record);
    }
    if (total <= resolved.maxSnapshotBytes) return;
    all.sort((a, b) => a.time - b.time);
    for (const record of all) {
      if (total <= resolved.maxSnapshotBytes) break;
      if (record.id === newest?.id) continue;
      await table.delete(record.id);
      total -= record.byteSize;
    }
  }
  ctx.on("tools/pre-execute", async (exec, next) => {
    if (mutationTools.has(exec.name)) {
      await capture2(exec.agent?.session, exec.name);
    }
    return next();
  });
  ctx.on("session/event", (session, event) => {
    void (async () => {
      if (event.type === "turn/start") {
        openTurn.set(session.id, event.data.turn);
        return;
      }
      if (event.type === "step/start") {
        openStep.set(session.id, { turn: event.data.turn, step: event.data.step });
        return;
      }
      if (event.type === "step/end") {
        const domain = await domainReady.catch(() => void 0);
        if (domain === void 0) return;
        for (const record of listForSession(domain, session.id)) {
          if (record.step === event.data.step && record.stepEndSeq === void 0) {
            await domain.table("checkpoints").update(record.id, (current) => ({ ...current, stepEndSeq: event.seq }));
          }
        }
        openStep.delete(session.id);
        return;
      }
      if (event.type === "turn/end") {
        const domain = await domainReady.catch(() => void 0);
        if (domain !== void 0) {
          for (const record of listForSession(domain, session.id)) {
            if (record.forkSeq === void 0) {
              await domain.table("checkpoints").update(record.id, (current) => ({ ...current, forkSeq: event.seq }));
            }
          }
          if (resolved.pruneOnTurnEnd) await prune(domain, session.id);
        }
        openTurn.delete(session.id);
      }
    })();
  }, { global: true });
  ctx.commands.register({
    name: "rewind",
    description: "List workspace checkpoints, or restore one: files plus a forked session from its turn boundary",
    input: { hint: "[checkpoint-id-prefix | step <N> | latest | preview <target> | clear]" },
    handler: (invocation) => handleRewind(ctx, invocation, registry, resolved, domainReady)
  });
}
async function handleRewind(ctx, invocation, registry, config, domainReady) {
  const session = invocation.agent.session;
  const domain = await domainReady.catch(() => void 0);
  if (domain === void 0) {
    return { kind: "error", text: "ant-sword rewind: checkpoint registry unavailable (storage domain failed to open)" };
  }
  const records = listForSession(domain, session.id);
  const input = invocation.rawInput.trim();
  if (input === "") {
    return { kind: "success", text: formatList(records, config.listLimit) };
  }
  if (input === "clear") {
    for (const record2 of records) {
      await domain.table("checkpoints").delete(record2.id);
    }
    return { kind: "success", text: `ant-sword rewind: cleared ${records.length} checkpoint(s); workspace files untouched` };
  }
  const previewMode = input.startsWith("preview");
  const target = previewMode ? input.slice("preview".length).trim() : input;
  const record = resolveTarget(records, target);
  if (record === void 0) {
    return { kind: "error", text: `ant-sword rewind: no unique checkpoint matches ${JSON.stringify(target)}` };
  }
  const cwd = session.header.cwd ?? record.cwd;
  const provider = await registry.resolve(record.provider, cwd).catch(() => void 0);
  if (provider === void 0) {
    return { kind: "error", text: `ant-sword rewind: snapshot provider "${record.provider}" is not usable for ${cwd}` };
  }
  if (previewMode) {
    const impact = await provider.preview(cwd, record.ref);
    return {
      kind: "success",
      text: [
        `ant-sword rewind preview: checkpoint #${record.id} (provider ${record.provider})`,
        `restoring it would overwrite ${impact.overwritten.length} file(s):`,
        ...impact.overwritten.map((path) => `  ${path}`),
        `${impact.kept.length} file(s) already match the checkpoint (not touched).`,
        "no files are deleted by a restore.",
        'run "/rewind <id-prefix>" to confirm and apply'
      ].join("\n")
    };
  }
  let guardId;
  if (config.preRewindCheckpoint !== "off") {
    try {
      const guardProvider = await registry.resolve(config.provider, cwd);
      const guardResult = await guardProvider.capture(cwd);
      const guard = {
        id: newCheckpointId(),
        sessionId: session.id,
        provider: guardProvider.kind,
        ref: guardResult.ref,
        cwd,
        trigger: "rewind-guard",
        ...guardResult.fileCount !== void 0 ? { fileCount: guardResult.fileCount } : {},
        byteSize: guardResult.byteSize,
        time: Date.now(),
        guard: true
      };
      await domain.table("checkpoints").put(guard.id, guard);
      guardId = guard.id;
    } catch (error) {
      if (config.preRewindCheckpoint === "require") {
        return { kind: "error", text: `ant-sword rewind: aborted \u2014 the pre-rewind guard checkpoint could not be captured (${error instanceof Error ? error.message : String(error)})` };
      }
    }
  }
  const restored = await provider.restore(cwd, record.ref, invocation.signal).catch((error) => error);
  if (restored instanceof Error) {
    return { kind: "error", text: `ant-sword rewind: restore failed \u2014 ${restored.message}. No files forked, checkpoint kept.` };
  }
  if (record.forkSeq === void 0) {
    return {
      kind: "success",
      text: [
        `ant-sword rewind: restored ${restored.restored} file(s) from checkpoint #${record.id} (provider ${record.provider})`,
        "but the session was NOT forked: this checkpoint has no closed turn boundary yet.",
        guardId !== void 0 ? `rewind guard: ${guardId}` : ""
      ].filter((line) => line !== "").join("\n")
    };
  }
  let child;
  try {
    child = ctx.sessions.fork(session, record.forkSeq);
  } catch (error) {
    return {
      kind: "error",
      text: `ant-sword rewind: restored ${restored.restored} file(s), but the session was NOT forked (${error instanceof Error ? error.message : String(error)}).` + (guardId !== void 0 ? ` Undo with "/rewind ${guardId}".` : "")
    };
  }
  return {
    kind: "success",
    text: [
      `ant-sword rewind: restored ${restored.restored} file(s) from checkpoint #${record.id} (provider ${record.provider})`,
      `and forked a new session at seq ${record.forkSeq}.`,
      `session: ${child.id}`,
      guardId !== void 0 ? `rewind guard: ${guardId} (run "/rewind ${guardId}" to undo this rewind)` : ""
    ].filter((line) => line !== "").join("\n")
  };
}

// src/rewind-plugin.ts
var name = "ant-sword-rewind";
var inject = ["sessions", "storageDomain", "commands", "tools"];
var Config = RewindConfigSchema;
function apply(ctx, config) {
  applyRewind(ctx, config);
}
export {
  Config,
  apply,
  inject,
  name
};
