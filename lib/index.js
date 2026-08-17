import z from "@deepseek-ai/schemastery";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Service } from "@deepseek-ai/cordis";
import z$2, { z as z$1 } from "zod";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { spawnSync } from "node:child_process";
import { BUNDLED_SKILL_RANK, isSkillName } from "@deepseek-ai/dsh-skill";
import { homedir, tmpdir } from "node:os";
import * as mcpClient from "@deepseek-ai/dsh-mcp-client";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
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
function commandExists$1(command) {
	if (command === "") return false;
	return spawnSync(process.platform === "win32" ? "where.exe" : "which", [command], {
		stdio: "ignore",
		windowsHide: true
	}).status === 0;
}
function mcpStatus(server, probes, isMounted) {
	const guide = INSTALL_GUIDES[server.serverName] ?? { hint: "安装对应 MCP server，并确认配置的命令或 URL 可访问。" };
	const target = server.transport === "stdio" ? server.command ?? "" : server.url ?? "";
	const availability = server.enabled === false ? "disabled" : server.transport === "stdio" ? commandExists$1(target) ? "available" : "missing" : "configured";
	const lastProbe = probes.get(server.serverName);
	return {
		serverName: server.serverName,
		transport: server.transport,
		availability,
		target,
		...guide.command === void 0 ? {} : { installCommand: guide.command },
		installHint: guide.hint,
		mounted: isMounted(server.serverName),
		...lastProbe === void 0 ? {} : { lastProbe }
	};
}
async function readJsonBody(req) {
	const chunks = [];
	for await (const chunk of req) chunks.push(chunk);
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function applyRuntimeStatus(ctx, getServers, reloadMcp, probeMcp, isMcpMounted) {
	const lifecycle = { disposed: false };
	const isActive = () => !lifecycle.disposed;
	let running = false;
	const probes = /* @__PURE__ */ new Map();
	let latest = {
		checkedAt: Date.now(),
		skills: {
			available: 0,
			provider: skillProvider.name,
			state: "ready"
		},
		mcp: getServers().map((server) => mcpStatus(server, probes, isMcpMounted))
	};
	const publish = async () => {
		if (running || lifecycle.disposed) return;
		running = true;
		let skills;
		try {
			skills = {
				available: (await ctx.skills.list({ signal: new AbortController().signal })).length,
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
		if (isActive()) {
			latest = {
				checkedAt: Date.now(),
				skills,
				mcp: getServers().map((server) => mcpStatus(server, probes, isMcpMounted))
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
		lifecycle.disposed = true;
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
		scope.effect(() => scope.webServer.register({
			kind: "exact",
			path: "/ant-sword/mcp/reload",
			handler: async (req, res) => {
				if (req.method !== "POST") {
					res.writeHead(405);
					res.end();
					return;
				}
				try {
					const body = await readJsonBody(req);
					if (typeof body.serverName !== "string" || body.serverName === "") throw new TypeError("serverName is required");
					await reloadMcp(body.serverName);
					await publish();
					res.writeHead(200, {
						"content-type": "application/json; charset=utf-8",
						"cache-control": "no-store"
					});
					res.end(JSON.stringify({
						ok: true,
						serverName: body.serverName
					}));
				} catch (error) {
					res.writeHead(400, {
						"content-type": "application/json; charset=utf-8",
						"cache-control": "no-store"
					});
					res.end(JSON.stringify({
						ok: false,
						error: error instanceof Error ? error.message : String(error)
					}));
				}
			}
		}), "ant-sword-runtime-status: MCP reload endpoint");
		scope.effect(() => scope.webServer.register({
			kind: "exact",
			path: "/ant-sword/mcp/probe",
			handler: async (req, res) => {
				if (req.method !== "POST") {
					res.writeHead(405);
					res.end();
					return;
				}
				try {
					const body = await readJsonBody(req);
					if (typeof body.serverName !== "string" || body.serverName === "") throw new TypeError("serverName is required");
					const result = await probeMcp(body.serverName);
					probes.set(body.serverName, {
						checkedAt: Date.now(),
						toolCount: result.toolCount,
						tools: result.tools
					});
					await publish();
					res.writeHead(200, {
						"content-type": "application/json; charset=utf-8",
						"cache-control": "no-store"
					});
					res.end(JSON.stringify({
						ok: true,
						serverName: body.serverName,
						toolCount: result.toolCount,
						tools: result.tools
					}));
				} catch (error) {
					res.writeHead(400, {
						"content-type": "application/json; charset=utf-8",
						"cache-control": "no-store"
					});
					res.end(JSON.stringify({
						ok: false,
						error: error instanceof Error ? error.message : String(error)
					}));
				}
			}
		}), "ant-sword-runtime-status: MCP probe endpoint");
	});
	ctx.on("skills/change", () => {
		publish();
	});
}
//#endregion
//#region lib/types/installer/catalog.js
/** Controlled installation catalog consumed by the ant-sword installer. */
const COMMAND_TIMEOUT = 10 * 6e4;
function npmComponent(id, label, packageSpec, command) {
	return {
		id,
		label,
		version: packageSpec.slice(packageSpec.lastIndexOf("@") + 1),
		dependencies: ["node"],
		probe: {
			kind: "command",
			command,
			args: ["--version"]
		},
		variants: [{
			platform: "win32",
			architectures: ["x64", "arm64"],
			steps: [{
				kind: "command",
				phase: "installing",
				executable: "npm",
				args: [
					"install",
					"--global",
					packageSpec,
					"--registry",
					"https://registry.npmjs.org"
				],
				timeoutMs: COMMAND_TIMEOUT
			}]
		}, {
			platform: "linux",
			architectures: ["x64", "arm64"],
			steps: [{
				kind: "command",
				phase: "installing",
				executable: "npm",
				args: [
					"install",
					"--global",
					packageSpec,
					"--registry",
					"https://registry.npmjs.org"
				],
				timeoutMs: COMMAND_TIMEOUT
			}]
		}]
	};
}
function pipxComponent(id, label, packageSpec, command) {
	return {
		id,
		label,
		version: packageSpec.includes("==") ? packageSpec.split("==").at(1) ?? "pinned-commit" : "pinned-commit",
		dependencies: ["python", "pipx"],
		probe: {
			kind: "command",
			command,
			args: ["--help"]
		},
		variants: [{
			platform: "win32",
			architectures: ["x64", "arm64"],
			steps: [{
				kind: "command",
				phase: "installing",
				executable: "pipx",
				args: [
					"install",
					"--force",
					packageSpec
				],
				timeoutMs: COMMAND_TIMEOUT
			}]
		}, {
			platform: "linux",
			architectures: ["x64", "arm64"],
			steps: [{
				kind: "command",
				phase: "installing",
				executable: "pipx",
				args: [
					"install",
					"--force",
					packageSpec
				],
				timeoutMs: COMMAND_TIMEOUT
			}]
		}]
	};
}
const INSTALL_CATALOG = [
	{
		id: "git",
		label: "Git",
		version: "system",
		dependencies: [],
		probe: {
			kind: "command",
			command: "git",
			args: ["--version"]
		},
		variants: [{
			platform: "win32",
			architectures: ["x64", "arm64"],
			steps: [{
				kind: "command",
				phase: "installing",
				executable: "winget",
				args: [
					"install",
					"--exact",
					"--id",
					"Git.Git",
					"--accept-package-agreements",
					"--accept-source-agreements"
				],
				timeoutMs: COMMAND_TIMEOUT
			}]
		}, {
			platform: "linux",
			architectures: ["x64", "arm64"],
			steps: [{
				kind: "command",
				phase: "installing",
				executable: "apt-get",
				args: [
					"install",
					"-y",
					"git"
				],
				timeoutMs: COMMAND_TIMEOUT
			}]
		}]
	},
	{
		id: "python",
		label: "Python",
		version: "3.12",
		dependencies: [],
		probe: {
			kind: "command",
			command: "python",
			args: ["--version"]
		},
		variants: [{
			platform: "win32",
			architectures: ["x64", "arm64"],
			steps: [{
				kind: "command",
				phase: "installing",
				executable: "winget",
				args: [
					"install",
					"--exact",
					"--id",
					"Python.Python.3.12",
					"--accept-package-agreements",
					"--accept-source-agreements"
				],
				timeoutMs: COMMAND_TIMEOUT
			}]
		}, {
			platform: "linux",
			architectures: ["x64", "arm64"],
			steps: [{
				kind: "command",
				phase: "installing",
				executable: "apt-get",
				args: [
					"install",
					"-y",
					"python3",
					"python3-pip",
					"python3-venv"
				],
				timeoutMs: COMMAND_TIMEOUT
			}]
		}]
	},
	{
		id: "pipx",
		label: "pipx",
		version: "1.16.5",
		dependencies: ["python"],
		probe: {
			kind: "command",
			command: "pipx",
			args: ["--version"]
		},
		variants: [{
			platform: "win32",
			architectures: ["x64", "arm64"],
			steps: [{
				kind: "command",
				phase: "installing",
				executable: "python",
				args: [
					"-m",
					"pip",
					"install",
					"--user",
					"pipx==1.16.5"
				],
				timeoutMs: COMMAND_TIMEOUT
			}]
		}, {
			platform: "linux",
			architectures: ["x64", "arm64"],
			steps: [{
				kind: "command",
				phase: "installing",
				executable: "python3",
				args: [
					"-m",
					"pip",
					"install",
					"--user",
					"pipx==1.16.5"
				],
				timeoutMs: COMMAND_TIMEOUT
			}]
		}]
	},
	{
		id: "node",
		label: "Node.js",
		version: "22",
		dependencies: [],
		probe: {
			kind: "command",
			command: "node",
			args: ["--version"]
		},
		variants: [{
			platform: "win32",
			architectures: ["x64", "arm64"],
			steps: [{
				kind: "command",
				phase: "installing",
				executable: "winget",
				args: [
					"install",
					"--exact",
					"--id",
					"OpenJS.NodeJS.LTS",
					"--accept-package-agreements",
					"--accept-source-agreements"
				],
				timeoutMs: COMMAND_TIMEOUT
			}]
		}, {
			platform: "linux",
			architectures: ["x64", "arm64"],
			steps: [{
				kind: "external-action",
				phase: "configuring",
				message: "Install Node.js 22 LTS with the distribution or vendor package manager."
			}]
		}]
	},
	{
		id: "java",
		label: "Java Runtime",
		version: "21",
		dependencies: [],
		probe: {
			kind: "command",
			command: "java",
			args: ["--version"]
		},
		variants: [{
			platform: "win32",
			architectures: ["x64", "arm64"],
			steps: [{
				kind: "command",
				phase: "installing",
				executable: "winget",
				args: [
					"install",
					"--exact",
					"--id",
					"EclipseAdoptium.Temurin.21.JDK",
					"--accept-package-agreements",
					"--accept-source-agreements"
				],
				timeoutMs: COMMAND_TIMEOUT
			}]
		}, {
			platform: "linux",
			architectures: ["x64", "arm64"],
			steps: [{
				kind: "command",
				phase: "installing",
				executable: "apt-get",
				args: [
					"install",
					"-y",
					"openjdk-21-jdk"
				],
				timeoutMs: COMMAND_TIMEOUT
			}]
		}]
	},
	npmComponent("jshookmcp", "JS Hook MCP", "@jshookmcp/jshook@0.3.4", "jshook"),
	npmComponent("reqable-mcp", "Reqable MCP", "reqable-mcp-server@1.0.1", "reqable-mcp-server"),
	pipxComponent("idalib-mcp", "IDA Pro MCP", "git+https://github.com/mrexodia/ida-pro-mcp.git@f82e6e2517a161b77e738951c3071cd446480ba0", "ida-pro-mcp"),
	{
		id: "ghidra",
		label: "Ghidra",
		version: "11.4.2",
		dependencies: ["java"],
		probe: {
			kind: "command",
			command: "analyzeHeadless",
			args: ["-help"]
		},
		installDirectory: "ghidra",
		variants: [{
			platform: "win32",
			architectures: ["x64", "arm64"],
			steps: [{
				kind: "download",
				phase: "downloading",
				targetName: "ghidra.zip",
				timeoutMs: COMMAND_TIMEOUT,
				officialDigest: {
					apiUrl: "https://api.github.com/repos/NationalSecurityAgency/ghidra/releases/tags/Ghidra_11.4.2_build",
					assetName: "ghidra_11.4.2_PUBLIC_20250826.zip"
				},
				sources: [{
					id: "ghproxy",
					region: "domestic",
					url: "https://ghproxy.net/https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_11.4.2_build/ghidra_11.4.2_PUBLIC_20250826.zip"
				}, {
					id: "github",
					region: "official",
					url: "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_11.4.2_build/ghidra_11.4.2_PUBLIC_20250826.zip"
				}]
			}]
		}, {
			platform: "linux",
			architectures: ["x64", "arm64"],
			steps: [{
				kind: "download",
				phase: "downloading",
				targetName: "ghidra.zip",
				timeoutMs: COMMAND_TIMEOUT,
				officialDigest: {
					apiUrl: "https://api.github.com/repos/NationalSecurityAgency/ghidra/releases/tags/Ghidra_11.4.2_build",
					assetName: "ghidra_11.4.2_PUBLIC_20250826.zip"
				},
				sources: [{
					id: "github",
					region: "official",
					url: "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_11.4.2_build/ghidra_11.4.2_PUBLIC_20250826.zip"
				}]
			}]
		}]
	},
	{
		id: "ghidra-mcp",
		label: "Ghidra MCP",
		version: "controlled-release",
		dependencies: [
			"ghidra",
			"git",
			"python"
		],
		probe: {
			kind: "http",
			url: "http://127.0.0.1:8765/mcp"
		},
		variants: [{
			platform: "win32",
			architectures: ["x64", "arm64"],
			steps: [{
				kind: "external-action",
				phase: "configuring",
				message: "Install the pinned GhidraMCP extension in Ghidra and open a project to start port 8765."
			}]
		}, {
			platform: "linux",
			architectures: ["x64", "arm64"],
			steps: [{
				kind: "external-action",
				phase: "configuring",
				message: "Install the pinned GhidraMCP extension in Ghidra and open a project to start port 8765."
			}]
		}],
		restartRequired: true
	}
];
function catalogById(catalog = INSTALL_CATALOG) {
	const result = /* @__PURE__ */ new Map();
	for (const component of catalog) {
		if (result.has(component.id)) throw new TypeError(`duplicate installer component "${component.id}"`);
		result.set(component.id, component);
	}
	return result;
}
//#endregion
//#region lib/types/installer/planner.js
/** Dependency planning and source ordering for controlled installations. */
function orderSources(sources, policy) {
	if (policy === "official-first") return [...sources].sort((a, b) => Number(a.region === "domestic") - Number(b.region === "domestic"));
	if (policy === "domestic-first") return [...sources].sort((a, b) => Number(a.region === "official") - Number(b.region === "official"));
	return [...sources].sort((a, b) => Number(a.region === "official") - Number(b.region === "official"));
}
function planInstallation(componentId, platform, architecture, catalog) {
	const entries = catalogById(catalog);
	const visiting = /* @__PURE__ */ new Set();
	const visited = /* @__PURE__ */ new Set();
	const result = [];
	const visit = (id) => {
		if (visited.has(id)) return;
		if (visiting.has(id)) throw new TypeError(`installer dependency cycle at "${id}"`);
		const component = entries.get(id);
		if (component === void 0) throw new TypeError(`unknown installer component "${id}"`);
		const variant = component.variants.find((candidate) => candidate.platform === platform && candidate.architectures.includes(architecture));
		if (variant === void 0) throw new TypeError(`component "${id}" does not support ${platform}/${architecture}`);
		visiting.add(id);
		for (const dependency of component.dependencies) visit(dependency);
		visiting.delete(id);
		visited.add(id);
		result.push({
			component,
			variant
		});
	};
	visit(componentId);
	return result;
}
//#endregion
//#region lib/types/installer/transaction.js
/** Bounded, cancellable transaction engine for controlled installations. */
var InstallerError = class extends Error {
	retryable;
	constructor(message, retryable) {
		super(message);
		this.retryable = retryable;
		this.name = "InstallerError";
	}
};
const MAX_LOG_BYTES = 64 * 1024;
const MAX_ATTEMPTS_PER_SOURCE = 2;
function boundedLogs(logs, next) {
	const entries = [...logs, next];
	while (Buffer.byteLength(entries.join("\n"), "utf8") > MAX_LOG_BYTES) entries.shift();
	return entries;
}
function abortError(signal) {
	return signal.reason instanceof Error ? signal.reason : new InstallerError("installation cancelled", false);
}
function abortableDelay(milliseconds, signal) {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(abortError(signal));
			return;
		}
		const timer = setTimeout(resolve, milliseconds);
		signal.addEventListener("abort", () => {
			clearTimeout(timer);
			reject(abortError(signal));
		}, { once: true });
	});
}
var InstallManager = class {
	runner;
	platform;
	architecture;
	catalog;
	random;
	operations = /* @__PURE__ */ new Map();
	locks = /* @__PURE__ */ new Set();
	constructor(runner, platform, architecture, catalog = INSTALL_CATALOG, random = Math.random) {
		this.runner = runner;
		this.platform = platform;
		this.architecture = architecture;
		this.catalog = catalog;
		this.random = random;
	}
	start(componentId, sourcePolicy) {
		if (this.locks.has(componentId)) throw new InstallerError(`component "${componentId}" already has an active installation`, false);
		const plan = planInstallation(componentId, this.platform, this.architecture, this.catalog);
		const id = randomUUID();
		const controller = new AbortController();
		const snapshot = {
			id,
			componentId,
			sourcePolicy,
			phase: "queued",
			progress: 0,
			attempt: 0,
			logs: []
		};
		this.locks.add(componentId);
		const done = this.execute(snapshot, plan, controller.signal).finally(() => this.locks.delete(componentId));
		this.operations.set(id, {
			snapshot,
			controller,
			done
		});
		return structuredClone(snapshot);
	}
	get(id) {
		const operation = this.operations.get(id);
		return operation === void 0 ? void 0 : structuredClone(operation.snapshot);
	}
	list() {
		return [...this.operations.values()].map((operation) => structuredClone(operation.snapshot));
	}
	cancel(id) {
		const operation = this.operations.get(id);
		if (operation === void 0 || [
			"succeeded",
			"failed",
			"cancelled"
		].includes(operation.snapshot.phase)) return false;
		operation.controller.abort(new InstallerError("installation cancelled", false));
		return true;
	}
	async wait(id) {
		const operation = this.operations.get(id);
		if (operation === void 0) return void 0;
		await operation.done;
		return this.get(id);
	}
	publish(snapshot, patch, log) {
		Object.assign(snapshot, patch);
		if (log !== void 0) snapshot.logs = boundedLogs(snapshot.logs, log);
	}
	async execute(snapshot, plan, signal) {
		const committed = [];
		try {
			for (const [index, { component, variant }] of plan.entries()) {
				this.publish(snapshot, {
					phase: "probing",
					progress: index / plan.length
				}, `Probing ${component.label}`);
				if (await this.runner.probe(component, signal)) continue;
				for (const step of variant.steps) await this.executeStep(snapshot, component, step, snapshot.sourcePolicy, signal);
				await this.runner.refreshEnvironment();
				if (variant.steps.some((step) => step.kind !== "external-action") && !await this.runner.probe(component, signal)) throw new InstallerError(`post-install probe failed for "${component.id}"`, false);
				committed.push(component);
			}
			const targetEntry = plan.at(-1);
			if (targetEntry === void 0) throw new InstallerError("installation plan is empty", false);
			const target = targetEntry.component;
			const requiresExternalAction = plan.some((entry) => entry.variant.steps.some((step) => step.kind === "external-action"));
			this.publish(snapshot, {
				phase: requiresExternalAction ? "external-action-required" : target.restartRequired ? "restart-required" : "succeeded",
				progress: 1
			}, requiresExternalAction ? `Additional action required for ${target.label}` : `Installed ${target.label}`);
		} catch (error) {
			await Promise.allSettled(committed.reverse().map((component) => this.runner.rollback(component)));
			if (signal.aborted) this.publish(snapshot, {
				phase: "cancelled",
				error: "installation cancelled"
			}, "Installation cancelled");
			else {
				const message = error instanceof Error ? error.message : String(error);
				this.publish(snapshot, {
					phase: "failed",
					error: message
				}, message);
			}
		}
	}
	async executeStep(snapshot, component, step, policy, signal) {
		this.publish(snapshot, { phase: step.phase });
		if (step.kind === "external-action") {
			this.publish(snapshot, {}, step.message);
			return;
		}
		if (step.kind === "command") {
			const output = await this.runner.command(step.executable, step.args, step.timeoutMs, signal);
			this.publish(snapshot, {}, output);
			return;
		}
		const staging = join(tmpdir(), "dsh-ant-sword-installer", snapshot.id);
		await mkdir(staging, { recursive: true });
		const target = join(staging, step.targetName);
		try {
			const sources = orderSources(step.sources, policy);
			let lastError;
			for (const source of sources) for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_SOURCE; attempt += 1) {
				this.publish(snapshot, { attempt }, `Downloading from ${source.id}, attempt ${String(attempt)}`);
				try {
					await this.runner.download(source.url, target, step.timeoutMs, signal);
					const expectedSha256 = step.sha256 ?? (step.officialDigest === void 0 ? void 0 : await this.runner.resolveOfficialDigest(step.officialDigest.apiUrl, step.officialDigest.assetName, signal));
					if (expectedSha256 === void 0) throw new InstallerError(`download step for "${component.id}" has no trusted digest`, false);
					this.publish(snapshot, { phase: "verifying" }, `Verifying ${step.targetName}`);
					await this.runner.verifySha256(target, expectedSha256);
					this.publish(snapshot, { phase: "installing" }, `Committing ${component.label}`);
					await this.runner.commitArtifact(component, target, signal);
					return;
				} catch (error) {
					lastError = error;
					if (!(error instanceof InstallerError) || !error.retryable) throw error;
					if (attempt < MAX_ATTEMPTS_PER_SOURCE) await abortableDelay(250 * 2 ** (attempt - 1) + Math.floor(this.random() * 100), signal);
				}
			}
			if (lastError instanceof Error) throw lastError;
			throw new InstallerError("all download sources failed", true);
		} finally {
			await rm(staging, {
				recursive: true,
				force: true
			});
		}
	}
};
function createSubprocessInstallRunner(subprocess) {
	const backups = /* @__PURE__ */ new Map();
	const toolsRoot = join(homedir(), ".dsh", "tools");
	const command = async (executable, args, timeoutMs, signal) => {
		const resolved = await subprocess.resolveExecutable(executable, void 0, signal);
		const deadline = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
		const handle = subprocess.spawn({
			argv: [resolved, ...args],
			cwd: process.cwd(),
			signal: deadline,
			graceMs: 2e3,
			stdio: {
				stdin: "ignore",
				stdout: { maxBytes: 32 * 1024 },
				stderr: { maxBytes: 32 * 1024 }
			}
		});
		const outcome = await handle.done;
		const stdout = handle.collected.stdout?.readFrom(0).text ?? "";
		const stderr = handle.collected.stderr?.readFrom(0).text ?? "";
		if (outcome.exitCode !== 0) throw new InstallerError(stderr || `${executable} exited with ${String(outcome.exitCode)}`, false);
		return stdout.trim();
	};
	return {
		probe: async (component, signal) => {
			if (component.probe.kind === "http") try {
				return (await fetch(component.probe.url, {
					signal: AbortSignal.any([signal, AbortSignal.timeout(2e3)]),
					redirect: "error"
				})).ok;
			} catch {
				return false;
			}
			try {
				await command(component.probe.command, component.probe.args, 5e3, signal);
				return true;
			} catch {
				return false;
			}
		},
		command,
		download: async (url, target, timeoutMs, signal) => {
			let response;
			try {
				response = await fetch(url, {
					signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
					redirect: "error"
				});
			} catch (error) {
				throw new InstallerError(error instanceof Error ? error.message : String(error), true);
			}
			if (!response.ok) throw new InstallerError(`download failed with HTTP ${String(response.status)}`, response.status >= 500 || response.status === 408 || response.status === 429);
			const { writeFile } = await import("node:fs/promises");
			await writeFile(target, Buffer.from(await response.arrayBuffer()));
		},
		verifySha256: async (path, expected) => {
			if (createHash("sha256").update(await readFile(path)).digest("hex").toLowerCase() !== expected.toLowerCase()) throw new InstallerError(`SHA-256 mismatch for ${path}`, false);
		},
		resolveOfficialDigest: async (apiUrl, assetName, signal) => {
			const response = await fetch(apiUrl, {
				signal: AbortSignal.any([signal, AbortSignal.timeout(15e3)]),
				redirect: "error",
				headers: {
					accept: "application/vnd.github+json",
					"user-agent": "dsh-ant-sword-installer"
				}
			});
			if (!response.ok) throw new InstallerError(`official digest request failed with HTTP ${String(response.status)}`, response.status >= 500 || response.status === 429);
			const digest = (await response.json()).assets?.find((asset) => asset.name === assetName)?.digest;
			if (typeof digest !== "string" || !/^sha256:[a-f0-9]{64}$/i.test(digest)) throw new InstallerError(`official release has no SHA-256 digest for ${assetName}`, false);
			return digest.slice(7);
		},
		commitArtifact: async (component, path, signal) => {
			if (component.installDirectory === void 0) throw new InstallerError(`component "${component.id}" has no managed install directory`, false);
			await mkdir(toolsRoot, { recursive: true });
			const extracted = join(toolsRoot, `.${component.id}-${randomUUID()}`);
			const target = join(toolsRoot, component.installDirectory);
			const backup = join(toolsRoot, `.${component.id}-backup-${randomUUID()}`);
			await mkdir(extracted, { recursive: true });
			if (process.platform === "win32") await command("powershell.exe", [
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				"Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
				path,
				extracted
			], 10 * 6e4, signal);
			else await command("unzip", [
				"-q",
				path,
				"-d",
				extracted
			], 10 * 6e4, signal);
			const entries = await readdir(extracted, { withFileTypes: true });
			const firstEntry = entries[0];
			const source = entries.length === 1 && firstEntry?.isDirectory() === true ? join(extracted, firstEntry.name) : extracted;
			try {
				await rename(target, backup);
				backups.set(component.id, backup);
			} catch (error) {
				if ((error instanceof Error && "code" in error ? error.code : void 0) !== "ENOENT") throw error;
			}
			try {
				await rename(source, target);
			} catch (error) {
				const previous = backups.get(component.id);
				if (previous !== void 0) await rename(previous, target);
				throw error;
			} finally {
				if (source !== extracted) await rm(extracted, {
					recursive: true,
					force: true
				});
			}
		},
		rollback: async (component) => {
			if (component.installDirectory === void 0) return;
			const target = join(toolsRoot, component.installDirectory);
			await rm(target, {
				recursive: true,
				force: true
			});
			const backup = backups.get(component.id);
			if (backup !== void 0) {
				await rename(backup, target);
				backups.delete(component.id);
			}
		},
		refreshEnvironment: () => Promise.resolve()
	};
}
//#endregion
//#region lib/types/installer/api.js
/** Loopback Host routes for controlled installation operations. */
const MAX_BODY_BYTES$1 = 16 * 1024;
const SOURCE_POLICIES = new Set([
	"auto",
	"domestic-first",
	"official-first"
]);
function sendJson$1(res, status, value) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	res.end(JSON.stringify(value));
}
async function readJsonObject(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const bytes = Buffer.from(chunk);
		size += bytes.byteLength;
		if (size > MAX_BODY_BYTES$1) throw new InstallerError(`request body exceeds ${String(MAX_BODY_BYTES$1)} bytes`, false);
		chunks.push(bytes);
	}
	const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new InstallerError("request body must be a JSON object", false);
	return value;
}
function requirePost(req, res) {
	if (req.method === "POST") return true;
	sendJson$1(res, 405, { error: "method-not-allowed" });
	return false;
}
function architecture() {
	if (process.arch === "x64" || process.arch === "arm64") return process.arch;
	throw new InstallerError(`unsupported architecture ${process.arch}`, false);
}
function applyInstallApi(ctx) {
	const platform = process.platform === "win32" ? "win32" : process.platform === "linux" ? "linux" : void 0;
	if (platform === void 0) throw new InstallerError(`unsupported platform ${process.platform}`, false);
	const manager = new InstallManager(createSubprocessInstallRunner(ctx.subprocess), platform, architecture());
	ctx.webServer.register({
		kind: "exact",
		path: "/ant-sword/install/catalog",
		handler: (_req, res) => {
			sendJson$1(res, 200, {
				components: INSTALL_CATALOG.map((component) => ({
					id: component.id,
					label: component.label,
					version: component.version,
					dependencies: component.dependencies,
					restartRequired: component.restartRequired ?? false,
					supported: component.variants.some((variant) => variant.platform === platform && variant.architectures.includes(architecture()))
				})),
				operations: manager.list()
			});
		}
	});
	ctx.webServer.register({
		kind: "exact",
		path: "/ant-sword/install/start",
		handler: async (req, res) => {
			if (!requirePost(req, res)) return;
			try {
				const body = await readJsonObject(req);
				if (Object.keys(body).some((key) => key !== "componentId" && key !== "sourcePolicy")) throw new InstallerError("request contains unsupported fields", false);
				if (typeof body.componentId !== "string" || body.componentId.length > 64) throw new InstallerError("componentId must be a string of at most 64 characters", false);
				if (typeof body.sourcePolicy !== "string" || !SOURCE_POLICIES.has(body.sourcePolicy)) throw new InstallerError("invalid sourcePolicy", false);
				sendJson$1(res, 202, manager.start(body.componentId, body.sourcePolicy));
			} catch (error) {
				sendJson$1(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
	ctx.webServer.register({
		kind: "exact",
		path: "/ant-sword/install/cancel",
		handler: async (req, res) => {
			if (!requirePost(req, res)) return;
			try {
				const body = await readJsonObject(req);
				if (Object.keys(body).some((key) => key !== "operationId")) throw new InstallerError("request contains unsupported fields", false);
				if (typeof body.operationId !== "string" || body.operationId.length > 64) throw new InstallerError("operationId must be a string of at most 64 characters", false);
				const cancelled = manager.cancel(body.operationId);
				sendJson$1(res, cancelled ? 200 : 404, { cancelled });
			} catch (error) {
				sendJson$1(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
	ctx.webServer.register({
		kind: "exact",
		path: "/ant-sword/install/status",
		handler: (req, res) => {
			if (req.method !== "GET") {
				sendJson$1(res, 405, { error: "method-not-allowed" });
				return;
			}
			sendJson$1(res, 200, { operations: manager.list() });
		}
	});
	return manager;
}
//#endregion
//#region lib/types/mcp-servers.js
/**
* Embedded offensive-security MCP servers: the catalog of eight Kali/reverse
* MCP servers the autonomous preset bridges in, declared as plugin Config so
* each server's transport/command/env/credentials is editable in the dsh
* plugin-config UI (never via environment-variable overrides). `applyMcpServers`
* mounts one `@deepseek-ai/dsh-mcp-client` instance per enabled and resolvable
* server. Missing stdio commands remain visible in configuration and runtime
* status but are not mounted, so no reconnect loop repeatedly invokes them.
*
* @module @deepseek-ai/dsh-ant-sword-harness/mcp-servers
*/
/** Schemastery validation for {@link McpServerConfig}. */
const McpServerSchema = z.object({
	enabled: z.boolean().default(true).description("启用此 MCP 服务器；关闭则不挂载，其 mcp__* 工具不出现。"),
	serverName: z.string().required().description("工具命名空间，模型看到的是 mcp__<serverName>__<tool>。"),
	transport: z.union([
		"stdio",
		"sse",
		"streamable-http"
	]).required().description("stdio=拉起子进程；sse=旧版 HTTP+SSE；streamable-http=当前 HTTP MCP。"),
	command: z.string().description("stdio：要启动的可执行文件。"),
	args: z.array(z.string()).description("stdio：命令参数。"),
	cwd: z.string().description("stdio：工作目录；留空使用 Harness 工作目录。"),
	toolCallTimeoutMs: z.number().min(1).max(2147483647).default(6e4).description("单次工具调用超时（毫秒）。"),
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
	},
	{
		enabled: true,
		serverName: "everything",
		transport: "stdio",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-everything"]
	},
	{
		enabled: false,
		serverName: "memory",
		transport: "stdio",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-memory"]
	},
	{
		enabled: false,
		serverName: "filesystem",
		transport: "stdio",
		command: "npx",
		args: [
			"-y",
			"@modelcontextprotocol/server-filesystem",
			"."
		]
	},
	{
		enabled: false,
		serverName: "github",
		transport: "stdio",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-github"]
	},
	{
		enabled: false,
		serverName: "playwright",
		transport: "stdio",
		command: "npx",
		args: ["-y", "@playwright/mcp@latest"]
	},
	{
		enabled: false,
		serverName: "remote-http",
		transport: "streamable-http",
		url: "http://127.0.0.1:3000/mcp"
	}
];
/** Return whether a stdio command can be resolved without invoking a shell. */
function commandExists(command) {
	if (command === "") return false;
	return spawnSync(process.platform === "win32" ? "where.exe" : "which", [command], {
		stdio: "ignore",
		windowsHide: true
	}).status === 0;
}
//#endregion
//#region lib/types/mcp-reconciler.js
/** Dynamic MCP fiber reconciliation for committed runtime settings. */
function sameConfig(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}
function clientConfig(server, pentestswarmApiKey) {
	if (server.transport === "stdio") {
		const env = { ...server.env };
		if (server.serverName === "pentestswarm" && pentestswarmApiKey !== void 0 && pentestswarmApiKey !== "") env.PENTESTSWARM_ORCHESTRATOR_API_KEY = pentestswarmApiKey;
		return {
			transport: "stdio",
			serverName: server.serverName,
			command: server.command ?? "",
			args: server.args ?? [],
			env,
			cwd: server.cwd ?? "",
			toolCallTimeoutMs: server.toolCallTimeoutMs ?? 6e4,
			failOnStartupError: true,
			reconnect: {
				enabled: true,
				initialDelayMs: 1e3,
				maxDelayMs: 3e4,
				maxAttempts: 5
			}
		};
	}
	return {
		transport: server.transport,
		serverName: server.serverName,
		url: server.url ?? "",
		headers: server.headers ?? {},
		toolCallTimeoutMs: server.toolCallTimeoutMs ?? 6e4,
		failOnStartupError: true,
		reconnect: {
			enabled: true,
			initialDelayMs: 1e3,
			maxDelayMs: 3e4,
			maxAttempts: 5
		}
	};
}
var McpReconciler = class {
	ctx;
	pentestswarmApiKey;
	canResolveCommand;
	name = "mcp";
	fibers = /* @__PURE__ */ new Map();
	configs = /* @__PURE__ */ new Map();
	constructor(ctx, pentestswarmApiKey, canResolveCommand = commandExists) {
		this.ctx = ctx;
		this.pentestswarmApiKey = pentestswarmApiKey;
		this.canResolveCommand = canResolveCommand;
	}
	/** Whether one server currently owns an active plugin fiber. */
	isMounted(serverName) {
		return this.fibers.has(serverName);
	}
	/** Probe one server without replacing its live tool registrations. */
	async probe(serverName) {
		const config = this.configs.get(serverName);
		if (config === void 0) throw new TypeError(`unknown MCP server "${serverName}"`);
		if (config.enabled === false) throw new TypeError(`MCP server "${serverName}" is disabled`);
		if (config.transport === "stdio" && !this.canResolveCommand(config.command ?? "")) throw new TypeError(`MCP server "${serverName}" command is not available`);
		return mcpClient.probeMcpServer(clientConfig(config, this.pentestswarmApiKey));
	}
	/** Force one configured server through a dispose/connect cycle. */
	async reload(serverName) {
		const config = this.configs.get(serverName);
		if (config === void 0) throw new TypeError(`unknown MCP server "${serverName}"`);
		const current = this.fibers.get(serverName);
		if (current !== void 0) {
			await current.dispose();
			this.fibers.delete(serverName);
		}
		if (config.enabled === false) throw new TypeError(`MCP server "${serverName}" is disabled`);
		if (config.transport === "stdio" && !this.canResolveCommand(config.command ?? "")) throw new TypeError(`MCP server "${serverName}" command is not available`);
		const fiber = this.ctx.plugin(mcpClient, clientConfig(config, this.pentestswarmApiKey));
		try {
			await fiber.await();
			this.fibers.set(serverName, fiber);
		} catch (error) {
			await fiber.dispose();
			throw error;
		}
	}
	prepare(next, _previousConfig) {
		const desired = new Map(next.mcpServers.map((server) => [server.serverName, server]));
		const previous = new Map(this.configs);
		return {
			commit: async () => {
				const changed = new Set([...previous.keys(), ...desired.keys()].filter((name) => {
					const before = previous.get(name);
					const after = desired.get(name);
					return before === void 0 || after === void 0 || !sameConfig(before, after);
				}));
				const disposed = [];
				const mounted = [];
				try {
					for (const name of changed) {
						const fiber = this.fibers.get(name);
						const config = previous.get(name);
						if (fiber !== void 0) {
							await fiber.dispose();
							this.fibers.delete(name);
							if (config !== void 0) disposed.push([name, config]);
						}
					}
					for (const name of changed) {
						const config = desired.get(name);
						if (config === void 0 || config.enabled === false) continue;
						if (config.transport === "stdio" && !this.canResolveCommand(config.command ?? "")) continue;
						const fiber = this.ctx.plugin(mcpClient, clientConfig(config, this.pentestswarmApiKey));
						await fiber.await();
						this.fibers.set(name, fiber);
						mounted.push(name);
					}
					this.configs = desired;
				} catch (error) {
					await Promise.allSettled(mounted.map(async (name) => {
						await this.fibers.get(name)?.dispose();
						this.fibers.delete(name);
					}));
					for (const [name, config] of disposed) {
						const fiber = this.ctx.plugin(mcpClient, clientConfig(config, this.pentestswarmApiKey));
						await fiber.await();
						this.fibers.set(name, fiber);
					}
					this.configs = previous;
					throw error;
				}
			},
			rollback: async () => {
				const current = [...this.fibers.values()];
				await Promise.allSettled(current.map((fiber) => fiber.dispose()));
				this.fibers.clear();
				for (const [name, config] of previous) {
					if (config.enabled === false || config.transport === "stdio" && !this.canResolveCommand(config.command ?? "")) continue;
					const fiber = this.ctx.plugin(mcpClient, clientConfig(config, this.pentestswarmApiKey));
					await fiber.await();
					this.fibers.set(name, fiber);
				}
				this.configs = previous;
			}
		};
	}
};
//#endregion
//#region lib/types/rules-reconciler.js
/** Ordered system-prompt sections backed by runtime rules. */
const PLACEMENT_ORDER = {
	"before-persona": -50,
	"after-persona": 50,
	"before-tools": 90,
	"after-tools": 200
};
function sectionName(rule) {
	return `ant-sword:rule:${rule.id}`;
}
function sectionOrder(rule) {
	return PLACEMENT_ORDER[rule.placement] + Math.max(-9, Math.min(9, rule.order / 1e6));
}
function escapeRuleContent(content) {
	return content.replace(/<\/(system|assistant|user|tool)(?=[\s>])/gi, "<\\/$1");
}
var RulesReconciler = class {
	ctx;
	name = "rules";
	disposers = [];
	rules = [];
	constructor(ctx) {
		this.ctx = ctx;
	}
	prepare(next, _previousConfig) {
		const desired = next.rules.filter((rule) => rule.enabled).toSorted((left, right) => left.placement.localeCompare(right.placement) || left.order - right.order || left.id.localeCompare(right.id));
		const previous = this.rules;
		return {
			commit: () => {
				this.disposers.forEach((dispose) => {
					dispose();
				});
				const nextDisposers = [];
				try {
					for (const rule of desired) nextDisposers.push(this.ctx.systemPrompt.section({
						name: sectionName(rule),
						order: sectionOrder(rule),
						text: escapeRuleContent(rule.content)
					}));
					this.disposers = nextDisposers;
					this.rules = desired;
				} catch (error) {
					nextDisposers.forEach((dispose) => {
						dispose();
					});
					this.disposers = previous.map((rule) => this.ctx.systemPrompt.section({
						name: sectionName(rule),
						order: sectionOrder(rule),
						text: escapeRuleContent(rule.content)
					}));
					this.rules = previous;
					throw error;
				}
			},
			rollback: () => {
				this.disposers.forEach((dispose) => {
					dispose();
				});
				this.disposers = previous.map((rule) => this.ctx.systemPrompt.section({
					name: sectionName(rule),
					order: sectionOrder(rule),
					text: escapeRuleContent(rule.content)
				}));
				this.rules = previous;
			}
		};
	}
};
//#endregion
//#region lib/types/runtime-config.js
/**
* Persisted runtime configuration and transactional hot-apply coordination.
* The controller deliberately knows nothing about MCP fibers, skill storage,
* or prompt sections; those concerns implement reconcilers behind one shared
* commit boundary.
*
* @module @deepseek-ai/dsh-ant-sword-harness/runtime-config
*/
const ANT_SWORD_SETTINGS_NAMESPACE = "ant-sword-runtime";
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const RULE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_RULE_CONTENT_BYTES = 32 * 1024;
const RuntimeRuleSchema = z.object({
	id: z.string().required(),
	title: z.string().required(),
	enabled: z.boolean().default(true),
	order: z.number().default(0),
	placement: z.union([
		"before-persona",
		"after-persona",
		"before-tools",
		"after-tools"
	]).required(),
	content: z.string().required()
});
const AntSwordRuntimeConfigSchema = z.object({
	mcpServers: z.array(McpServerSchema).default(DEFAULT_MCP_SERVERS.map((server) => ({ ...server }))),
	disabledSkills: z.array(z.string()).default([]),
	rules: z.array(RuntimeRuleSchema).default([])
});
AntSwordRuntimeConfigSchema({
	mcpServers: DEFAULT_MCP_SERVERS.map((server) => ({ ...server })),
	disabledSkills: [],
	rules: []
});
function byteLength(value) {
	return new TextEncoder().encode(value).byteLength;
}
function assertUnique(values, label) {
	const seen = /* @__PURE__ */ new Set();
	for (const value of values) {
		if (seen.has(value)) throw new TypeError(`${label} contains duplicate "${value}"`);
		seen.add(value);
	}
}
function validateMcpServer(server) {
	if (!SERVER_NAME_PATTERN.test(server.serverName)) throw new TypeError(`MCP serverName "${server.serverName}" must match ${String(SERVER_NAME_PATTERN)}`);
	if (server.transport === "stdio") {
		if (server.command === void 0 || server.command.trim() === "") throw new TypeError(`stdio MCP server "${server.serverName}" requires command`);
		if (server.url !== void 0) throw new TypeError(`stdio MCP server "${server.serverName}" cannot define url`);
		return;
	}
	if (server.command !== void 0 && server.command !== "" || server.args !== void 0 && server.args.length > 0 || server.cwd !== void 0 && server.cwd !== "" || server.env !== void 0 && Object.keys(server.env).length > 0) throw new TypeError(`streamable-http MCP server "${server.serverName}" cannot define stdio fields`);
	let url;
	try {
		url = new URL(server.url ?? "");
	} catch {
		throw new TypeError(`streamable-http MCP server "${server.serverName}" requires a valid URL`);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") throw new TypeError(`streamable-http MCP server "${server.serverName}" URL must use http or https`);
}
function validateRule(rule) {
	if (!RULE_ID_PATTERN.test(rule.id)) throw new TypeError(`rule id "${rule.id}" must match ${String(RULE_ID_PATTERN)}`);
	if (!Number.isSafeInteger(rule.order)) throw new TypeError(`rule "${rule.id}" order must be a safe integer`);
	if (rule.title.trim() === "") throw new TypeError(`rule "${rule.id}" title cannot be empty`);
	if (byteLength(rule.title) > 256) throw new TypeError(`rule "${rule.id}" title exceeds ${String(256)} UTF-8 bytes`);
	if (rule.content.includes("\0")) throw new TypeError(`rule "${rule.id}" content cannot contain NUL`);
	if (byteLength(rule.content) > 32768) throw new TypeError(`rule "${rule.id}" content exceeds ${String(MAX_RULE_CONTENT_BYTES)} UTF-8 bytes`);
}
function validateRuntimeConfig(config) {
	assertUnique(config.mcpServers.map((server) => server.serverName), "mcpServers");
	for (const server of config.mcpServers) validateMcpServer(server);
	assertUnique(config.disabledSkills, "disabledSkills");
	for (const name of config.disabledSkills) if (!SKILL_NAME_PATTERN.test(name)) throw new TypeError(`disabled skill "${name}" must match ${String(SKILL_NAME_PATTERN)}`);
	assertUnique(config.rules.map((rule) => rule.id), "rules");
	for (const rule of config.rules) validateRule(rule);
}
function cloneConfig(config) {
	return structuredClone(config);
}
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
/** Serializes settings commits and publishes only fully reconciled generations. */
var RuntimeController = class {
	scope;
	reconcilers;
	current;
	generation = 0;
	applying = false;
	lastFailure;
	tail = Promise.resolve();
	stopped = false;
	listeners = /* @__PURE__ */ new Set();
	constructor(scope, reconcilers) {
		this.scope = scope;
		this.reconcilers = reconcilers;
		this.current = cloneConfig(scope.get());
		validateRuntimeConfig(this.current);
	}
	start() {
		const unwatch = this.scope.watch((next) => this.enqueue(next));
		this.enqueue(this.current);
		return async () => {
			this.stopped = true;
			unwatch();
			await this.tail;
			this.listeners.clear();
		};
	}
	subscribe(listener) {
		this.listeners.add(listener);
		listener(this.snapshot());
		return () => this.listeners.delete(listener);
	}
	snapshot() {
		return {
			generation: this.generation,
			applying: this.applying,
			config: cloneConfig(this.current),
			...this.lastFailure === void 0 ? {} : { lastFailure: { ...this.lastFailure } }
		};
	}
	whenIdle() {
		return this.tail;
	}
	enqueue(next) {
		const candidate = cloneConfig(next);
		const run = this.tail.then(() => this.apply(candidate));
		this.tail = run.catch(() => void 0);
		return run;
	}
	async apply(next) {
		if (this.stopped) return;
		this.applying = true;
		this.emit();
		const prepared = [];
		try {
			validateRuntimeConfig(next);
			for (const reconciler of this.reconcilers) prepared.push({
				reconciler,
				change: await reconciler.prepare(next, this.current)
			});
			const committed = [];
			try {
				for (const entry of prepared) {
					await entry.change.commit();
					committed.push(entry);
				}
			} catch (error) {
				await Promise.allSettled(committed.reverse().map(async (entry) => {
					await entry.change.rollback();
				}));
				throw error;
			}
			this.current = cloneConfig(next);
			this.generation += 1;
			this.lastFailure = void 0;
		} catch (error) {
			const failedAt = prepared.at(-1)?.reconciler.name ?? "validation";
			this.lastFailure = {
				reconciler: failedAt,
				message: errorMessage(error)
			};
		} finally {
			this.applying = false;
			this.emit();
		}
	}
	emit() {
		const snapshot = this.snapshot();
		for (const listener of this.listeners) listener(snapshot);
	}
};
//#endregion
//#region lib/types/skill-runtime.js
/** Skill disable overlay and safe user-skill persistence. */
const MAX_BODY_BYTES = 128 * 1024;
const MAX_SKILL_BODY_BYTES = 96 * 1024;
function within(root, path) {
	const rel = relative(resolve(root), resolve(path));
	return rel === "" || !rel.startsWith("..") && !rel.includes(":");
}
function sendJson(res, status, value) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	res.end(JSON.stringify(value));
}
async function readBody(req) {
	const chunks = [];
	let bytes = 0;
	for await (const chunk of req) {
		const part = Buffer.from(chunk);
		bytes += part.byteLength;
		if (bytes > MAX_BODY_BYTES) throw new TypeError("skill request body is too large");
		chunks.push(part);
	}
	const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new TypeError("skill request must be an object");
	return parsed;
}
function scalar(value) {
	return JSON.stringify(value);
}
var SkillsReconciler = class {
	name = "skills";
	disabled = /* @__PURE__ */ new Set();
	invalidate = () => void 0;
	provider(control) {
		this.invalidate = control.invalidate;
		return {
			name: skillProvider.name,
			list: async (options) => {
				const listed = await skillProvider.list(options);
				if ("candidates" in listed) return {
					...listed,
					candidates: listed.candidates.filter((candidate) => !this.disabled.has(candidate.name))
				};
				return listed.filter((candidate) => !this.disabled.has(candidate.name));
			},
			get: async (candidate, options) => {
				if (this.disabled.has(candidate.name)) return void 0;
				return skillProvider.get(candidate, options);
			}
		};
	}
	prepare(next, _previousConfig) {
		const previous = this.disabled;
		const desired = new Set(next.disabledSkills);
		return {
			commit: () => {
				this.disabled = desired;
				this.invalidate();
			},
			rollback: () => {
				this.disabled = previous;
				this.invalidate();
			}
		};
	}
	refresh() {
		this.invalidate();
	}
};
function applySkillApi(ctx, reconciler, root = join(homedir(), ".dsh", "skills")) {
	ctx.webServer.register({
		kind: "exact",
		path: "/ant-sword/skills/upsert",
		handler: async (req, res) => {
			if (req.method !== "POST") {
				sendJson(res, 405, { error: "method-not-allowed" });
				return;
			}
			try {
				const body = await readBody(req);
				if (Object.keys(body).some((key) => ![
					"name",
					"description",
					"whenToUse",
					"modelInvocable",
					"userInvocable",
					"content"
				].includes(key))) throw new TypeError("unsupported skill field");
				if (typeof body.name !== "string" || !isSkillName(body.name)) throw new TypeError("invalid skill name");
				if (typeof body.description !== "string" || body.description.length > 1024) throw new TypeError("invalid skill description");
				if (body.whenToUse !== void 0 && (typeof body.whenToUse !== "string" || body.whenToUse.length > 2048)) throw new TypeError("invalid skill whenToUse");
				if (typeof body.content !== "string" || Buffer.byteLength(body.content, "utf8") > MAX_SKILL_BODY_BYTES || body.content.includes("\0")) throw new TypeError("invalid skill content");
				if (typeof body.modelInvocable !== "boolean" || typeof body.userInvocable !== "boolean") throw new TypeError("invalid invocation policy");
				const directory = join(root, body.name);
				const target = join(directory, "SKILL.md");
				if (!within(root, target)) throw new TypeError("skill path escapes user root");
				await mkdir(directory, { recursive: true });
				const temporary = join(directory, `.SKILL.${String(process.pid)}.tmp`);
				await writeFile(temporary, [
					"---",
					`name: ${scalar(body.name)}`,
					`description: ${scalar(body.description)}`,
					...typeof body.whenToUse === "string" && body.whenToUse !== "" ? [`whenToUse: ${scalar(body.whenToUse)}`] : [],
					`user-invocable: ${body.userInvocable ? "true" : "false"}`,
					`disable-model-invocation: ${body.modelInvocable ? "false" : "true"}`,
					"---",
					"",
					body.content,
					""
				].join("\n"), {
					encoding: "utf8",
					mode: 384
				});
				await rename(temporary, target);
				reconciler.refresh();
				sendJson(res, 200, { name: body.name });
			} catch (error) {
				sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
	ctx.webServer.register({
		kind: "exact",
		path: "/ant-sword/skills/delete",
		handler: async (req, res) => {
			if (req.method !== "POST") {
				sendJson(res, 405, { error: "method-not-allowed" });
				return;
			}
			try {
				const body = await readBody(req);
				if (Object.keys(body).some((key) => key !== "name") || typeof body.name !== "string" || !isSkillName(body.name)) throw new TypeError("invalid skill name");
				const directory = join(root, body.name);
				if (!within(root, directory) || dirname(directory) !== resolve(root)) throw new TypeError("skill path escapes user root");
				await rm(directory, {
					recursive: true,
					force: true
				});
				reconciler.refresh();
				sendJson(res, 200, { name: body.name });
			} catch (error) {
				sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
}
//#endregion
//#region lib/types/dynamic-runtime.js
/** Settings registration and runtime reconciliation wiring. */
function applyDynamicRuntime(ctx, mcpServers, pentestswarmApiKey, skillsReconciler = new SkillsReconciler()) {
	const base = {
		mcpServers: mcpServers.map((server) => ({ ...server })),
		disabledSkills: [],
		rules: []
	};
	const scope = ctx.settings.register(settingsNamespace(ANT_SWORD_SETTINGS_NAMESPACE), AntSwordRuntimeConfigSchema, {
		base,
		applies: "live",
		validate: validateRuntimeConfig
	});
	const mcp = new McpReconciler(ctx, pentestswarmApiKey);
	const controller = new RuntimeController(scope, [
		mcp,
		skillsReconciler,
		new RulesReconciler(ctx)
	]);
	const stop = controller.start();
	ctx.effect(() => stop, "ant-sword-runtime.controller");
	return {
		controller,
		mcp
	};
}
//#endregion
//#region lib/types/index.js
/**
* @deepseek-ai/dsh-ant-sword-harness — a security-research profile bundle. Its
* composition is the `cordis.patch.yml` declared by `dsh.bundle.patch`: the
* main Cordis row mounts the bundled reverse/CTF skill pack, a dedicated row
* mounts the self-contained rewind capability, and the patch additionally
* mounts the UI, agent-teams, and plugin-market bundles.
*
* @module @deepseek-ai/dsh-ant-sword-harness
*/
/** Cordis plugin name. */
const name = "ant-sword-harness";
/** Services required by the bundled skill provider, the auto loop, and MCP tools. */
const inject = [
	"skills",
	"sessions",
	"storageDomain",
	"commands",
	"tools",
	"agents",
	"webServer",
	"subprocess",
	"settings",
	"systemPrompt"
];
/** Schemastery validation for {@link Config}. */
const Config = z.object({
	autoLoop: AutoLoopConfigSchema,
	mcpServers: z.array(McpServerSchema).description("内嵌渗透 MCP 服务器列表；每台可用 enabled 单独启停，传输/命令/地址均可改。"),
	pentestswarmApiKey: z.string().role("secret").description("Pentest Swarm 编排器 API key，仅注入该服务器的 env。"),
	syncRedTeamPreset: z.boolean()
});
/**
* Mount the bundled skill pack, the auto loop, and the red-team preset.
* Workspace snapshots and `/rewind` mount through their own row
* (`./rewind-plugin.ts`); this row mounts no rewind listeners.
* @param ctx - plugin context carrying skills, sessions, storageDomain, commands.
* @param config - validated plugin config.
*/
function apply(ctx, config) {
	const skillsReconciler = new SkillsReconciler();
	ctx.skills.registerProvider((control) => skillsReconciler.provider(control));
	applyAutoLoop(ctx, config.autoLoop ?? {});
	const runtime = applyDynamicRuntime(ctx, config.mcpServers === void 0 || config.mcpServers.length === 0 ? DEFAULT_MCP_SERVERS : config.mcpServers, config.pentestswarmApiKey, skillsReconciler);
	applyRuntimeStatus(ctx, () => runtime.controller.snapshot().config.mcpServers, (serverName) => runtime.mcp.reload(serverName), (serverName) => runtime.mcp.probe(serverName), (serverName) => runtime.mcp.isMounted(serverName));
	applyInstallApi(ctx);
	applySkillApi(ctx, skillsReconciler);
	if (config.syncRedTeamPreset ?? true) {
		syncRedTeamPreset().catch(() => void 0);
		syncRedTeamAutoPreset().catch(() => void 0);
	}
}
//#endregion
export { Config, apply, inject, name };
