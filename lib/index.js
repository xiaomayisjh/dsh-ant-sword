import z from "@deepseek-ai/schemastery";
import { lstat, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import { randomBytes } from "node:crypto";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import z$2, { z as z$1 } from "zod";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { Service } from "@deepseek-ai/cordis";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { defineTool } from "@deepseek-ai/dsh-tools";
import * as mcpClient from "@deepseek-ai/dsh-mcp-client";
//#region lib/types/skills.js
/**
* Bundled reverse/CTF skill pack provider.
*
* Data-driven: walks the `skills/` tree shipped beside the built `lib/`, reads
* every `SKILL.md`, parses its frontmatter, and exposes each as a bundled
* candidate on the `ctx.skills` seam. No hand-maintained candidate list — the
* catalog follows the directory contents.
*
* @module @deepseek-ai/dsh-ant-sword-harness/skills
*/
/**
* The `skills/` directory sits at the package root, one level above `lib/`.
* The URL already resolves to the directory itself; wrapping it in `dirname()`
* would strip back to the package root and double-count every `SKILL.md` under
* `node_modules`.
*/
const SKILLS_ROOT = fileURLToPath(new URL("../skills", import.meta.url));
/** Provider name in the `ctx.skills` registry. */
const SKILL_PROVIDER_NAME = "ant-sword-skills";
/**
* Minimal YAML-frontmatter reader covering the keys this pack uses. Only the
* top-level scalar keys `name` / `description` / `whenToUse` /
* `user-invocable` / `disable-model-invocation` are read; a `metadata:` block
* is passed through untouched by the caller (the pack ships none that matter
* to routing). Values have one layer of surrounding quotes stripped.
*/
function parseFrontmatter(text) {
	const src = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
	if (!src.startsWith("---")) return {
		frontmatter: {},
		body: text
	};
	const end = src.indexOf("\n---", 3);
	if (end === -1) return {
		frontmatter: {},
		body: text
	};
	const frontmatter = {};
	let metadataUserInvocable;
	const lines = src.slice(3, end).split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === void 0) continue;
		if (line.trim() === "metadata:") {
			let j = i + 1;
			while (j < lines.length) {
				const nested = lines[j];
				if (nested === void 0 || !/^\s/.test(nested)) break;
				const m = /user-invocable:\s*"?([^"\n]+)"?/.exec(nested);
				if (m?.[1] !== void 0) metadataUserInvocable = m[1].trim();
				j++;
			}
			i = j - 1;
			continue;
		}
		const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
		if (m?.[1] !== void 0 && m[2] !== void 0) frontmatter[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
	}
	if (metadataUserInvocable !== void 0) frontmatter["user-invocable"] = metadataUserInvocable;
	return {
		frontmatter,
		body: src.slice(end + 4)
	};
}
async function collect(root) {
	const out = [];
	async function walk(dir) {
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) await walk(path);
			else if (entry.name === "SKILL.md") {
				const { frontmatter, body } = parseFrontmatter(await readFile(path, "utf8"));
				if (frontmatter["name"] !== void 0 && frontmatter["name"] !== "") out.push({
					path,
					frontmatter,
					body
				});
			}
		}
	}
	await walk(root);
	return out;
}
/** Truthy parsing aligned with the dsh skill filesystem provider. */
function isFalse(value) {
	return value !== void 0 && /^(false|0|no|off)$/i.test(value);
}
function toCandidate(skill) {
	const { frontmatter, path } = skill;
	const disableModel = !isFalse(frontmatter["disable-model-invocation"]) && frontmatter["disable-model-invocation"] !== void 0;
	return {
		name: frontmatter["name"] ?? "",
		description: frontmatter["description"] ?? "",
		...frontmatter["whenToUse"] !== void 0 && frontmatter["whenToUse"] !== "" ? { whenToUse: frontmatter["whenToUse"] } : {},
		invocation: {
			modelInvocable: !disableModel,
			userInvocable: !isFalse(frontmatter["user-invocable"])
		},
		provider: SKILL_PROVIDER_NAME,
		source: "bundled",
		resourceBase: {
			kind: "directory",
			path: dirname(path)
		},
		rank: BUNDLED_SKILL_RANK,
		locator: pathToFileURL(path),
		path
	};
}
let cache;
async function candidates() {
	if (cache !== void 0) return cache;
	const built = (await collect(SKILLS_ROOT)).map(toCandidate);
	cache = built;
	return built;
}
/** The bundled skill provider exposed on the `ctx.skills` seam. */
const skillProvider = {
	name: SKILL_PROVIDER_NAME,
	list: () => candidates(),
	async get(candidate) {
		const locator = candidate.locator;
		if (!(locator instanceof URL)) return void 0;
		let text;
		try {
			text = await readFile(locator, "utf8");
		} catch {
			return;
		}
		const { body } = parseFrontmatter(text);
		return {
			name: candidate.name,
			description: candidate.description,
			...candidate.whenToUse !== void 0 ? { whenToUse: candidate.whenToUse } : {},
			invocation: candidate.invocation,
			provider: candidate.provider,
			source: candidate.source,
			...candidate.resourceBase !== void 0 ? { resourceBase: candidate.resourceBase } : {},
			content: body.trim(),
			...candidate.path !== void 0 ? { path: candidate.path } : {}
		};
	}
};
//#endregion
//#region lib/types/preset-sync.js
/**
* Sync the bundled red-team agent preset into the harness's writable preset
* root so the roster discovers it. The bundle's patch cannot register a preset
* root (the launcher overlays `roots` to the shipped root only), so the preset
* is materialized under `$DSH_HOME/.agent-presets/red-team/`, which the roster
* appends as a `user` root via `includeUserRoot`. The sync is idempotent: it
* rewrites only files whose content differs.
*
* @module @deepseek-ai/dsh-ant-sword-harness/preset-sync
*/
/** The bundled preset source directories (one level above the built `lib/`). */
const PRESET_SOURCE = fileURLToPath(new URL("../preset/red-team", import.meta.url));
const AUTO_PRESET_SOURCE = fileURLToPath(new URL("../preset/red-team-auto", import.meta.url));
/** The red-team preset id; also its directory name under the user preset root. */
const RED_TEAM_PRESET_ID = "red-team";
/** The autonomous red-team preset id. */
const RED_TEAM_AUTO_PRESET_ID = "red-team-auto";
/** The harness-home user preset directory the roster scans. */
const USER_PRESET_DIR = ".agent-presets";
async function readPresetFiles(dir, prefix = "") {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	const out = [];
	for (const entry of entries) {
		const path = join(dir, entry.name);
		const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
		if (entry.isDirectory()) out.push(...await readPresetFiles(path, rel));
		else if (entry.isFile()) out.push({
			rel,
			content: await readFile(path)
		});
	}
	return out;
}
/**
* Copy one bundled preset into the user preset root, overwriting only files
* whose content changed. Never deletes files the user added beside it.
* @returns the absolute target directory the preset was synced into.
*/
async function syncPreset(source, id) {
	const target = join(dshHomePath(USER_PRESET_DIR), id);
	const files = await readPresetFiles(source);
	for (const file of files) {
		const dest = join(target, file.rel);
		let existing;
		try {
			existing = await readFile(dest);
		} catch {
			existing = void 0;
		}
		if (existing !== void 0 && existing.equals(file.content)) continue;
		await mkdir(dirname(dest), { recursive: true });
		await writeFile(dest, file.content);
	}
	return target;
}
/** Sync the manual red-team preset. */
async function syncRedTeamPreset() {
	return syncPreset(PRESET_SOURCE, RED_TEAM_PRESET_ID);
}
/** Sync the autonomous red-team-auto preset. */
async function syncRedTeamAutoPreset() {
	return syncPreset(AUTO_PRESET_SOURCE, RED_TEAM_AUTO_PRESET_ID);
}
//#endregion
//#region lib/types/rewind/providers/git.js
/**
* Git snapshot provider: side-effect-free unreferenced objects via
* `git stash create` / `git commit-tree`, restored worktree-only with explicit
* paths. Never `reset --hard`, never `clean`, never touch the index or history.
*
* @module @deepseek-ai/dsh-ant-sword-harness/rewind/providers/git
*/
const execFileP = promisify(execFile);
const HEX = /^[0-9a-f]{40,64}$/i;
/** Assert a value is a bare hex git object id before it is passed to git. */
function assertHexRef(ref) {
	if (!HEX.test(ref)) throw new Error(`refusing to use a non-hex git ref: ${JSON.stringify(ref)}`);
}
/** Run a whitelisted git verb; rejects on non-zero exit. */
async function git(gitBin, cwd, args, signal) {
	const { stdout } = await execFileP(gitBin, [
		"-C",
		cwd,
		...args
	], {
		signal,
		maxBuffer: 64 * 1024 * 1024
	});
	return stdout;
}
/** Whether `cwd` is inside a git work tree with a born HEAD. */
async function probe(gitBin, cwd, signal) {
	try {
		if ((await git(gitBin, cwd, ["rev-parse", "--is-inside-work-tree"], signal)).trim() !== "true") return false;
		await git(gitBin, cwd, [
			"rev-parse",
			"--verify",
			"HEAD"
		], signal);
		return true;
	} catch {
		return false;
	}
}
/** Capture the working tree as an unreferenced commit object. */
async function capture(gitBin, cwd, signal) {
	const created = (await git(gitBin, cwd, ["stash", "create"], signal)).trim();
	let ref;
	if (created !== "" && HEX.test(created)) ref = created;
	else {
		const tree = (await git(gitBin, cwd, ["rev-parse", "HEAD^{tree}"], signal)).trim();
		assertHexRef(tree);
		const head = (await git(gitBin, cwd, ["rev-parse", "HEAD"], signal)).trim();
		assertHexRef(head);
		ref = (await git(gitBin, cwd, [
			"commit-tree",
			tree,
			"-p",
			head,
			"-m",
			"ant-sword checkpoint"
		], signal)).trim();
	}
	assertHexRef(ref);
	const listing = await git(gitBin, cwd, [
		"ls-tree",
		"-r",
		"--name-only",
		ref
	], signal);
	const fileCount = listing === "" ? 0 : listing.split("\n").filter((line) => line !== "").length;
	const numstat = await git(gitBin, cwd, [
		"diff-tree",
		"-r",
		"--numstat",
		"HEAD",
		ref
	], signal).catch(() => "");
	let byteSize = 0;
	for (const line of numstat.split("\n")) {
		const added = line.split("	")[0];
		if (added !== void 0 && added !== "" && added !== "-") {
			const n = Number.parseInt(added, 10);
			if (Number.isFinite(n)) byteSize += n;
		}
	}
	return {
		ref,
		fileCount,
		byteSize
	};
}
/** List the paths a snapshot would touch (tracked files present in the ref). */
async function trackedPaths(gitBin, cwd, ref, signal) {
	assertHexRef(ref);
	return (await git(gitBin, cwd, [
		"ls-tree",
		"-r",
		"--name-only",
		ref
	], signal)).split("\n").map((line) => line.trim()).filter((line) => line !== "");
}
/** Create the git provider bound to a `gitBin`. */
function makeGitProvider(gitBin) {
	return {
		kind: "git",
		available: (cwd) => probe(gitBin, cwd),
		capture: (cwd, signal) => capture(gitBin, cwd, signal),
		async restore(cwd, ref, signal) {
			assertHexRef(ref);
			const paths = await trackedPaths(gitBin, cwd, ref, signal);
			if (paths.length === 0) return { restored: 0 };
			await git(gitBin, cwd, [
				"restore",
				"--worktree",
				`--source=${ref}`,
				"--",
				...paths
			], signal);
			return { restored: paths.length };
		},
		async preview(cwd, ref) {
			const paths = await trackedPaths(gitBin, cwd, ref);
			const status = await git(gitBin, cwd, [
				"status",
				"--porcelain",
				"--",
				...paths
			]).catch(() => "");
			const changed = new Set(status.split("\n").map((line) => line.slice(3)).map((line) => line.trim()).filter((line) => line !== ""));
			return {
				overwritten: paths.filter((path) => changed.has(path)),
				kept: paths.filter((path) => !changed.has(path))
			};
		}
	};
}
//#endregion
//#region lib/types/rewind/providers/copy.js
/**
* Copy snapshot provider: incremental directory snapshots with hardlink reuse
* for workspaces that are not git repositories (or have an unborn HEAD).
* Restore overwrites captured files only and never deletes; symlink traversal
* out of the workspace is refused on both capture and restore.
*
* @module @deepseek-ai/dsh-ant-sword-harness/rewind/providers/copy
*/
/** A checkpoint ref for the copy provider is a hex token naming one snapshot dir. */
function newRef() {
	return randomBytes(16).toString("hex");
}
function assertRef(ref) {
	if (!/^[0-9a-f]{32}$/.test(ref)) throw new Error(`refusing to use a malformed copy snapshot ref: ${JSON.stringify(ref)}`);
}
/** Whether a path segment is excluded by the configured glob-ish segments. */
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
/** Whether `path` (or any ancestor up to `root`) has become a symlink. */
async function hasSymlinkInChain(root, path) {
	let current = path;
	const rootResolved = resolve(root);
	while (true) {
		const rel = relative(rootResolved, current);
		if (rel === "") break;
		if (rel.startsWith("..")) return true;
		try {
			if ((await lstat(current)).isSymbolicLink()) return true;
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
/** Create the copy provider bound to a snapshot root and exclusion segments. */
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
				const dest = join(target, relative(cwd, file));
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
			return {
				ref,
				fileCount,
				byteSize
			};
		},
		async restore(cwd, ref, signal) {
			assertRef(ref);
			const source = join(snapshotDir, ref);
			if (relative(snapshotDir, source).startsWith("..")) throw new Error(`refusing to restore from outside the snapshot root: ${JSON.stringify(ref)}`);
			let restored = 0;
			for await (const file of walkFiles(source, [])) {
				if (signal?.aborted === true) throw new Error("snapshot restore aborted");
				if (await hasSymlinkInChain(source, file)) continue;
				const dest = join(cwd, relative(source, file));
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
			return {
				overwritten,
				kept
			};
		}
	};
}
//#endregion
//#region lib/types/rewind/registry.js
/**
* Snapshot provider registry: resolves `auto` / `git` / `copy` per workspace,
* caching each provider's availability probe so a capture burst does not
* re-probe git on every mutation.
*
* @module @deepseek-ai/dsh-ant-sword-harness/rewind/registry
*/
/** Resolves the snapshot provider for a workspace from the plugin config. */
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
/** The rewind checkpoint registry domain. */
const rewindDomain = defineDomain({
	name: "ant_sword_rewind",
	version: 1,
	tables: { checkpoints: domainTable(z$2.object({
		id: z$2.string(),
		sessionId: z$2.string(),
		provider: z$2.enum(["git", "copy"]),
		ref: z$2.string(),
		cwd: z$2.string(),
		trigger: z$2.string(),
		fileCount: z$2.number().optional(),
		byteSize: z$2.number(),
		time: z$2.number(),
		turn: z$2.number().optional(),
		step: z$2.number().optional(),
		stepEndSeq: z$2.number().optional(),
		forkSeq: z$2.number().optional(),
		guard: z$2.boolean().optional()
	})) }
});
//#endregion
//#region lib/types/rewind/index.js
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
const DEFAULT_MUTATION_TOOLS = [
	"bash",
	"write",
	"edit",
	"str_replace_editor",
	"pwsh",
	"terminal_send"
];
const DEFAULT_EXCLUDE_GLOBS = [
	"node_modules",
	".git",
	".dsh",
	"dist",
	"build"
];
/** Schemastery validation for {@link RewindPluginConfig}. */
const RewindConfigSchema = z.object({
	enabled: z.boolean(),
	provider: z.union([
		"auto",
		"git",
		"copy"
	]),
	gitBin: z.string(),
	snapshotDir: z.string(),
	maxSnapshots: z.number(),
	maxSnapshotBytes: z.number(),
	pruneOnTurnEnd: z.boolean(),
	mutationTools: z.array(z.string()),
	excludeGlobs: z.array(z.string()),
	listLimit: z.number(),
	preRewindCheckpoint: z.union([
		"warn",
		"require",
		"off"
	])
});
function resolveConfig$1(config) {
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
	return randomBytes(8).toString("hex");
}
/** Read-only helpers over the checkpoint table. */
function listForSession(domain, sessionId) {
	const out = [];
	for (const [, record] of domain.table("checkpoints").entries()) if (record.sessionId === sessionId) out.push(record);
	return out.sort((a, b) => a.time - b.time);
}
function formatList(records, limit) {
	if (records.length === 0) return "ant-sword rewind: no checkpoints yet";
	const lines = records.slice(-limit).map((record) => {
		const forkState = record.forkSeq !== void 0 ? "fork: ready" : "fork: pending";
		const files = record.fileCount !== void 0 ? `${record.fileCount} files` : "? files";
		const step = record.step !== void 0 ? ` step ${record.step}` : "";
		const turn = record.turn !== void 0 ? `turn ${record.turn}` : "turn ?";
		return `#${record.id} · (${record.provider}) · ${turn}${step} · ${files} · ${forkState}`;
	});
	return [
		`ant-sword rewind: ${records.length} checkpoint${records.length === 1 ? "" : "s"} (newest last):`,
		...lines,
		"run \"/rewind <id-prefix>\" to restore files and fork the session from that checkpoint"
	].join("\n");
}
/** Resolve a checkpoint by unique id prefix, `step <N>`, or `latest`. */
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
/**
* Mount the rewind capability. Registers the snapshot listeners, the session
* lifecycle backfill, and the `/rewind` command; everything disposes with ctx.
* @param ctx - plugin context carrying sessions, storageDomain, and commands.
* @param config - rewind configuration; defaults applied per key.
*/
function applyRewind(ctx, config) {
	const resolved = resolveConfig$1(config);
	if (!resolved.enabled) return;
	const registry = new SnapshotProviderRegistry(resolved);
	const mutationTools = new Set(resolved.mutationTools);
	const openTurn = /* @__PURE__ */ new Map();
	const openStep = /* @__PURE__ */ new Map();
	const domainReady = (async () => ctx.storageDomain.open(rewindDomain))();
	domainReady.catch(() => void 0);
	ctx.effect(async () => {
		const domain = await domainReady.catch(() => void 0);
		return () => {
			domain?.close();
		};
	}, "ant-sword-rewind: domain");
	/** Capture a checkpoint for one session's workspace before a mutation. */
	async function capture(session, trigger) {
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
		} catch {}
	}
	/** Apply per-session and global-byte quotas, oldest first. */
	async function prune(domain, sessionId) {
		const table = domain.table("checkpoints");
		const mine = listForSession(domain, sessionId);
		const newest = mine.at(-1);
		const overflow = mine.length - resolved.maxSnapshots;
		if (overflow > 0) for (const record of mine.slice(0, overflow)) {
			if (record.id === newest?.id) continue;
			await table.delete(record.id);
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
		if (mutationTools.has(exec.name)) await capture(exec.agent?.session, exec.name);
		return next();
	});
	ctx.on("session/event", (session, event) => {
		(async () => {
			if (event.type === "turn/start") {
				openTurn.set(session.id, event.data.turn);
				return;
			}
			if (event.type === "step/start") {
				openStep.set(session.id, {
					turn: event.data.turn,
					step: event.data.step
				});
				return;
			}
			if (event.type === "step/end") {
				const domain = await domainReady.catch(() => void 0);
				if (domain === void 0) return;
				for (const record of listForSession(domain, session.id)) if (record.step === event.data.step && record.stepEndSeq === void 0) await domain.table("checkpoints").update(record.id, (current) => ({
					...current,
					stepEndSeq: event.seq
				}));
				openStep.delete(session.id);
				return;
			}
			if (event.type === "turn/end") {
				const domain = await domainReady.catch(() => void 0);
				if (domain !== void 0) {
					for (const record of listForSession(domain, session.id)) if (record.forkSeq === void 0) await domain.table("checkpoints").update(record.id, (current) => ({
						...current,
						forkSeq: event.seq
					}));
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
	if (domain === void 0) return {
		kind: "error",
		text: "ant-sword rewind: checkpoint registry unavailable (storage domain failed to open)"
	};
	const records = listForSession(domain, session.id);
	const input = invocation.rawInput.trim();
	if (input === "") return {
		kind: "success",
		text: formatList(records, config.listLimit)
	};
	if (input === "clear") {
		for (const record of records) await domain.table("checkpoints").delete(record.id);
		return {
			kind: "success",
			text: `ant-sword rewind: cleared ${records.length} checkpoint(s); workspace files untouched`
		};
	}
	const previewMode = input.startsWith("preview");
	const target = previewMode ? input.slice(7).trim() : input;
	const record = resolveTarget(records, target);
	if (record === void 0) return {
		kind: "error",
		text: `ant-sword rewind: no unique checkpoint matches ${JSON.stringify(target)}`
	};
	const cwd = session.header.cwd ?? record.cwd;
	const provider = await registry.resolve(record.provider, cwd).catch(() => void 0);
	if (provider === void 0) return {
		kind: "error",
		text: `ant-sword rewind: snapshot provider "${record.provider}" is not usable for ${cwd}`
	};
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
				"run \"/rewind <id-prefix>\" to confirm and apply"
			].join("\n")
		};
	}
	let guardId;
	if (config.preRewindCheckpoint !== "off") try {
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
		if (config.preRewindCheckpoint === "require") return {
			kind: "error",
			text: `ant-sword rewind: aborted — the pre-rewind guard checkpoint could not be captured (${error instanceof Error ? error.message : String(error)})`
		};
	}
	const restored = await provider.restore(cwd, record.ref, invocation.signal).catch((error) => error);
	if (restored instanceof Error) return {
		kind: "error",
		text: `ant-sword rewind: restore failed — ${restored.message}. No files forked, checkpoint kept.`
	};
	if (record.forkSeq === void 0) return {
		kind: "success",
		text: [
			`ant-sword rewind: restored ${restored.restored} file(s) from checkpoint #${record.id} (provider ${record.provider})`,
			"but the session was NOT forked: this checkpoint has no closed turn boundary yet.",
			guardId !== void 0 ? `rewind guard: ${guardId}` : ""
		].filter((line) => line !== "").join("\n")
	};
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
/** The blackboard node registry domain. */
const blackboardDomain = defineDomain({
	name: "ant_sword_blackboard",
	version: 1,
	tables: { nodes: domainTable(z$2.object({
		id: z$2.string(),
		sessionId: z$2.string(),
		kind: z$2.enum([
			"fact",
			"intent",
			"hint",
			"goal"
		]),
		label: z$2.string(),
		detail: z$2.string().optional(),
		parentId: z$2.string().optional(),
		status: z$2.enum([
			"open",
			"claimed",
			"done",
			"abandoned"
		]).optional(),
		time: z$2.number(),
		cycle: z$2.number()
	})) }
});
//#endregion
//#region lib/types/auto/blackboard.js
/**
* Blackboard service (`ctx.blackboard`): the Fact/Intent/Hint graph the
* autonomous loop grows. Built only on forward-stable public primitives —
* `ctx.storageDomain` for durability, `session.append` for the model- and
* UI-visible event stream, and the `session/projection` registry so the Web
* graph view folds the same events live. Every mutation appends a
* `board/change` event and emits `board/changed`, keeping the durable store,
* the session log, and the UI projection on one authoritative write path.
*
* @module @deepseek-ai/dsh-ant-sword-harness/auto/blackboard
*/
/** Session event type for a blackboard mutation. */
const BOARD_CHANGE = "board/change";
function newNodeId() {
	return randomBytes(8).toString("hex");
}
/**
* The blackboard: one graph per session, addressed by the session the caller
* is operating on. Not a model-facing surface — the loop and the UI drive it;
* the model reaches it through the loop's tools.
*/
var BlackboardService = class extends Service {
	static inject = ["storageDomain"];
	domainReady;
	cycles = /* @__PURE__ */ new Map();
	paused = /* @__PURE__ */ new Map();
	complete = /* @__PURE__ */ new Map();
	/**
	* @param ctx - plugin context.
	* @param facility - optional explicit DomainFacility (tests); defaults to
	* the injected `ctx.storageDomain` service.
	*/
	constructor(ctx, facility) {
		super(ctx, "blackboard");
		const source = facility ?? ctx.storageDomain;
		this.domainReady = source.open(blackboardDomain);
		this.domainReady.catch(() => void 0);
		ctx.effect(async () => {
			const domain = await this.domainReady.catch(() => void 0);
			return () => {
				domain?.close();
			};
		}, "ant-sword-blackboard: domain");
	}
	cycleOf(sessionId) {
		return this.cycles.get(sessionId) ?? 0;
	}
	/** All nodes for one session, creation order. */
	async nodes(session) {
		const domain = await this.domainReady;
		const out = [];
		for (const [, node] of domain.table("nodes").entries()) if (node.sessionId === session.id) out.push(node);
		return out.sort((a, b) => a.time - b.time);
	}
	/** A consistent point-in-time read of one session's board. */
	async snapshot(session) {
		return {
			nodes: await this.nodes(session),
			cycle: this.cycleOf(session.id),
			paused: this.paused.get(session.id) ?? false,
			complete: this.complete.get(session.id) ?? false
		};
	}
	/**
	* Append a node, persist it, and publish the change. The single write path
	* for Facts, Intents, Hints, and the Goal node.
	*/
	async add(session, input) {
		const node = {
			id: newNodeId(),
			sessionId: session.id,
			kind: input.kind,
			label: input.label,
			...input.detail !== void 0 ? { detail: input.detail } : {},
			...input.parentId !== void 0 ? { parentId: input.parentId } : {},
			...input.status !== void 0 ? { status: input.status } : {},
			time: Date.now(),
			cycle: this.cycleOf(session.id)
		};
		await (await this.domainReady).table("nodes").put(node.id, node);
		session.append(BOARD_CHANGE, {
			op: "add",
			node
		});
		const snapshot = await this.snapshot(session);
		this.ctx.emit("board/changed", session, snapshot);
		return node;
	}
	/** Transition an Intent's lifecycle (claim → done/abandoned). */
	async setStatus(session, nodeId, status) {
		await (await this.domainReady).table("nodes").update(nodeId, (current) => ({
			...current,
			status
		}));
		session.append(BOARD_CHANGE, {
			op: "status",
			nodeId,
			status
		});
		const snapshot = await this.snapshot(session);
		this.ctx.emit("board/changed", session, snapshot);
	}
	/** Advance the OODA cycle index for a session and return the new value. */
	nextCycle(session) {
		const next = this.cycleOf(session.id) + 1;
		this.cycles.set(session.id, next);
		session.append("board/change", {
			op: "cycle",
			cycle: next
		});
		return next;
	}
	/** Operator pause flag; the loop reads it between cycles. */
	setPaused(session, paused) {
		this.paused.set(session.id, paused);
		session.append("board/change", {
			op: "paused",
			paused
		});
	}
	isPaused(session) {
		return this.paused.get(session.id) ?? false;
	}
	/** Mark the goal reached; the loop stops scheduling new cycles. */
	markComplete(session) {
		this.complete.set(session.id, true);
		session.append("board/change", {
			op: "complete",
			complete: true
		});
	}
	isComplete(session) {
		return this.complete.get(session.id) ?? false;
	}
};
/**
* Projection fold: rebuild the board snapshot by replaying `board/change`
* events. Projection-grade — plain JSON in/out, same reference when the event
* is not a board change (the registry's Object.is gate). Every state that the
* UI renders (nodes, cycle, paused, complete) flows through this one stream.
*/
function applyBoardProjection(state, event) {
	if (event.type !== "board/change") return state;
	const data = event.data;
	const current = state ?? {
		nodes: [],
		cycle: 0,
		paused: false,
		complete: false
	};
	if (data.op === "add") return {
		...current,
		nodes: [...current.nodes, data.node]
	};
	if (data.op === "status") return {
		...current,
		nodes: current.nodes.map((n) => n.id === data.nodeId ? {
			...n,
			status: data.status
		} : n)
	};
	if (data.op === "cycle") return {
		...current,
		cycle: data.cycle
	};
	if (data.op === "paused") return {
		...current,
		paused: data.paused
	};
	return {
		...current,
		complete: data.complete
	};
}
//#endregion
//#region lib/types/auto/loop.js
/**
* OODA loop controller (`applyAutoLoop`): drives the autonomous cycle —
* Observe the blackboard, Orient to current state, Decide next Intents, Act
* on the top one — and exposes the operator's pause / resume / inject-hint
* surface. Concrete execution is delegated to the preset's own tools (shell,
* subagent, workflow, the eight MCP servers); this controller owns only the
* loop, the stall detector, and the budget guardrails (CHYing ABANDON-style).
* The model reaches the board through the registered `board_*` tools; the UI
* reaches the controller through `ctx.autoLoop`.
*
* @module @deepseek-ai/dsh-ant-sword-harness/auto/loop
*/
/** Schemastery validation for {@link AutoLoopConfig}. */
const AutoLoopConfigSchema = z.object({
	enabled: z.boolean(),
	maxCycles: z.number(),
	stallThreshold: z.number(),
	maxDurationMs: z.number()
});
function resolveConfig(config) {
	return {
		enabled: config.enabled ?? true,
		maxCycles: config.maxCycles ?? 64,
		stallThreshold: config.stallThreshold ?? 3,
		maxDurationMs: config.maxDurationMs ?? 1800 * 1e3
	};
}
/**
* Operator-facing control surface for the autonomous loop. The UI control bar
* drives it through the `/auto` command (pause/resume/hint/status); these
* methods are deliberately thin over the agent's own cancel/steer primitives
* plus the blackboard's pause flag.
*/
var AutoLoopService = class extends Service {
	static inject = ["blackboard"];
	constructor(ctx) {
		super(ctx, "autoLoop");
	}
	/** Pause the loop for a session: halts scheduling after the current step. */
	pause(session) {
		this.ctx.blackboard.setPaused(session, true);
	}
	/** Resume a paused loop by nudging the agent with a continue steer. */
	resume(agent) {
		this.ctx.blackboard.setPaused(agent.session, false);
		agent.steer(createUserMessage({
			content: [{
				type: "text",
				text: "[auto-loop] Operator resumed. Continue the autonomous loop: read the blackboard, then act on the highest-priority open Intent."
			}],
			source: {
				kind: "plugin",
				plugin: "auto-loop"
			}
		}));
	}
	/** Inject an operator Hint mid-run: recorded on the board and steered in. */
	async injectHint(agent, text) {
		await this.ctx.blackboard.add(agent.session, {
			kind: "hint",
			label: text
		});
		agent.steer(createUserMessage({
			content: [{
				type: "text",
				text: `[auto-loop] Operator hint: ${text}\nAbsorb this into your next Observe/Orient pass and re-plan Intents accordingly.`
			}],
			source: {
				kind: "plugin",
				plugin: "auto-loop"
			}
		}));
	}
};
function blackboardOf(ctx) {
	const service = ctx.get("blackboard");
	if (service === void 0) throw new Error("auto-loop: blackboard service is unavailable");
	return service;
}
function autoLoopOf(ctx) {
	const service = ctx.get("autoLoop");
	if (service === void 0) throw new Error("auto-loop: controller service is unavailable");
	return service;
}
/** Register the `/auto` operator command: the UI control bar's channel. */
function registerAutoCommand(ctx) {
	ctx.commands.register({
		name: "auto",
		description: "Control the autonomous loop: /auto pause | resume | hint <text> | status",
		input: { hint: "[pause | resume | hint <text> | status]" },
		handler: async (invocation) => {
			const agent = invocation.agent;
			const board = blackboardOf(ctx);
			const loop = autoLoopOf(ctx);
			const arg = invocation.rawInput.trim();
			if (arg === "pause") {
				loop.pause(agent.session);
				return {
					kind: "success",
					text: "auto-loop: paused. The run halts after the current step. Resume with \"/auto resume\"."
				};
			}
			if (arg === "resume") {
				loop.resume(agent);
				return {
					kind: "success",
					text: "auto-loop: resumed."
				};
			}
			if (arg.startsWith("hint ")) {
				const text = arg.slice(5).trim();
				if (text.length === 0) return {
					kind: "error",
					text: "auto-loop: \"/auto hint <text>\" needs hint text."
				};
				await loop.injectHint(agent, text);
				return {
					kind: "success",
					text: `auto-loop: hint injected — ${text}`
				};
			}
			if (arg === "status") {
				const snap = await board.snapshot(agent.session);
				return {
					kind: "success",
					text: `auto-loop: cycle ${snap.cycle}, ${snap.nodes.length} node(s), paused=${snap.paused}, complete=${snap.complete}`
				};
			}
			return {
				kind: "error",
				text: "auto-loop: unknown subcommand. Use pause | resume | hint <text> | status."
			};
		}
	});
}
/**
* Mount the autonomous loop: registers the model-facing `board_*` tools, the
* `ctx.autoLoop` control surface, and the idle-transition driver that advances
* the OODA cycle. Everything disposes with ctx.
* @param ctx - plugin context carrying tools, blackboard, and the agent events.
* @param config - loop configuration; defaults applied per key.
*/
function applyAutoLoop(ctx, config) {
	const resolved = resolveConfig(config);
	if (!resolved.enabled) return;
	ctx.plugin(BlackboardService);
	ctx.plugin(AutoLoopService);
	registerAutoCommand(ctx);
	const boardProjectionSchema = z$1.union([z$1.object({
		nodes: z$1.array(z$1.object({
			id: z$1.string(),
			sessionId: z$1.string(),
			kind: z$1.enum([
				"fact",
				"intent",
				"hint",
				"goal"
			]),
			label: z$1.string(),
			detail: z$1.string().optional(),
			parentId: z$1.string().optional(),
			status: z$1.enum([
				"open",
				"claimed",
				"done",
				"abandoned"
			]).optional(),
			time: z$1.number(),
			cycle: z$1.number()
		})),
		cycle: z$1.number(),
		paused: z$1.boolean(),
		complete: z$1.boolean()
	}), z$1.null()]);
	ctx.inject(["sessionProjections"], (projectionCtx) => {
		projectionCtx.sessionProjections.register({
			key: "board",
			schema: boardProjectionSchema,
			init: () => null,
			apply: applyBoardProjection,
			view: (state) => state,
			stateVersion: 1
		});
	});
	const loops = /* @__PURE__ */ new Map();
	const stateOf = (sessionId) => {
		let s = loops.get(sessionId);
		if (s === void 0) {
			s = {
				startedAt: Date.now(),
				recentSignatures: []
			};
			loops.set(sessionId, s);
		}
		return s;
	};
	const board = () => blackboardOf(ctx);
	ctx.tools.register(defineTool({
		name: "board_write",
		description: "Write a node to the engagement blackboard (the shared Fact/Intent/Hint graph that drives this autonomous run). Write a `fact` for every confirmed, objective finding (open port, credential, version, reachable path). Write an `intent` for each direction of exploration you decide to pursue next. Write the single `goal` node once, at bootstrap, to fix the target state. Link each node to the node it derives from via parentId so the graph grows origin → goal.",
		parameters: {
			kind: {
				type: "string",
				required: true,
				enum: [
					"fact",
					"intent",
					"goal"
				],
				description: "fact=confirmed finding, intent=next exploration, goal=target state (write once)."
			},
			label: {
				type: "string",
				required: true,
				description: "One-line summary of the node."
			},
			detail: {
				type: "string",
				description: "Supporting evidence or payload, optional."
			},
			parentId: {
				type: "string",
				description: "Id of the node this derives from; omit for the origin."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					id: {
						type: "string",
						required: true
					},
					cycle: {
						type: "integer",
						required: true
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `blackboard: wrote node ${value.id} (cycle ${value.cycle})`
			}]
		},
		async execute(args, exec) {
			if (!exec.agent) throw new Error("board_write requires an owning agent session");
			const node = await board().add(exec.agent.session, {
				kind: args.kind,
				label: args.label,
				...args.detail !== void 0 ? { detail: args.detail } : {},
				...args.parentId !== void 0 ? { parentId: args.parentId } : {},
				...args.kind === "intent" ? { status: "open" } : {}
			});
			return {
				id: node.id,
				cycle: node.cycle
			};
		}
	}));
	ctx.tools.register(defineTool({
		name: "board_read",
		description: "Read the current blackboard: every Fact, open Intent, Hint, and the Goal, with the loop cycle and pause/complete flags. Call this at the start of each Observe pass before deciding what to do next.",
		parameters: {},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { summary: {
					type: "string",
					required: true
				} }
			},
			render: (_args, value) => [{
				type: "text",
				text: value.summary
			}]
		},
		async execute(_args, exec) {
			if (!exec.agent) throw new Error("board_read requires an owning agent session");
			const snap = await board().snapshot(exec.agent.session);
			const lines = snap.nodes.map((n) => `#${n.id} [${n.kind}${n.status !== void 0 ? `/${n.status}` : ""}] (cycle ${n.cycle}) ${n.label}${n.parentId !== void 0 ? ` <- ${n.parentId}` : ""}`);
			return { summary: [`blackboard: ${snap.nodes.length} node(s), cycle ${snap.cycle}, paused=${snap.paused}, complete=${snap.complete}`, ...lines].join("\n") };
		}
	}));
	ctx.tools.register(defineTool({
		name: "board_transition",
		description: "Transition an Intent you own: `claimed` when you start executing it, `done` when it produced its Fact, `abandoned` when it is a proven dead end. Always close an Intent you claimed — an abandoned Intent must be followed by deciding a DIFFERENT direction, never retrying the same one.",
		parameters: {
			nodeId: {
				type: "string",
				required: true,
				description: "Id of the Intent node."
			},
			status: {
				type: "string",
				required: true,
				enum: [
					"claimed",
					"done",
					"abandoned"
				],
				description: "New lifecycle state."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { ok: {
					type: "boolean",
					required: true
				} }
			},
			render: (_args, value) => [{
				type: "text",
				text: value.ok ? "blackboard: intent transitioned" : "blackboard: no-op"
			}]
		},
		async execute(args, exec) {
			if (!exec.agent) throw new Error("board_transition requires an owning agent session");
			await board().setStatus(exec.agent.session, args.nodeId, args.status);
			return { ok: true };
		}
	}));
	ctx.tools.register(defineTool({
		name: "board_complete",
		description: "Mark the engagement goal reached. Call only when you hold evidence the Goal node is satisfied; this stops the autonomous loop.",
		parameters: { evidence: {
			type: "string",
			required: true,
			description: "Why the goal is met (flag, shell, access proof)."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { ok: {
					type: "boolean",
					required: true
				} }
			},
			render: (_args, value) => [{
				type: "text",
				text: value.ok ? "blackboard: goal marked complete — loop stops" : "blackboard: no-op"
			}]
		},
		async execute(args, exec) {
			if (!exec.agent) throw new Error("board_complete requires an owning agent session");
			board().markComplete(exec.agent.session);
			await board().add(exec.agent.session, {
				kind: "fact",
				label: "GOAL MET",
				detail: args.evidence
			});
			return { ok: true };
		}
	}));
	ctx.on("agent/status", ({ agent, status }) => {
		if (status !== "idle") return;
		(async () => {
			const session = agent.session;
			if (board().isPaused(session) || board().isComplete(session)) return;
			const state = stateOf(session.id);
			const snap = await board().snapshot(session);
			if (snap.cycle >= resolved.maxCycles) return;
			if (Date.now() - state.startedAt > resolved.maxDurationMs) return;
			if (snap.nodes.length === 0) return;
			const cycle = board().nextCycle(session);
			const top = snap.nodes.filter((n) => n.kind === "intent" && (n.status === "open" || n.status === void 0)).at(-1);
			const prompt = top !== void 0 ? `[auto-loop] OODA cycle ${cycle}. Act on Intent #${top.id}: "${top.label}". Claim it (board_transition), execute it with your tools, write the resulting Fact (board_write), then close it. If it proves a dead end, abandon it and decide a different direction.` : `[auto-loop] OODA cycle ${cycle}. No open Intents. Observe the blackboard (board_read), Orient, and Decide your next Intents (board_write kind=intent). If the Goal is met, call board_complete.`;
			agent.steer(createUserMessage({
				content: [{
					type: "text",
					text: prompt
				}],
				source: {
					kind: "plugin",
					plugin: "auto-loop"
				}
			}));
		})();
	});
	ctx.on("tools/post-execute", async (exec, _result, next) => {
		const agent = exec.agent;
		if (agent !== void 0) {
			const state = stateOf(agent.session.id);
			state.recentSignatures.push(exec.name);
			if (state.recentSignatures.length > resolved.stallThreshold) state.recentSignatures.shift();
			if (state.recentSignatures.length === resolved.stallThreshold && state.recentSignatures.every((s) => s === state.recentSignatures[0]) && !board().isPaused(agent.session)) {
				agent.steer(createUserMessage({
					content: [{
						type: "text",
						text: `[auto-loop] STALL detected: the same operation ran ${resolved.stallThreshold} times in a row. That path is a proven dead end. Abandon the current Intent (board_transition status=abandoned) and decide a COMPLETELY different direction.`
					}],
					source: {
						kind: "plugin",
						plugin: "auto-loop"
					}
				}));
				state.recentSignatures = [];
			}
		}
		return next();
	}, { global: true });
}
//#endregion
//#region lib/types/runtime-status.js
/** Deployment-level runtime status for the red-team bundle. */
const INSTALL_GUIDES = {
	kali: {
		command: "pip install kali-server-mcp",
		hint: "安装 kali-server-mcp，并确保命令已加入 PATH。"
	},
	metasploit: {
		command: "pip install metasploit-mcp",
		hint: "安装 Metasploit MCP bridge，并先完成 Metasploit 初始化。"
	},
	hexstrike: {
		command: "pip install hexstrike-ai",
		hint: "安装 HexStrike AI MCP 服务并将 hexstrike-ai 加入 PATH。"
	},
	pentestswarm: {
		command: "pip install pentestswarm",
		hint: "安装 PentestSwarm，并在配置中填写编排器 API key。"
	},
	jshook: {
		command: "npm install -g @jshookmcp/jshook",
		hint: "需要 Node.js；也可保留 npx 按需下载模式。"
	},
	anything: { hint: "启动 AnythingLLM MCP 服务，并确认 http://localhost:23816/mcp 可访问。" },
	idapro: { hint: "在 IDA Pro 中启动 MCP 插件，并确认 http://127.0.0.1:13337/mcp 可访问。" },
	ghidra: { hint: "在 Ghidra 中启动 MCP 插件，并确认 http://localhost:8765/mcp 可访问。" }
};
function commandExists(command) {
	if (command === "") return false;
	return spawnSync(process.platform === "win32" ? "where.exe" : "which", [command], {
		stdio: "ignore",
		windowsHide: true
	}).status === 0;
}
function mcpStatus(server) {
	const guide = INSTALL_GUIDES[server.serverName] ?? { hint: "安装对应 MCP server，并确认配置的命令或 URL 可访问。" };
	const target = server.transport === "stdio" ? server.command ?? "" : server.url ?? "";
	const availability = server.enabled === false ? "disabled" : server.transport === "stdio" ? commandExists(target) ? "available" : "missing" : "configured";
	return {
		serverName: server.serverName,
		transport: server.transport,
		availability,
		target,
		...guide.command === void 0 ? {} : { installCommand: guide.command },
		installHint: guide.hint
	};
}
function applyRuntimeStatus(ctx, servers) {
	let disposed = false;
	let running = false;
	let latest = {
		checkedAt: Date.now(),
		skills: {
			available: 0,
			provider: skillProvider.name,
			state: "ready"
		},
		mcp: servers.map(mcpStatus)
	};
	const publish = async () => {
		if (running || disposed) return;
		running = true;
		let skills;
		try {
			const candidates = await skillProvider.list({ signal: new AbortController().signal });
			skills = {
				available: "candidates" in candidates ? candidates.candidates.length : candidates.length,
				provider: skillProvider.name,
				state: "ready"
			};
		} catch (error) {
			skills = {
				available: 0,
				provider: skillProvider.name,
				state: "error",
				error: String(error)
			};
		}
		if (!disposed) {
			latest = {
				checkedAt: Date.now(),
				skills,
				mcp: servers.map(mcpStatus)
			};
			ctx.emit("ant-sword/runtime-status", latest);
		}
		running = false;
	};
	publish();
	const timer = setInterval(() => {
		publish();
	}, 5e3);
	timer.unref();
	ctx.effect(() => () => {
		disposed = true;
		clearInterval(timer);
	}, "ant-sword-runtime-status: publisher");
	ctx.inject(["webServer"], (scope) => {
		scope.effect(() => scope.webServer.register({
			kind: "exact",
			path: "/ant-sword/runtime-status",
			handler: (req, res) => {
				if (req.method !== "GET" && req.method !== "HEAD") {
					res.writeHead(405);
					res.end();
					return;
				}
				const body = JSON.stringify(latest);
				res.writeHead(200, {
					"content-type": "application/json; charset=utf-8",
					"cache-control": "no-store"
				});
				res.end(req.method === "HEAD" ? void 0 : body);
			}
		}), "ant-sword-runtime-status: HTTP endpoint");
	});
	ctx.on("skills/change", () => {
		publish();
	});
}
//#endregion
//#region lib/types/mcp-servers.js
/**
* Embedded offensive-security MCP servers: the catalog of eight Kali/reverse
* MCP servers the autonomous preset bridges in, declared as plugin Config so
* each server's transport/command/env/credentials is editable in the dsh
* plugin-config UI (never via environment-variable overrides). `applyMcpServers`
* mounts one `@deepseek-ai/dsh-mcp-client` instance per enabled server;
* a server that is absent fails soft (`failOnStartupError: false`), so the
* loop notes the gap and continues.
*
* @module @deepseek-ai/dsh-ant-sword-harness/mcp-servers
*/
/** Schemastery validation for {@link McpServerConfig}. */
const McpServerSchema = z.object({
	enabled: z.boolean().default(true).description("启用此 MCP 服务器；关闭则不挂载，其 mcp__* 工具不出现。"),
	serverName: z.string().required().description("工具命名空间，模型看到的是 mcp__<serverName>__<tool>。"),
	transport: z.union(["stdio", "streamable-http"]).required().description("stdio=拉起子进程；streamable-http=连接已在运行的服务。"),
	command: z.string().description("stdio：要启动的可执行文件。"),
	args: z.array(z.string()).description("stdio：命令参数。"),
	env: z.dict(z.string()).description("stdio：额外环境变量（不含密钥，密钥走 secret 字段）。"),
	url: z.string().description("streamable-http：服务器地址。"),
	headers: z.dict(z.string()).description("streamable-http：额外请求头。")
});
/**
* The default eight-server catalog, each enabled by default — the bundle's
* `mcpServers` config row renders one toggleable entry per server in the dsh
* plugin-config UI; flip `enabled` to false to leave a server unmounted. `env`
* carries only non-secret routing values; the pentestswarm orchestrator key is
* a `secret` role on the bundle Config (see index.ts), injected at mount time.
*/
const DEFAULT_MCP_SERVERS = [
	{
		enabled: true,
		serverName: "kali",
		transport: "stdio",
		command: "kali-server-mcp",
		args: ["--port", "5000"]
	},
	{
		enabled: true,
		serverName: "metasploit",
		transport: "stdio",
		command: "metasploitmcp",
		args: ["--transport", "stdio"]
	},
	{
		enabled: true,
		serverName: "hexstrike",
		transport: "stdio",
		command: "hexstrike-ai",
		args: []
	},
	{
		enabled: true,
		serverName: "pentestswarm",
		transport: "stdio",
		command: "pentestswarm",
		args: ["mcp", "serve"]
	},
	{
		enabled: true,
		serverName: "jshook",
		transport: "stdio",
		command: "npx",
		args: ["-y", "@jshookmcp/jshook@latest"],
		env: { JSHOOK_BASE_PROFILE: "search" }
	},
	{
		enabled: true,
		serverName: "anything",
		transport: "streamable-http",
		url: "http://localhost:23816/mcp"
	},
	{
		enabled: true,
		serverName: "idapro",
		transport: "streamable-http",
		url: "http://127.0.0.1:13337/mcp"
	},
	{
		enabled: true,
		serverName: "ghidra",
		transport: "streamable-http",
		url: "http://localhost:8765/mcp"
	}
];
/**
* Mount one mcp-client instance per enabled server. A server whose initial
* connection fails is logged and left to its reconnect loop (fail-soft), so
* one missing tool never blocks the composition.
* @param ctx - bundle plugin context.
* @param servers - the resolved server list (defaults merged by the caller).
* @param pentestswarmApiKey - optional orchestrator key injected into the
* pentestswarm server's env.
*/
function applyMcpServers(ctx, servers, pentestswarmApiKey) {
	for (const server of servers) {
		if (server.enabled === false) continue;
		const env = { ...server.env };
		if (server.serverName === "pentestswarm" && pentestswarmApiKey !== void 0 && pentestswarmApiKey !== "") env["PENTESTSWARM_ORCHESTRATOR_API_KEY"] = pentestswarmApiKey;
		const config = server.transport === "stdio" ? {
			transport: "stdio",
			serverName: server.serverName,
			command: server.command ?? "",
			args: server.args ?? [],
			env,
			cwd: "",
			toolCallTimeoutMs: 6e4,
			failOnStartupError: false
		} : {
			transport: "streamable-http",
			serverName: server.serverName,
			url: server.url ?? "",
			headers: server.headers ?? {},
			toolCallTimeoutMs: 6e4,
			failOnStartupError: false
		};
		ctx.plugin(mcpClient, config).await().catch(() => void 0);
	}
}
//#endregion
//#region lib/types/index.js
/**
* @deepseek-ai/dsh-ant-sword-harness — a security-research profile bundle. Its
* composition is the `cordis.patch.yml` declared by `dsh.bundle.patch`: this
* single Cordis plugin row mounts the bundled reverse/CTF skill pack and the
* self-contained rewind capability, and the patch additionally mounts the
* third-party agent-teams and plugin-market bundles.
*
* @module @deepseek-ai/dsh-ant-sword-harness
*/
/** Cordis plugin name. */
const name = "ant-sword-harness";
/** Services required by the bundled skill provider, rewind, the auto loop, and MCP tools. */
const inject = [
	"skills",
	"sessions",
	"storageDomain",
	"commands",
	"tools",
	"agents"
];
/** Schemastery validation for {@link Config}. */
const Config = z.object({
	rewind: RewindConfigSchema,
	autoLoop: AutoLoopConfigSchema,
	mcpServers: z.array(McpServerSchema).description("内嵌渗透 MCP 服务器列表；每台可用 enabled 单独启停，传输/命令/地址均可改。"),
	pentestswarmApiKey: z.string().role("secret").description("Pentest Swarm 编排器 API key，仅注入该服务器的 env。"),
	syncRedTeamPreset: z.boolean()
});
/**
* Mount the bundled skill pack, the rewind capability, and the red-team preset.
* All register on their owning services and dispose with ctx.
* @param ctx - plugin context carrying skills, sessions, storageDomain, commands.
* @param config - validated plugin config.
*/
function apply(ctx, config) {
	ctx.skills.registerProvider(() => skillProvider);
	applyRewind(ctx, config.rewind ?? {});
	applyAutoLoop(ctx, config.autoLoop ?? {});
	const mcpServers = config.mcpServers === void 0 || config.mcpServers.length === 0 ? DEFAULT_MCP_SERVERS : config.mcpServers;
	applyRuntimeStatus(ctx, mcpServers);
	applyMcpServers(ctx, mcpServers, config.pentestswarmApiKey);
	if (config.syncRedTeamPreset ?? true) {
		syncRedTeamPreset().catch(() => void 0);
		syncRedTeamAutoPreset().catch(() => void 0);
	}
}
//#endregion
export { Config, apply, inject, name };
