// src/index.ts
import z5 from "@deepseek-ai/schemastery";

// src/preset-sync.ts
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
var PRESET_SOURCE = fileURLToPath(new URL("../preset/red-team", import.meta.url));
var AUTO_PRESET_SOURCE = fileURLToPath(new URL("../preset/red-team-auto", import.meta.url));
var RED_TEAM_PRESET_ID = "red-team";
var RED_TEAM_AUTO_PRESET_ID = "red-team-auto";
var USER_PRESET_DIR = ".agent-presets";
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
    else if (entry.isFile()) out.push({ rel, content: await readFile(path) });
  }
  return out;
}
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
async function syncRedTeamPreset() {
  return syncPreset(PRESET_SOURCE, RED_TEAM_PRESET_ID);
}
async function syncRedTeamAutoPreset() {
  return syncPreset(AUTO_PRESET_SOURCE, RED_TEAM_AUTO_PRESET_ID);
}

// src/auto/blackboard.ts
import { randomBytes } from "node:crypto";
import { Service } from "@deepseek-ai/cordis";

// src/auto/domain.ts
import z from "zod";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
var nodeSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  kind: z.enum(["fact", "intent", "hint", "goal"]),
  label: z.string(),
  detail: z.string().optional(),
  parentId: z.string().optional(),
  status: z.enum(["open", "claimed", "done", "abandoned"]).optional(),
  time: z.number(),
  cycle: z.number()
});
var blackboardDomain = defineDomain({
  name: "ant_sword_blackboard",
  version: 1,
  tables: {
    nodes: domainTable(nodeSchema)
  }
});

// src/auto/blackboard.ts
var BOARD_CHANGE = "board/change";
function newNodeId() {
  return randomBytes(8).toString("hex");
}
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
    void this.domainReady.catch(() => void 0);
    ctx.effect(async () => {
      const domain = await this.domainReady.catch(() => void 0);
      return () => {
        void domain?.close();
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
    for (const [, node] of domain.table("nodes").entries()) {
      if (node.sessionId === session.id) out.push(node);
    }
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
    const domain = await this.domainReady;
    await domain.table("nodes").put(node.id, node);
    session.append(BOARD_CHANGE, { op: "add", node });
    const snapshot = await this.snapshot(session);
    this.ctx.emit("board/changed", session, snapshot);
    return node;
  }
  /** Transition an Intent's lifecycle (claim → done/abandoned). */
  async setStatus(session, nodeId, status) {
    const domain = await this.domainReady;
    await domain.table("nodes").update(nodeId, (current) => ({ ...current, status }));
    session.append(BOARD_CHANGE, { op: "status", nodeId, status });
    const snapshot = await this.snapshot(session);
    this.ctx.emit("board/changed", session, snapshot);
  }
  /** Advance the OODA cycle index for a session and return the new value. */
  nextCycle(session) {
    const next = this.cycleOf(session.id) + 1;
    this.cycles.set(session.id, next);
    session.append("board/change", { op: "cycle", cycle: next });
    return next;
  }
  /** Operator pause flag; the loop reads it between cycles. */
  setPaused(session, paused) {
    this.paused.set(session.id, paused);
    session.append("board/change", { op: "paused", paused });
  }
  isPaused(session) {
    return this.paused.get(session.id) ?? false;
  }
  /** Mark the goal reached; the loop stops scheduling new cycles. */
  markComplete(session) {
    this.complete.set(session.id, true);
    session.append("board/change", { op: "complete", complete: true });
  }
  isComplete(session) {
    return this.complete.get(session.id) ?? false;
  }
};
function applyBoardProjection(state, event) {
  if (event.type !== "board/change") return state;
  const data = event.data;
  const current = state ?? { nodes: [], cycle: 0, paused: false, complete: false };
  if (data.op === "add") {
    return { ...current, nodes: [...current.nodes, data.node] };
  }
  if (data.op === "status") {
    return { ...current, nodes: current.nodes.map((n) => n.id === data.nodeId ? { ...n, status: data.status } : n) };
  }
  if (data.op === "cycle") return { ...current, cycle: data.cycle };
  if (data.op === "paused") return { ...current, paused: data.paused };
  return { ...current, complete: data.complete };
}

// src/auto/loop.ts
import { Service as Service2 } from "@deepseek-ai/cordis";
import z2 from "@deepseek-ai/schemastery";
import { z as zod } from "zod";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { defineTool } from "@deepseek-ai/dsh-tools";
var AutoLoopConfigSchema = z2.object({
  enabled: z2.boolean(),
  maxCycles: z2.number(),
  stallThreshold: z2.number(),
  maxDurationMs: z2.number()
});
function resolveConfig(config) {
  return {
    enabled: config.enabled ?? true,
    maxCycles: config.maxCycles ?? 64,
    stallThreshold: config.stallThreshold ?? 3,
    maxDurationMs: config.maxDurationMs ?? 30 * 60 * 1e3
  };
}
var AutoLoopService = class extends Service2 {
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
      content: [{ type: "text", text: "[auto-loop] Operator resumed. Continue the autonomous loop: read the blackboard, then act on the highest-priority open Intent." }],
      source: { kind: "plugin", plugin: "auto-loop" }
    }));
  }
  /** Inject an operator Hint mid-run: recorded on the board and steered in. */
  async injectHint(agent, text) {
    await this.ctx.blackboard.add(agent.session, { kind: "hint", label: text });
    agent.steer(createUserMessage({
      content: [{ type: "text", text: `[auto-loop] Operator hint: ${text}
Absorb this into your next Observe/Orient pass and re-plan Intents accordingly.` }],
      source: { kind: "plugin", plugin: "auto-loop" }
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
        return { kind: "success", text: 'auto-loop: paused. The run halts after the current step. Resume with "/auto resume".' };
      }
      if (arg === "resume") {
        loop.resume(agent);
        return { kind: "success", text: "auto-loop: resumed." };
      }
      if (arg.startsWith("hint ")) {
        const text = arg.slice("hint ".length).trim();
        if (text.length === 0) return { kind: "error", text: 'auto-loop: "/auto hint <text>" needs hint text.' };
        await loop.injectHint(agent, text);
        return { kind: "success", text: `auto-loop: hint injected \u2014 ${text}` };
      }
      if (arg === "status") {
        const snap = await board.snapshot(agent.session);
        return {
          kind: "success",
          text: `auto-loop: cycle ${snap.cycle}, ${snap.nodes.length} node(s), paused=${snap.paused}, complete=${snap.complete}`
        };
      }
      return { kind: "error", text: "auto-loop: unknown subcommand. Use pause | resume | hint <text> | status." };
    }
  });
}
function applyAutoLoop(ctx, config) {
  const resolved = resolveConfig(config);
  if (!resolved.enabled) return;
  ctx.plugin(BlackboardService);
  ctx.plugin(AutoLoopService);
  registerAutoCommand(ctx);
  const boardProjectionSchema = zod.union([
    zod.object({
      nodes: zod.array(zod.object({
        id: zod.string(),
        sessionId: zod.string(),
        kind: zod.enum(["fact", "intent", "hint", "goal"]),
        label: zod.string(),
        detail: zod.string().optional(),
        parentId: zod.string().optional(),
        status: zod.enum(["open", "claimed", "done", "abandoned"]).optional(),
        time: zod.number(),
        cycle: zod.number()
      })),
      cycle: zod.number(),
      paused: zod.boolean(),
      complete: zod.boolean()
    }),
    zod.null()
  ]);
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
      s = { startedAt: Date.now(), recentSignatures: [] };
      loops.set(sessionId, s);
    }
    return s;
  };
  const board = () => blackboardOf(ctx);
  ctx.tools.register(defineTool({
    name: "board_write",
    description: "Write a node to the engagement blackboard (the shared Fact/Intent/Hint graph that drives this autonomous run). Write a `fact` for every confirmed, objective finding (open port, credential, version, reachable path). Write an `intent` for each direction of exploration you decide to pursue next. Write the single `goal` node once, at bootstrap, to fix the target state. Link each node to the node it derives from via parentId so the graph grows origin \u2192 goal.",
    parameters: {
      kind: { type: "string", required: true, enum: ["fact", "intent", "goal"], description: "fact=confirmed finding, intent=next exploration, goal=target state (write once)." },
      label: { type: "string", required: true, description: "One-line summary of the node." },
      detail: { type: "string", description: "Supporting evidence or payload, optional." },
      parentId: { type: "string", description: "Id of the node this derives from; omit for the origin." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { id: { type: "string", required: true }, cycle: { type: "integer", required: true } }
      },
      render: (_args, value) => [{ type: "text", text: `blackboard: wrote node ${value.id} (cycle ${value.cycle})` }]
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
      return { id: node.id, cycle: node.cycle };
    }
  }));
  ctx.tools.register(defineTool({
    name: "board_read",
    description: "Read the current blackboard: every Fact, open Intent, Hint, and the Goal, with the loop cycle and pause/complete flags. Call this at the start of each Observe pass before deciding what to do next.",
    parameters: {},
    output: {
      schema: { type: "object", additionalProperties: false, properties: { summary: { type: "string", required: true } } },
      render: (_args, value) => [{ type: "text", text: value.summary }]
    },
    async execute(_args, exec) {
      if (!exec.agent) throw new Error("board_read requires an owning agent session");
      const snap = await board().snapshot(exec.agent.session);
      const lines = snap.nodes.map((n) => `#${n.id} [${n.kind}${n.status !== void 0 ? `/${n.status}` : ""}] (cycle ${n.cycle}) ${n.label}${n.parentId !== void 0 ? ` <- ${n.parentId}` : ""}`);
      return {
        summary: [
          `blackboard: ${snap.nodes.length} node(s), cycle ${snap.cycle}, paused=${snap.paused}, complete=${snap.complete}`,
          ...lines
        ].join("\n")
      };
    }
  }));
  ctx.tools.register(defineTool({
    name: "board_transition",
    description: "Transition an Intent you own: `claimed` when you start executing it, `done` when it produced its Fact, `abandoned` when it is a proven dead end. Always close an Intent you claimed \u2014 an abandoned Intent must be followed by deciding a DIFFERENT direction, never retrying the same one.",
    parameters: {
      nodeId: { type: "string", required: true, description: "Id of the Intent node." },
      status: { type: "string", required: true, enum: ["claimed", "done", "abandoned"], description: "New lifecycle state." }
    },
    output: {
      schema: { type: "object", additionalProperties: false, properties: { ok: { type: "boolean", required: true } } },
      render: (_args, value) => [{ type: "text", text: value.ok ? "blackboard: intent transitioned" : "blackboard: no-op" }]
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
    parameters: {
      evidence: { type: "string", required: true, description: "Why the goal is met (flag, shell, access proof)." }
    },
    output: {
      schema: { type: "object", additionalProperties: false, properties: { ok: { type: "boolean", required: true } } },
      render: (_args, value) => [{ type: "text", text: value.ok ? "blackboard: goal marked complete \u2014 loop stops" : "blackboard: no-op" }]
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error("board_complete requires an owning agent session");
      board().markComplete(exec.agent.session);
      await board().add(exec.agent.session, { kind: "fact", label: "GOAL MET", detail: args.evidence });
      return { ok: true };
    }
  }));
  ctx.on("agent/status", ({ agent, status }) => {
    if (status !== "idle") return;
    void (async () => {
      const session = agent.session;
      if (board().isPaused(session) || board().isComplete(session)) return;
      const state = stateOf(session.id);
      const snap = await board().snapshot(session);
      if (snap.cycle >= resolved.maxCycles) return;
      if (Date.now() - state.startedAt > resolved.maxDurationMs) return;
      if (snap.nodes.length === 0) return;
      const cycle = board().nextCycle(session);
      const open = snap.nodes.filter((n) => n.kind === "intent" && (n.status === "open" || n.status === void 0));
      const top = open.at(-1);
      const prompt = top !== void 0 ? `[auto-loop] OODA cycle ${cycle}. Act on Intent #${top.id}: "${top.label}". Claim it (board_transition), execute it with your tools, write the resulting Fact (board_write), then close it. If it proves a dead end, abandon it and decide a different direction.` : `[auto-loop] OODA cycle ${cycle}. No open Intents. Observe the blackboard (board_read), Orient, and Decide your next Intents (board_write kind=intent). If the Goal is met, call board_complete.`;
      agent.steer(createUserMessage({
        content: [{ type: "text", text: prompt }],
        source: { kind: "plugin", plugin: "auto-loop" }
      }));
    })();
  });
  ctx.on("tools/post-execute", async (exec, _result, next) => {
    const agent = exec.agent;
    if (agent !== void 0) {
      const state = stateOf(agent.session.id);
      state.recentSignatures.push(exec.name);
      if (state.recentSignatures.length > resolved.stallThreshold) state.recentSignatures.shift();
      const allSame = state.recentSignatures.length === resolved.stallThreshold && state.recentSignatures.every((s) => s === state.recentSignatures[0]);
      if (allSame && !board().isPaused(agent.session)) {
        agent.steer(createUserMessage({
          content: [{ type: "text", text: `[auto-loop] STALL detected: the same operation ran ${resolved.stallThreshold} times in a row. That path is a proven dead end. Abandon the current Intent (board_transition status=abandoned) and decide a COMPLETELY different direction.` }],
          source: { kind: "plugin", plugin: "auto-loop" }
        }));
        state.recentSignatures = [];
      }
    }
    return next();
  }, { global: true });
}

// src/runtime-status.ts
import { spawnSync } from "node:child_process";

// src/skills.ts
import { readFile as readFile2, readdir as readdir2 } from "node:fs/promises";
import { dirname as dirname2, join as join2 } from "node:path";
import { fileURLToPath as fileURLToPath2, pathToFileURL } from "node:url";
import {
  BUNDLED_SKILL_RANK
} from "@deepseek-ai/dsh-skill";
var SKILLS_ROOT = fileURLToPath2(new URL("../skills", import.meta.url));
var SKILL_PROVIDER_NAME = "ant-sword-skills";
function parseFrontmatter(text) {
  const src = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  if (!src.startsWith("---")) return { frontmatter: {}, body: text };
  const end = src.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: {}, body: text };
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
        const m2 = /user-invocable:\s*"?([^"\n]+)"?/.exec(nested);
        if (m2?.[1] !== void 0) metadataUserInvocable = m2[1].trim();
        j++;
      }
      i = j - 1;
      continue;
    }
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (m?.[1] !== void 0 && m[2] !== void 0) {
      frontmatter[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  if (metadataUserInvocable !== void 0) frontmatter["user-invocable"] = metadataUserInvocable;
  return { frontmatter, body: src.slice(end + 4) };
}
async function collect(root) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir2(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join2(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name === "SKILL.md") {
        const text = await readFile2(path, "utf8");
        const { frontmatter, body } = parseFrontmatter(text);
        if (frontmatter["name"] !== void 0 && frontmatter["name"] !== "") {
          out.push({ path, frontmatter, body });
        }
      }
    }
  }
  await walk(root);
  return out;
}
function isFalse(value) {
  return value !== void 0 && /^(false|0|no|off)$/i.test(value);
}
function toCandidate(skill) {
  const { frontmatter, path } = skill;
  const disableModel = !isFalse(frontmatter["disable-model-invocation"]) && frontmatter["disable-model-invocation"] !== void 0;
  const candidate2 = {
    name: frontmatter["name"] ?? "",
    description: frontmatter["description"] ?? "",
    ...frontmatter["whenToUse"] !== void 0 && frontmatter["whenToUse"] !== "" ? { whenToUse: frontmatter["whenToUse"] } : {},
    invocation: {
      modelInvocable: !disableModel,
      userInvocable: !isFalse(frontmatter["user-invocable"])
    },
    provider: SKILL_PROVIDER_NAME,
    source: "bundled",
    resourceBase: { kind: "directory", path: dirname2(path) },
    rank: BUNDLED_SKILL_RANK,
    locator: pathToFileURL(path),
    path
  };
  return candidate2;
}
var cache;
async function candidates() {
  if (cache !== void 0) return cache;
  const collected = await collect(SKILLS_ROOT);
  const built = collected.map(toCandidate);
  cache = built;
  return built;
}
var skillProvider = {
  name: SKILL_PROVIDER_NAME,
  list: () => candidates(),
  async get(candidate2) {
    const locator = candidate2.locator;
    if (!(locator instanceof URL)) return void 0;
    let text;
    try {
      text = await readFile2(locator, "utf8");
    } catch {
      return void 0;
    }
    const { body } = parseFrontmatter(text);
    return {
      name: candidate2.name,
      description: candidate2.description,
      ...candidate2.whenToUse !== void 0 ? { whenToUse: candidate2.whenToUse } : {},
      invocation: candidate2.invocation,
      provider: candidate2.provider,
      source: candidate2.source,
      ...candidate2.resourceBase !== void 0 ? { resourceBase: candidate2.resourceBase } : {},
      content: body.trim(),
      ...candidate2.path !== void 0 ? { path: candidate2.path } : {}
    };
  }
};

// src/runtime-status.ts
var INSTALL_GUIDES = {
  kali: { command: "pip install kali-server-mcp", hint: "\u5B89\u88C5 kali-server-mcp\uFF0C\u5E76\u786E\u4FDD\u547D\u4EE4\u5DF2\u52A0\u5165 PATH\u3002" },
  metasploit: { command: "pip install metasploit-mcp", hint: "\u5B89\u88C5 Metasploit MCP bridge\uFF0C\u5E76\u5148\u5B8C\u6210 Metasploit \u521D\u59CB\u5316\u3002" },
  hexstrike: { command: "pip install hexstrike-ai", hint: "\u5B89\u88C5 HexStrike AI MCP \u670D\u52A1\u5E76\u5C06 hexstrike-ai \u52A0\u5165 PATH\u3002" },
  pentestswarm: { command: "pip install pentestswarm", hint: "\u5B89\u88C5 PentestSwarm\uFF0C\u5E76\u5728\u914D\u7F6E\u4E2D\u586B\u5199\u7F16\u6392\u5668 API key\u3002" },
  jshook: { command: "npm install -g @jshookmcp/jshook", hint: "\u9700\u8981 Node.js\uFF1B\u4E5F\u53EF\u4FDD\u7559 npx \u6309\u9700\u4E0B\u8F7D\u6A21\u5F0F\u3002" },
  anything: { hint: "\u542F\u52A8 AnythingLLM MCP \u670D\u52A1\uFF0C\u5E76\u786E\u8BA4 http://localhost:23816/mcp \u53EF\u8BBF\u95EE\u3002" },
  idapro: { hint: "\u5728 IDA Pro \u4E2D\u542F\u52A8 MCP \u63D2\u4EF6\uFF0C\u5E76\u786E\u8BA4 http://127.0.0.1:13337/mcp \u53EF\u8BBF\u95EE\u3002" },
  ghidra: { hint: "\u5728 Ghidra \u4E2D\u542F\u52A8 MCP \u63D2\u4EF6\uFF0C\u5E76\u786E\u8BA4 http://localhost:8765/mcp \u53EF\u8BBF\u95EE\u3002" }
};
function commandExists(command) {
  if (command === "") return false;
  const locator = process.platform === "win32" ? "where.exe" : "which";
  return spawnSync(locator, [command], { stdio: "ignore", windowsHide: true }).status === 0;
}
function mcpStatus(server, probes, isMounted) {
  const guide = INSTALL_GUIDES[server.serverName] ?? { hint: "\u5B89\u88C5\u5BF9\u5E94 MCP server\uFF0C\u5E76\u786E\u8BA4\u914D\u7F6E\u7684\u547D\u4EE4\u6216 URL \u53EF\u8BBF\u95EE\u3002" };
  const target = server.transport === "stdio" ? server.command ?? "" : server.url ?? "";
  const availability = server.enabled === false ? "disabled" : server.transport === "stdio" ? commandExists(target) ? "available" : "missing" : "configured";
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
    skills: { available: 0, provider: skillProvider.name, state: "ready" },
    mcp: getServers().map((server) => mcpStatus(server, probes, isMcpMounted))
  };
  const publish = async () => {
    if (running || lifecycle.disposed) return;
    running = true;
    let skills;
    try {
      const candidates2 = await ctx.skills.list({ signal: new AbortController().signal });
      const available = candidates2.length;
      skills = { available, provider: skillProvider.name, state: "ready" };
    } catch (error) {
      skills = { available: 0, provider: skillProvider.name, state: "error", error: String(error) };
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
  void publish();
  const timer = setInterval(() => {
    void publish();
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
          res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
          res.end(JSON.stringify({ ok: true, serverName: body.serverName }));
        } catch (error) {
          res.writeHead(400, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
          res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
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
          probes.set(body.serverName, { checkedAt: Date.now(), toolCount: result.toolCount, tools: result.tools });
          await publish();
          res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
          res.end(JSON.stringify({ ok: true, serverName: body.serverName, toolCount: result.toolCount, tools: result.tools }));
        } catch (error) {
          res.writeHead(400, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
          res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
        }
      }
    }), "ant-sword-runtime-status: MCP probe endpoint");
  });
  ctx.on("skills/change", () => {
    void publish();
  });
}

// src/runtime-config-api.ts
import { isDeepStrictEqual } from "node:util";
import {
  SettingsConflictError,
  settingsNamespace
} from "@deepseek-ai/dsh-settings";

// src/runtime-config.ts
import z4 from "@deepseek-ai/schemastery";

// src/mcp-servers.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import z3 from "@deepseek-ai/schemastery";
import * as mcpClient from "@deepseek-ai/dsh-mcp-client";
var McpServerSchema = z3.object({
  enabled: z3.boolean().default(true).description("\u542F\u7528\u6B64 MCP \u670D\u52A1\u5668\uFF1B\u5173\u95ED\u5219\u4E0D\u6302\u8F7D\uFF0C\u5176 mcp__* \u5DE5\u5177\u4E0D\u51FA\u73B0\u3002"),
  serverName: z3.string().required().description("\u5DE5\u5177\u547D\u540D\u7A7A\u95F4\uFF0C\u6A21\u578B\u770B\u5230\u7684\u662F mcp__<serverName>__<tool>\u3002"),
  transport: z3.union(["stdio", "sse", "streamable-http"]).required().description("stdio=\u62C9\u8D77\u5B50\u8FDB\u7A0B\uFF1Bsse=\u65E7\u7248 HTTP+SSE\uFF1Bstreamable-http=\u5F53\u524D HTTP MCP\u3002"),
  command: z3.string().description("stdio\uFF1A\u8981\u542F\u52A8\u7684\u53EF\u6267\u884C\u6587\u4EF6\u3002"),
  args: z3.array(z3.string()).description("stdio\uFF1A\u547D\u4EE4\u53C2\u6570\u3002"),
  cwd: z3.string().description("stdio\uFF1A\u5DE5\u4F5C\u76EE\u5F55\uFF1B\u7559\u7A7A\u4F7F\u7528 Harness \u5DE5\u4F5C\u76EE\u5F55\u3002"),
  toolCallTimeoutMs: z3.number().min(1).max(2147483647).default(6e4).description("\u5355\u6B21\u5DE5\u5177\u8C03\u7528\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09\u3002"),
  env: z3.dict(z3.string()).description("stdio\uFF1A\u989D\u5916\u73AF\u5883\u53D8\u91CF\uFF08\u4E0D\u542B\u5BC6\u94A5\uFF0C\u5BC6\u94A5\u8D70 secret \u5B57\u6BB5\uFF09\u3002"),
  url: z3.string().description("streamable-http\uFF1A\u670D\u52A1\u5668\u5730\u5740\u3002"),
  headers: z3.dict(z3.string()).description("streamable-http\uFF1A\u989D\u5916\u8BF7\u6C42\u5934\u3002")
});
var DEFAULT_MCP_SERVERS = [
  { enabled: true, serverName: "kali", transport: "stdio", command: "kali-server-mcp", args: ["--port", "5000"] },
  { enabled: true, serverName: "metasploit", transport: "stdio", command: "metasploitmcp", args: ["--transport", "stdio"] },
  { enabled: true, serverName: "hexstrike", transport: "stdio", command: "hexstrike-ai", args: [] },
  { enabled: true, serverName: "pentestswarm", transport: "stdio", command: "pentestswarm", args: ["mcp", "serve"] },
  { enabled: true, serverName: "jshook", transport: "stdio", command: "npx", args: ["-y", "@jshookmcp/jshook@latest"], env: { JSHOOK_BASE_PROFILE: "search" } },
  { enabled: true, serverName: "anything", transport: "streamable-http", url: "http://localhost:23816/mcp" },
  { enabled: true, serverName: "idapro", transport: "streamable-http", url: "http://127.0.0.1:13337/mcp" },
  { enabled: true, serverName: "ghidra", transport: "streamable-http", url: "http://localhost:8765/mcp" },
  { enabled: true, serverName: "everything", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-everything"] },
  { enabled: false, serverName: "memory", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"] },
  { enabled: false, serverName: "filesystem", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "."] },
  { enabled: false, serverName: "github", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
  { enabled: false, serverName: "playwright", transport: "stdio", command: "npx", args: ["-y", "@playwright/mcp@latest"] },
  { enabled: false, serverName: "remote-http", transport: "streamable-http", url: "http://127.0.0.1:3000/mcp" }
];
function commandExists2(command) {
  if (command === "") return false;
  const locator = process.platform === "win32" ? "where.exe" : "which";
  return spawnSync2(locator, [command], { stdio: "ignore", windowsHide: true }).status === 0;
}

// src/runtime-config.ts
var ANT_SWORD_SETTINGS_NAMESPACE = "ant-sword-runtime";
var SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
var SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
var RULE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
var MAX_RULE_TITLE_BYTES = 256;
var MAX_RULE_CONTENT_BYTES = 32 * 1024;
var MAX_PROVIDER_ID_BYTES = 128;
var MAX_MODEL_ID_BYTES = 256;
var DEFAULT_THINKING_FALLBACK = {
  minimum: "off",
  low: "high",
  medium: "high",
  high: "max",
  maximum: "max"
};
var ChannelThinkingPolicySchema = z4.object({
  providerId: z4.string().required(),
  modelId: z4.string().required(),
  level: z4.union(["minimum", "low", "medium", "high", "maximum"]).required()
});
var SimulatedEffortsSchema = z4.object({
  minimum: z4.string().required(),
  low: z4.string().required(),
  medium: z4.string().required(),
  high: z4.string().required(),
  maximum: z4.string().required()
});
var ThinkingFallbackPolicySchema = z4.object({
  providerId: z4.string().required(),
  modelId: z4.string().required(),
  simulatedEfforts: SimulatedEffortsSchema.required()
});
var RuntimeRuleSchema = z4.object({
  id: z4.string().required(),
  title: z4.string().required(),
  enabled: z4.boolean().default(true),
  order: z4.number().default(0),
  placement: z4.union(["before-persona", "after-persona", "before-tools", "after-tools"]).required(),
  content: z4.string().required()
});
var AntSwordRuntimeConfigSchema = z4.object({
  mcpServers: z4.array(McpServerSchema).default(DEFAULT_MCP_SERVERS.map((server) => ({ ...server }))),
  disabledSkills: z4.array(z4.string()).default([]),
  rules: z4.array(RuntimeRuleSchema).default([]),
  thinkingPolicies: z4.array(ChannelThinkingPolicySchema).default([]),
  thinkingFallbacks: z4.array(ThinkingFallbackPolicySchema).default([]),
  // No schema `.default()`: schemastery coerces an explicit `null` back to a
  // non-null default, which would make disabling impossible. Instead, an
  // omitted field arrives as `undefined` and the runtime treats that as
  // "use DEFAULT_THINKING_FALLBACK"; only an explicit `null` disables it.
  defaultThinkingFallback: z4.union([SimulatedEffortsSchema, z4.const(null)])
});
var DEFAULT_RUNTIME_CONFIG = AntSwordRuntimeConfigSchema({
  mcpServers: DEFAULT_MCP_SERVERS.map((server) => ({ ...server })),
  disabledSkills: [],
  rules: [],
  thinkingPolicies: [],
  thinkingFallbacks: [],
  defaultThinkingFallback: { ...DEFAULT_THINKING_FALLBACK }
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
  if (!SERVER_NAME_PATTERN.test(server.serverName)) {
    throw new TypeError(`MCP serverName "${server.serverName}" must match ${String(SERVER_NAME_PATTERN)}`);
  }
  if (server.transport === "stdio") {
    if (server.command === void 0 || server.command.trim() === "") {
      throw new TypeError(`stdio MCP server "${server.serverName}" requires command`);
    }
    if (server.url !== void 0) throw new TypeError(`stdio MCP server "${server.serverName}" cannot define url`);
    return;
  }
  const hasStdioFields = server.command !== void 0 && server.command !== "" || server.args !== void 0 && server.args.length > 0 || server.cwd !== void 0 && server.cwd !== "" || server.env !== void 0 && Object.keys(server.env).length > 0;
  if (hasStdioFields) {
    throw new TypeError(`streamable-http MCP server "${server.serverName}" cannot define stdio fields`);
  }
  let url;
  try {
    url = new URL(server.url ?? "");
  } catch {
    throw new TypeError(`streamable-http MCP server "${server.serverName}" requires a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(`streamable-http MCP server "${server.serverName}" URL must use http or https`);
  }
}
function validateRule(rule) {
  if (!RULE_ID_PATTERN.test(rule.id)) throw new TypeError(`rule id "${rule.id}" must match ${String(RULE_ID_PATTERN)}`);
  if (!Number.isSafeInteger(rule.order)) throw new TypeError(`rule "${rule.id}" order must be a safe integer`);
  if (rule.title.trim() === "") throw new TypeError(`rule "${rule.id}" title cannot be empty`);
  if (byteLength(rule.title) > MAX_RULE_TITLE_BYTES) throw new TypeError(`rule "${rule.id}" title exceeds ${String(MAX_RULE_TITLE_BYTES)} UTF-8 bytes`);
  if (rule.content.includes("\0")) throw new TypeError(`rule "${rule.id}" content cannot contain NUL`);
  if (byteLength(rule.content) > MAX_RULE_CONTENT_BYTES) throw new TypeError(`rule "${rule.id}" content exceeds ${String(MAX_RULE_CONTENT_BYTES)} UTF-8 bytes`);
}
function validateThinkingPolicy(policy) {
  const providerId = policy.providerId.trim();
  const modelId = policy.modelId.trim();
  if (providerId === "" || providerId !== policy.providerId || /[\0-\x1f]/u.test(providerId)) {
    throw new TypeError("thinking policy providerId must be non-empty, trimmed, and contain no control characters");
  }
  if (modelId === "" || modelId !== policy.modelId || /[\0-\x1f]/u.test(modelId)) {
    throw new TypeError("thinking policy modelId must be non-empty, trimmed, and contain no control characters");
  }
  if (byteLength(providerId) > MAX_PROVIDER_ID_BYTES) throw new TypeError(`thinking policy providerId exceeds ${String(MAX_PROVIDER_ID_BYTES)} UTF-8 bytes`);
  if (byteLength(modelId) > MAX_MODEL_ID_BYTES) throw new TypeError(`thinking policy modelId exceeds ${String(MAX_MODEL_ID_BYTES)} UTF-8 bytes`);
}
function validateThinkingFallback(fallback) {
  const providerId = fallback.providerId.trim();
  const modelId = fallback.modelId.trim();
  if (providerId === "" || providerId !== fallback.providerId || /[\0-\x1f]/u.test(providerId)) {
    throw new TypeError("thinking fallback providerId must be non-empty, trimmed, and contain no control characters");
  }
  if (modelId === "" || modelId !== fallback.modelId || /[\0-\x1f]/u.test(modelId)) {
    throw new TypeError("thinking fallback modelId must be non-empty, trimmed, and contain no control characters");
  }
  if (byteLength(providerId) > MAX_PROVIDER_ID_BYTES) throw new TypeError(`thinking fallback providerId exceeds ${String(MAX_PROVIDER_ID_BYTES)} UTF-8 bytes`);
  if (byteLength(modelId) > MAX_MODEL_ID_BYTES) throw new TypeError(`thinking fallback modelId exceeds ${String(MAX_MODEL_ID_BYTES)} UTF-8 bytes`);
  validateSimulatedEfforts(fallback.simulatedEfforts, "thinking fallback simulatedEfforts");
}
function validateSimulatedEfforts(efforts, label) {
  for (const level of ["minimum", "low", "medium", "high", "maximum"]) {
    const effortId = efforts[level];
    if (effortId === "" || effortId.trim() !== effortId || /[\0-\x1f]/u.test(effortId)) {
      throw new TypeError(`${label}.${level} must be non-empty, trimmed, and contain no control characters`);
    }
  }
}
function validateRuntimeConfig(config) {
  assertUnique(config.mcpServers.map((server) => server.serverName), "mcpServers");
  for (const server of config.mcpServers) validateMcpServer(server);
  assertUnique(config.disabledSkills, "disabledSkills");
  for (const name2 of config.disabledSkills) {
    if (!SKILL_NAME_PATTERN.test(name2)) throw new TypeError(`disabled skill "${name2}" must match ${String(SKILL_NAME_PATTERN)}`);
  }
  assertUnique(config.rules.map((rule) => rule.id), "rules");
  for (const rule of config.rules) validateRule(rule);
  assertUnique(config.thinkingPolicies.map((policy) => `${policy.providerId}\0${policy.modelId}`), "thinkingPolicies");
  for (const policy of config.thinkingPolicies) validateThinkingPolicy(policy);
  assertUnique(config.thinkingFallbacks.map((fallback) => `${fallback.providerId}\0${fallback.modelId}`), "thinkingFallbacks");
  for (const fallback of config.thinkingFallbacks) validateThinkingFallback(fallback);
  if (config.defaultThinkingFallback !== null && config.defaultThinkingFallback !== void 0) {
    validateSimulatedEfforts(config.defaultThinkingFallback, "defaultThinkingFallback");
  }
}
function cloneConfig(config) {
  return structuredClone(config);
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
var RuntimeController = class {
  constructor(scope, reconcilers) {
    this.scope = scope;
    this.reconcilers = reconcilers;
    this.desired = cloneConfig(scope.get());
    this.applied = cloneConfig(this.desired);
    validateRuntimeConfig(this.desired);
  }
  scope;
  reconcilers;
  desired;
  applied;
  generation = 0;
  desiredGeneration = 0;
  applying = false;
  lastFailure;
  tail = Promise.resolve();
  stopped = false;
  listeners = /* @__PURE__ */ new Set();
  start() {
    const unwatch = this.scope.watch((next) => this.enqueue(next));
    void this.enqueue(this.desired);
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
      desiredGeneration: this.desiredGeneration,
      applying: this.applying,
      desired: cloneConfig(this.desired),
      applied: cloneConfig(this.applied),
      ...this.lastFailure === void 0 ? {} : { lastFailure: { ...this.lastFailure } }
    };
  }
  whenIdle() {
    return this.tail;
  }
  enqueue(next) {
    const candidate2 = cloneConfig(next);
    this.desired = cloneConfig(candidate2);
    const candidateGeneration = ++this.desiredGeneration;
    this.emit();
    const run = this.tail.then(() => this.apply(candidate2, candidateGeneration));
    this.tail = run.catch(() => void 0);
    return run;
  }
  async apply(next, candidateGeneration) {
    if (this.stopped) return;
    this.applying = true;
    this.emit();
    const prepared = [];
    let activeReconciler = "validation";
    try {
      validateRuntimeConfig(next);
      for (const reconciler of this.reconcilers) {
        activeReconciler = reconciler.name;
        prepared.push({ reconciler, change: await reconciler.prepare(next, this.applied) });
      }
      const committed = [];
      try {
        for (const entry of prepared) {
          activeReconciler = entry.reconciler.name;
          await entry.change.commit();
          committed.push(entry);
        }
      } catch (error) {
        await Promise.allSettled(committed.reverse().map(async (entry) => {
          await entry.change.rollback();
        }));
        throw error;
      }
      this.applied = cloneConfig(next);
      this.generation = candidateGeneration;
      this.lastFailure = void 0;
    } catch (error) {
      this.lastFailure = { reconciler: activeReconciler, message: errorMessage(error), generation: candidateGeneration };
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

// src/runtime-config-api.ts
var MAX_BODY_BYTES = 512 * 1024;
var MUTABLE_FIELDS = /* @__PURE__ */ new Set(["mcpServers", "disabledSkills", "rules", "thinkingPolicies"]);
var NAMESPACE = settingsNamespace(ANT_SWORD_SETTINGS_NAMESPACE);
function errorBody(code, error) {
  const message = error instanceof Error ? error.message : String(error);
  return { error: message, code, message };
}
function sendJson(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}
async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > MAX_BODY_BYTES) throw new TypeError(`request body exceeds ${String(MAX_BODY_BYTES)} bytes`);
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isLoopbackRequest(req) {
  const address = req.socket.remoteAddress;
  return address === "127.0.0.1" || address === "::1" || address?.startsWith("::ffff:127.") === true;
}
function optionalRevision(value) {
  if (value === void 0) return void 0;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("expectedRevision must be a non-negative safe integer");
  }
  return value;
}
function parseRuntimeConfigMutation(value) {
  if (!isRecord(value)) throw new TypeError("runtime config request must be a JSON object");
  if (value.op !== "set" && value.op !== "unset") throw new TypeError('op must be "set" or "unset"');
  if (typeof value.field !== "string" || !MUTABLE_FIELDS.has(value.field)) {
    throw new TypeError("field must be one of mcpServers, disabledSkills, rules, or thinkingPolicies");
  }
  const allowed = value.op === "set" ? /* @__PURE__ */ new Set(["op", "field", "value", "expectedRevision"]) : /* @__PURE__ */ new Set(["op", "field", "expectedRevision"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new TypeError("runtime config request contains unsupported fields");
  const expectedRevision = optionalRevision(value.expectedRevision);
  const field = value.field;
  if (value.op === "unset") return { op: "unset", field, ...expectedRevision === void 0 ? {} : { expectedRevision } };
  if (!Object.hasOwn(value, "value")) throw new TypeError("set requires value");
  return { op: "set", field, value: value.value, ...expectedRevision === void 0 ? {} : { expectedRevision } };
}
function descriptor(settings) {
  const found = settings.describe({ redactSecrets: true }).find((candidate2) => candidate2.ns === NAMESPACE);
  if (found === void 0) throw new Error(`settings namespace "${ANT_SWORD_SETTINGS_NAMESPACE}" is not registered`);
  return found;
}
function runtimeConfigApiView(settings, controller) {
  const settingsView = descriptor(settings);
  const runtime = controller.snapshot();
  return {
    value: settingsView.value,
    desired: runtime.desired,
    applied: runtime.applied,
    ...settingsView.base === void 0 ? {} : { base: settingsView.base },
    ...settingsView.user === void 0 ? {} : { user: settingsView.user },
    revision: settingsView.revision,
    writable: settings.writable,
    generation: runtime.generation,
    desiredGeneration: runtime.desiredGeneration,
    applying: runtime.applying,
    inSync: isDeepStrictEqual(runtime.desired, runtime.applied),
    ...runtime.lastFailure === void 0 ? {} : { lastFailure: runtime.lastFailure }
  };
}
async function mutateRuntimeConfig(settings, controller, mutation) {
  const op = mutation.op === "set" ? { op: "set", path: [mutation.field], value: mutation.value } : { op: "unset", path: [mutation.field] };
  await settings.mutate(NAMESPACE, [op], mutation.expectedRevision);
  await Promise.resolve();
  await controller.whenIdle();
  return runtimeConfigApiView(settings, controller);
}
function applyRuntimeConfigApi(ctx, controller) {
  ctx.webServer.register({
    kind: "exact",
    path: "/ant-sword/runtime-config",
    handler: async (req, res) => {
      if (!isLoopbackRequest(req)) {
        sendJson(res, 403, errorBody("loopback-only", "loopback-only"));
        return;
      }
      if (req.method === "GET") {
        try {
          sendJson(res, 200, runtimeConfigApiView(ctx.settings, controller));
        } catch (error) {
          sendJson(res, 503, errorBody("settings-unavailable", error));
        }
        return;
      }
      if (req.method !== "POST") {
        sendJson(res, 405, errorBody("method-not-allowed", "method-not-allowed"));
        return;
      }
      try {
        const mutation = parseRuntimeConfigMutation(await readJson(req));
        sendJson(res, 200, await mutateRuntimeConfig(ctx.settings, controller, mutation));
      } catch (error) {
        const conflict = error instanceof SettingsConflictError;
        const status = conflict ? 409 : error instanceof TypeError ? 400 : 500;
        const code = conflict ? "revision-conflict" : error instanceof TypeError ? "invalid-request" : "internal-error";
        sendJson(res, status, errorBody(code, error));
      }
    }
  });
}

// src/thinking-policy-api.ts
function applyThinkingPolicyApi(ctx, runtime) {
  ctx.webServer.register({
    kind: "exact",
    path: "/ant-sword/thinking/catalog",
    handler: async (req, res) => {
      if (!isLoopbackRequest(req)) {
        sendJson(res, 403, errorBody("loopback-only", "loopback-only"));
        return;
      }
      if (req.method !== "GET") {
        sendJson(res, 405, errorBody("method-not-allowed", "method-not-allowed"));
        return;
      }
      try {
        const providers = ctx.llm.listProviders();
        const entries = await Promise.all(providers.map(async (provider) => ({
          ...provider,
          models: await ctx.llm.listModels(provider.id)
        })));
        sendJson(res, 200, { providers: entries });
      } catch (error) {
        sendJson(res, 503, errorBody("catalog-unavailable", error));
      }
    }
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/ant-sword/thinking/capability",
    handler: async (req, res) => {
      if (!isLoopbackRequest(req)) {
        sendJson(res, 403, errorBody("loopback-only", "loopback-only"));
        return;
      }
      if (req.method !== "GET") {
        sendJson(res, 405, errorBody("method-not-allowed", "method-not-allowed"));
        return;
      }
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const providerId = url.searchParams.get("provider")?.trim() ?? "";
      const modelId = url.searchParams.get("model")?.trim() ?? "";
      if (providerId === "" || modelId === "") {
        sendJson(res, 400, errorBody("invalid-request", "provider and model query parameters are required"));
        return;
      }
      try {
        sendJson(res, 200, await runtime.capability(providerId, modelId));
      } catch (error) {
        sendJson(res, 404, errorBody("model-not-found", error));
      }
    }
  });
}

// src/installer/catalog.ts
var COMMAND_TIMEOUT = 10 * 6e4;
function npmComponent(id, label, packageSpec, command) {
  return {
    id,
    label,
    version: packageSpec.slice(packageSpec.lastIndexOf("@") + 1),
    dependencies: ["node"],
    probe: { kind: "command", command, args: ["--version"] },
    variants: [
      { platform: "win32", architectures: ["x64", "arm64"], steps: [{ kind: "command", phase: "installing", executable: "npm", args: ["install", "--global", packageSpec, "--registry", "https://registry.npmjs.org"], timeoutMs: COMMAND_TIMEOUT }] },
      { platform: "linux", architectures: ["x64", "arm64"], steps: [{ kind: "command", phase: "installing", executable: "npm", args: ["install", "--global", packageSpec, "--registry", "https://registry.npmjs.org"], timeoutMs: COMMAND_TIMEOUT }] }
    ]
  };
}
function pipxComponent(id, label, packageSpec, command) {
  return {
    id,
    label,
    version: packageSpec.includes("==") ? packageSpec.split("==").at(1) ?? "pinned-commit" : "pinned-commit",
    dependencies: ["python", "pipx"],
    probe: { kind: "command", command, args: ["--help"] },
    variants: [
      { platform: "win32", architectures: ["x64", "arm64"], steps: [{ kind: "command", phase: "installing", executable: "pipx", args: ["install", "--force", packageSpec], timeoutMs: COMMAND_TIMEOUT }] },
      { platform: "linux", architectures: ["x64", "arm64"], steps: [{ kind: "command", phase: "installing", executable: "pipx", args: ["install", "--force", packageSpec], timeoutMs: COMMAND_TIMEOUT }] }
    ]
  };
}
var INSTALL_CATALOG = [
  {
    id: "git",
    label: "Git",
    version: "system",
    dependencies: [],
    probe: { kind: "command", command: "git", args: ["--version"] },
    variants: [
      { platform: "win32", architectures: ["x64", "arm64"], steps: [{ kind: "command", phase: "installing", executable: "winget", args: ["install", "--exact", "--id", "Git.Git", "--accept-package-agreements", "--accept-source-agreements"], timeoutMs: COMMAND_TIMEOUT }] },
      { platform: "linux", architectures: ["x64", "arm64"], steps: [{ kind: "command", phase: "installing", executable: "apt-get", args: ["install", "-y", "git"], timeoutMs: COMMAND_TIMEOUT }] }
    ]
  },
  {
    id: "python",
    label: "Python",
    version: "3.12",
    dependencies: [],
    probe: { kind: "command", command: "python", args: ["--version"] },
    variants: [
      { platform: "win32", architectures: ["x64", "arm64"], steps: [{ kind: "command", phase: "installing", executable: "winget", args: ["install", "--exact", "--id", "Python.Python.3.12", "--accept-package-agreements", "--accept-source-agreements"], timeoutMs: COMMAND_TIMEOUT }] },
      { platform: "linux", architectures: ["x64", "arm64"], steps: [{ kind: "command", phase: "installing", executable: "apt-get", args: ["install", "-y", "python3", "python3-pip", "python3-venv"], timeoutMs: COMMAND_TIMEOUT }] }
    ]
  },
  {
    id: "pipx",
    label: "pipx",
    version: "1.16.5",
    dependencies: ["python"],
    probe: { kind: "command", command: "pipx", args: ["--version"] },
    variants: [
      { platform: "win32", architectures: ["x64", "arm64"], steps: [{ kind: "command", phase: "installing", executable: "python", args: ["-m", "pip", "install", "--user", "pipx==1.16.5"], timeoutMs: COMMAND_TIMEOUT }] },
      { platform: "linux", architectures: ["x64", "arm64"], steps: [{ kind: "command", phase: "installing", executable: "python3", args: ["-m", "pip", "install", "--user", "pipx==1.16.5"], timeoutMs: COMMAND_TIMEOUT }] }
    ]
  },
  {
    id: "node",
    label: "Node.js",
    version: "22",
    dependencies: [],
    probe: { kind: "command", command: "node", args: ["--version"] },
    variants: [
      { platform: "win32", architectures: ["x64", "arm64"], steps: [{ kind: "command", phase: "installing", executable: "winget", args: ["install", "--exact", "--id", "OpenJS.NodeJS.LTS", "--accept-package-agreements", "--accept-source-agreements"], timeoutMs: COMMAND_TIMEOUT }] },
      { platform: "linux", architectures: ["x64", "arm64"], steps: [{ kind: "external-action", phase: "configuring", message: "Install Node.js 22 LTS with the distribution or vendor package manager." }] }
    ]
  },
  {
    id: "java",
    label: "Java Runtime",
    version: "21",
    dependencies: [],
    probe: { kind: "command", command: "java", args: ["--version"] },
    variants: [
      { platform: "win32", architectures: ["x64", "arm64"], steps: [{ kind: "command", phase: "installing", executable: "winget", args: ["install", "--exact", "--id", "EclipseAdoptium.Temurin.21.JDK", "--accept-package-agreements", "--accept-source-agreements"], timeoutMs: COMMAND_TIMEOUT }] },
      { platform: "linux", architectures: ["x64", "arm64"], steps: [{ kind: "command", phase: "installing", executable: "apt-get", args: ["install", "-y", "openjdk-21-jdk"], timeoutMs: COMMAND_TIMEOUT }] }
    ]
  },
  npmComponent("jshookmcp", "JS Hook MCP", "@jshookmcp/jshook@0.3.4", "jshook"),
  npmComponent("reqable-mcp", "Reqable MCP", "reqable-mcp-server@1.0.1", "reqable-mcp-server"),
  pipxComponent("idalib-mcp", "IDA Pro MCP", "git+https://github.com/mrexodia/ida-pro-mcp.git@f82e6e2517a161b77e738951c3071cd446480ba0", "ida-pro-mcp"),
  {
    id: "ghidra",
    label: "Ghidra",
    version: "11.4.2",
    dependencies: ["java"],
    probe: { kind: "command", command: "analyzeHeadless", args: ["-help"] },
    installDirectory: "ghidra",
    variants: [
      {
        platform: "win32",
        architectures: ["x64", "arm64"],
        steps: [{
          kind: "download",
          phase: "downloading",
          targetName: "ghidra.zip",
          timeoutMs: COMMAND_TIMEOUT,
          officialDigest: { apiUrl: "https://api.github.com/repos/NationalSecurityAgency/ghidra/releases/tags/Ghidra_11.4.2_build", assetName: "ghidra_11.4.2_PUBLIC_20250826.zip" },
          sources: [
            { id: "ghproxy", region: "domestic", url: "https://ghproxy.net/https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_11.4.2_build/ghidra_11.4.2_PUBLIC_20250826.zip" },
            { id: "github", region: "official", url: "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_11.4.2_build/ghidra_11.4.2_PUBLIC_20250826.zip" }
          ]
        }]
      },
      {
        platform: "linux",
        architectures: ["x64", "arm64"],
        steps: [{
          kind: "download",
          phase: "downloading",
          targetName: "ghidra.zip",
          timeoutMs: COMMAND_TIMEOUT,
          officialDigest: { apiUrl: "https://api.github.com/repos/NationalSecurityAgency/ghidra/releases/tags/Ghidra_11.4.2_build", assetName: "ghidra_11.4.2_PUBLIC_20250826.zip" },
          sources: [{ id: "github", region: "official", url: "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_11.4.2_build/ghidra_11.4.2_PUBLIC_20250826.zip" }]
        }]
      }
    ]
  },
  {
    id: "ghidra-mcp",
    label: "Ghidra MCP",
    version: "controlled-release",
    dependencies: ["ghidra", "git", "python"],
    probe: { kind: "http", url: "http://127.0.0.1:8765/mcp" },
    variants: [
      { platform: "win32", architectures: ["x64", "arm64"], steps: [{ kind: "external-action", phase: "configuring", message: "Install the pinned GhidraMCP extension in Ghidra and open a project to start port 8765." }] },
      { platform: "linux", architectures: ["x64", "arm64"], steps: [{ kind: "external-action", phase: "configuring", message: "Install the pinned GhidraMCP extension in Ghidra and open a project to start port 8765." }] }
    ],
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

// src/installer/transaction.ts
import { createHash, randomUUID } from "node:crypto";
import { mkdir as mkdir2, readFile as readFile3, readdir as readdir3, rename, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join as join3 } from "node:path";

// src/installer/planner.ts
function orderSources(sources, policy) {
  if (policy === "official-first") return [...sources].sort((a, b) => Number(a.region === "domestic") - Number(b.region === "domestic"));
  if (policy === "domestic-first") return [...sources].sort((a, b) => Number(a.region === "official") - Number(b.region === "official"));
  return [...sources].sort((a, b) => Number(a.region === "official") - Number(b.region === "official"));
}
function planInstallation(componentId, platform, architecture2, catalog) {
  const entries = catalogById(catalog);
  const visiting = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  const result = [];
  const visit = (id) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new TypeError(`installer dependency cycle at "${id}"`);
    const component = entries.get(id);
    if (component === void 0) throw new TypeError(`unknown installer component "${id}"`);
    const variant = component.variants.find((candidate2) => candidate2.platform === platform && candidate2.architectures.includes(architecture2));
    if (variant === void 0) throw new TypeError(`component "${id}" does not support ${platform}/${architecture2}`);
    visiting.add(id);
    for (const dependency of component.dependencies) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    result.push({ component, variant });
  };
  visit(componentId);
  return result;
}

// src/installer/transaction.ts
var InstallerError = class extends Error {
  constructor(message, retryable) {
    super(message);
    this.retryable = retryable;
    this.name = "InstallerError";
  }
  retryable;
};
var MAX_LOG_BYTES = 64 * 1024;
var MAX_ATTEMPTS_PER_SOURCE = 2;
function boundedLogs(logs, next) {
  const entries = [...logs, next];
  while (Buffer.byteLength(entries.join("\n"), "utf8") > MAX_LOG_BYTES) entries.shift();
  return entries;
}
function abortError(signal) {
  return signal.reason instanceof Error ? signal.reason : new InstallerError("installation cancelled", false);
}
function abortableDelay(milliseconds, signal) {
  return new Promise((resolve2, reject) => {
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }
    const timer = setTimeout(resolve2, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(abortError(signal));
    }, { once: true });
  });
}
var InstallManager = class {
  constructor(runner, platform, architecture2, catalog = INSTALL_CATALOG, random = Math.random) {
    this.runner = runner;
    this.platform = platform;
    this.architecture = architecture2;
    this.catalog = catalog;
    this.random = random;
  }
  runner;
  platform;
  architecture;
  catalog;
  random;
  operations = /* @__PURE__ */ new Map();
  locks = /* @__PURE__ */ new Set();
  start(componentId, sourcePolicy) {
    if (this.locks.has(componentId)) throw new InstallerError(`component "${componentId}" already has an active installation`, false);
    const plan = planInstallation(componentId, this.platform, this.architecture, this.catalog);
    const id = randomUUID();
    const controller = new AbortController();
    const snapshot = { id, componentId, sourcePolicy, phase: "queued", progress: 0, attempt: 0, logs: [] };
    this.locks.add(componentId);
    const done = this.execute(snapshot, plan, controller.signal).finally(() => this.locks.delete(componentId));
    this.operations.set(id, { snapshot, controller, done });
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
    if (operation === void 0 || ["succeeded", "failed", "cancelled"].includes(operation.snapshot.phase)) return false;
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
        this.publish(snapshot, { phase: "probing", progress: index / plan.length }, `Probing ${component.label}`);
        if (await this.runner.probe(component, signal)) continue;
        for (const step of variant.steps) await this.executeStep(snapshot, component, step, snapshot.sourcePolicy, signal);
        await this.runner.refreshEnvironment();
        if (variant.steps.some((step) => step.kind !== "external-action") && !await this.runner.probe(component, signal)) {
          throw new InstallerError(`post-install probe failed for "${component.id}"`, false);
        }
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
      if (signal.aborted) {
        this.publish(snapshot, { phase: "cancelled", error: "installation cancelled" }, "Installation cancelled");
      } else {
        const message = error instanceof Error ? error.message : String(error);
        this.publish(snapshot, { phase: "failed", error: message }, message);
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
    const staging = join3(tmpdir(), "dsh-ant-sword-installer", snapshot.id);
    await mkdir2(staging, { recursive: true });
    const target = join3(staging, step.targetName);
    try {
      const sources = orderSources(step.sources, policy);
      let lastError;
      for (const source of sources) {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_SOURCE; attempt += 1) {
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
      }
      if (lastError instanceof Error) throw lastError;
      throw new InstallerError("all download sources failed", true);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
};
function createSubprocessInstallRunner(subprocess) {
  const backups = /* @__PURE__ */ new Map();
  const toolsRoot = join3(homedir(), ".dsh", "tools");
  const command = async (executable, args, timeoutMs, signal) => {
    const resolved = await subprocess.resolveExecutable(executable, void 0, signal);
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
    const handle = subprocess.spawn({
      argv: [resolved, ...args],
      cwd: process.cwd(),
      signal: deadline,
      graceMs: 2e3,
      stdio: { stdin: "ignore", stdout: { maxBytes: 32 * 1024 }, stderr: { maxBytes: 32 * 1024 } }
    });
    const outcome = await handle.done;
    const stdout = handle.collected.stdout?.readFrom(0).text ?? "";
    const stderr = handle.collected.stderr?.readFrom(0).text ?? "";
    if (outcome.exitCode !== 0) throw new InstallerError(stderr || `${executable} exited with ${String(outcome.exitCode)}`, false);
    return stdout.trim();
  };
  return {
    probe: async (component, signal) => {
      if (component.probe.kind === "http") {
        try {
          const response = await fetch(component.probe.url, { signal: AbortSignal.any([signal, AbortSignal.timeout(2e3)]), redirect: "error" });
          return response.ok;
        } catch {
          return false;
        }
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
        response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]), redirect: "error" });
      } catch (error) {
        throw new InstallerError(error instanceof Error ? error.message : String(error), true);
      }
      if (!response.ok) throw new InstallerError(`download failed with HTTP ${String(response.status)}`, response.status >= 500 || response.status === 408 || response.status === 429);
      const { writeFile: writeFile3 } = await import("node:fs/promises");
      await writeFile3(target, Buffer.from(await response.arrayBuffer()));
    },
    verifySha256: async (path, expected) => {
      const actual = createHash("sha256").update(await readFile3(path)).digest("hex");
      if (actual.toLowerCase() !== expected.toLowerCase()) throw new InstallerError(`SHA-256 mismatch for ${path}`, false);
    },
    resolveOfficialDigest: async (apiUrl, assetName, signal) => {
      const response = await fetch(apiUrl, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(15e3)]),
        redirect: "error",
        headers: { accept: "application/vnd.github+json", "user-agent": "dsh-ant-sword-installer" }
      });
      if (!response.ok) throw new InstallerError(`official digest request failed with HTTP ${String(response.status)}`, response.status >= 500 || response.status === 429);
      const release = await response.json();
      const digest = release.assets?.find((asset) => asset.name === assetName)?.digest;
      if (typeof digest !== "string" || !/^sha256:[a-f0-9]{64}$/i.test(digest)) throw new InstallerError(`official release has no SHA-256 digest for ${assetName}`, false);
      return digest.slice("sha256:".length);
    },
    commitArtifact: async (component, path, signal) => {
      if (component.installDirectory === void 0) throw new InstallerError(`component "${component.id}" has no managed install directory`, false);
      await mkdir2(toolsRoot, { recursive: true });
      const extracted = join3(toolsRoot, `.${component.id}-${randomUUID()}`);
      const target = join3(toolsRoot, component.installDirectory);
      const backup = join3(toolsRoot, `.${component.id}-backup-${randomUUID()}`);
      await mkdir2(extracted, { recursive: true });
      if (process.platform === "win32") {
        await command("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force", path, extracted], 10 * 6e4, signal);
      } else {
        await command("unzip", ["-q", path, "-d", extracted], 10 * 6e4, signal);
      }
      const entries = await readdir3(extracted, { withFileTypes: true });
      const firstEntry = entries[0];
      const source = entries.length === 1 && firstEntry?.isDirectory() === true ? join3(extracted, firstEntry.name) : extracted;
      try {
        await rename(target, backup);
        backups.set(component.id, backup);
      } catch (error) {
        const code = error instanceof Error && "code" in error ? error.code : void 0;
        if (code !== "ENOENT") throw error;
      }
      try {
        await rename(source, target);
      } catch (error) {
        const previous = backups.get(component.id);
        if (previous !== void 0) await rename(previous, target);
        throw error;
      } finally {
        if (source !== extracted) await rm(extracted, { recursive: true, force: true });
      }
    },
    rollback: async (component) => {
      if (component.installDirectory === void 0) return;
      const target = join3(toolsRoot, component.installDirectory);
      await rm(target, { recursive: true, force: true });
      const backup = backups.get(component.id);
      if (backup !== void 0) {
        await rename(backup, target);
        backups.delete(component.id);
      }
    },
    refreshEnvironment: () => Promise.resolve()
  };
}

// src/installer/api.ts
var MAX_BODY_BYTES2 = 16 * 1024;
var SOURCE_POLICIES = /* @__PURE__ */ new Set(["auto", "domestic-first", "official-first"]);
function sendJson2(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}
async function readJsonObject(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > MAX_BODY_BYTES2) throw new InstallerError(`request body exceeds ${String(MAX_BODY_BYTES2)} bytes`, false);
    chunks.push(bytes);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new InstallerError("request body must be a JSON object", false);
  return value;
}
function requirePost(req, res) {
  if (req.method === "POST") return true;
  sendJson2(res, 405, { error: "method-not-allowed" });
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
      sendJson2(res, 200, {
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
        sendJson2(res, 202, manager.start(body.componentId, body.sourcePolicy));
      } catch (error) {
        sendJson2(res, 400, { error: error instanceof Error ? error.message : String(error) });
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
        sendJson2(res, cancelled ? 200 : 404, { cancelled });
      } catch (error) {
        sendJson2(res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    }
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/ant-sword/install/status",
    handler: (req, res) => {
      if (req.method !== "GET") {
        sendJson2(res, 405, { error: "method-not-allowed" });
        return;
      }
      sendJson2(res, 200, { operations: manager.list() });
    }
  });
  return manager;
}

// src/dynamic-runtime.ts
import { settingsNamespace as settingsNamespace2 } from "@deepseek-ai/dsh-settings";

// src/mcp-reconciler.ts
import * as mcpClient2 from "@deepseek-ai/dsh-mcp-client";
function sameConfig(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function errorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}
function clientConfig(server, pentestswarmApiKey) {
  if (server.transport === "stdio") {
    const env = { ...server.env };
    if (server.serverName === "pentestswarm" && pentestswarmApiKey !== void 0 && pentestswarmApiKey !== "") {
      env.PENTESTSWARM_ORCHESTRATOR_API_KEY = pentestswarmApiKey;
    }
    return {
      transport: "stdio",
      serverName: server.serverName,
      command: server.command ?? "",
      args: server.args ?? [],
      env,
      cwd: server.cwd ?? "",
      toolCallTimeoutMs: server.toolCallTimeoutMs ?? 6e4,
      failOnStartupError: false,
      reconnect: { enabled: true, initialDelayMs: 1e3, maxDelayMs: 3e4, maxAttempts: 5 }
    };
  }
  return {
    transport: server.transport,
    serverName: server.serverName,
    url: server.url ?? "",
    headers: server.headers ?? {},
    toolCallTimeoutMs: server.toolCallTimeoutMs ?? 6e4,
    failOnStartupError: false,
    reconnect: { enabled: true, initialDelayMs: 1e3, maxDelayMs: 3e4, maxAttempts: 5 }
  };
}
var McpReconciler = class {
  constructor(ctx, pentestswarmApiKey, canResolveCommand = commandExists2) {
    this.ctx = ctx;
    this.pentestswarmApiKey = pentestswarmApiKey;
    this.canResolveCommand = canResolveCommand;
  }
  ctx;
  pentestswarmApiKey;
  canResolveCommand;
  name = "mcp";
  fibers = /* @__PURE__ */ new Map();
  /** Only successfully committed configurations are kept here. */
  configs = /* @__PURE__ */ new Map();
  /** Serializes every lifecycle operation, including API probe/reload calls. */
  tail = Promise.resolve();
  isMounted(serverName) {
    return this.fibers.has(serverName);
  }
  enqueue(operation) {
    const run = this.tail.then(operation);
    this.tail = run.catch(() => void 0);
    return run;
  }
  assertUsable(config) {
    if (config.enabled === false) throw new TypeError(`MCP server "${config.serverName}" is disabled`);
    if (config.transport === "stdio" && !this.canResolveCommand(config.command ?? "")) {
      throw new TypeError(`MCP server "${config.serverName}" command is not available`);
    }
  }
  async mount(config) {
    this.assertUsable(config);
    const fiber = this.ctx.plugin(mcpClient2, clientConfig(config, this.pentestswarmApiKey));
    try {
      await fiber.await();
      return fiber;
    } catch (error) {
      await fiber.dispose().catch(() => void 0);
      throw error;
    }
  }
  /** Report one server failure without making it a bundle-level failure. */
  reportFailure(serverName, phase, error) {
    const logger = this.ctx.logger;
    if (logger === void 0 || typeof logger.warn !== "function") return;
    logger.warn(`MCP server "${serverName}" ${phase}; skipping this server: ${errorMessage2(error)}`);
  }
  /** Dispose one fiber and remove only that server from the live set. */
  async disposeServer(serverName, fiber) {
    try {
      await fiber.dispose();
    } catch (error) {
      this.reportFailure(serverName, "failed to unload", error);
    } finally {
      if (this.fibers.get(serverName) === fiber) this.fibers.delete(serverName);
    }
  }
  /** Reconcile one changed server; failures are intentionally isolated. */
  async reconcileServer(serverName, desired) {
    const current = this.fibers.get(serverName);
    if (current !== void 0) await this.disposeServer(serverName, current);
    if (desired === void 0 || desired.enabled === false) return;
    if (desired.transport === "stdio" && !this.canResolveCommand(desired.command ?? "")) return;
    try {
      const fiber = await this.mount(desired);
      this.fibers.set(serverName, fiber);
    } catch (error) {
      this.reportFailure(serverName, "failed to load", error);
    }
  }
  /** Probe the applied server configuration, serialized with lifecycle changes. */
  async probe(serverName) {
    return this.enqueue(async () => {
      const config = this.configs.get(serverName);
      if (config === void 0) throw new TypeError(`unknown MCP server "${serverName}"`);
      this.assertUsable(config);
      return mcpClient2.probeMcpServer(clientConfig(config, this.pentestswarmApiKey));
    });
  }
  /** Reload an applied server without losing its previous live fiber on failure. */
  async reload(serverName) {
    return this.enqueue(async () => {
      const config = this.configs.get(serverName);
      if (config === void 0) throw new TypeError(`unknown MCP server "${serverName}"`);
      this.assertUsable(config);
      const previous = this.fibers.get(serverName);
      if (previous !== void 0) {
        await previous.dispose();
        this.fibers.delete(serverName);
      }
      try {
        const replacement = await this.mount(config);
        this.fibers.set(serverName, replacement);
      } catch (error) {
        if (previous !== void 0) {
          const restored = await this.mount(config);
          this.fibers.set(serverName, restored);
        }
        throw error;
      }
    });
  }
  prepare(next, _previousConfig) {
    const desired = new Map(next.mcpServers.map((server) => [server.serverName, server]));
    const previous = new Map(this.configs);
    return {
      commit: () => this.enqueue(async () => {
        const changed = [.../* @__PURE__ */ new Set([...previous.keys(), ...desired.keys()])].filter((name2) => {
          const before = previous.get(name2);
          const after = desired.get(name2);
          return before === void 0 || after === void 0 || !sameConfig(before, after);
        });
        await Promise.all(changed.map((name2) => this.reconcileServer(name2, desired.get(name2))));
        this.configs = desired;
      }),
      rollback: () => this.enqueue(async () => {
        const current = [...this.fibers.values()];
        await Promise.allSettled(current.map((fiber) => fiber.dispose()));
        this.fibers.clear();
        await Promise.all([...previous.entries()].map(([name2, config]) => this.reconcileServer(name2, config)));
        this.configs = previous;
      })
    };
  }
};

// src/rules-reconciler.ts
import { randomUUID as randomUUID2 } from "node:crypto";
var PLACEMENT_ORDER = {
  "before-persona": -50,
  "after-persona": 50,
  "before-tools": 90,
  "after-tools": 200
};
function sectionName(rule) {
  return `ant-sword:rule:${rule.id}`;
}
function sectionOrder(rule, collisionOffset = 0) {
  return PLACEMENT_ORDER[rule.placement] + Math.max(-9, Math.min(9, rule.order / 1e6)) + collisionOffset / 1e9;
}
function escapeRuleContent(content) {
  return content.replace(/<\/(system|assistant|user|tool)(?=[\s>])/gi, "<\\/$1");
}
function createStableRuleId(existing = []) {
  const used = new Set(existing);
  let id = `rule-${randomUUID2()}`;
  while (used.has(id)) id = `rule-${randomUUID2()}`;
  return id;
}
function ensureStableRuleIds(rules) {
  const ids = /* @__PURE__ */ new Set();
  return rules.map((rule) => {
    const id = rule.id || createStableRuleId(ids);
    if (ids.has(id)) throw new TypeError(`rules contains duplicate id "${id}"`);
    ids.add(id);
    return id === rule.id ? { ...rule } : { ...rule, id };
  });
}
function registerRules(ctx, rules) {
  const collisions = /* @__PURE__ */ new Map();
  const disposers = [];
  try {
    for (const rule of rules) {
      const key = `${rule.placement}:${rule.order}`;
      const offset = collisions.get(key) ?? 0;
      collisions.set(key, offset + 1);
      disposers.push(ctx.systemPrompt.section({
        name: sectionName(rule),
        order: sectionOrder(rule, offset),
        text: escapeRuleContent(rule.content)
      }));
    }
    return disposers;
  } catch (error) {
    disposers.forEach((dispose) => {
      dispose();
    });
    throw error;
  }
}
var RulesReconciler = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  ctx;
  name = "rules";
  disposers = [];
  rules = [];
  prepare(next, _previousConfig) {
    const desired = ensureStableRuleIds(next.rules).filter((rule) => rule.enabled).toSorted((left, right) => left.placement.localeCompare(right.placement) || left.order - right.order || left.id.localeCompare(right.id));
    const previous = this.rules.map((rule) => ({ ...rule }));
    let committed = false;
    return {
      commit: () => {
        const nextDisposers = registerRules(this.ctx, desired);
        const oldDisposers = this.disposers;
        this.disposers = nextDisposers;
        this.rules = desired;
        committed = true;
        oldDisposers.forEach((dispose) => {
          dispose();
        });
      },
      rollback: () => {
        if (!committed && this.disposers.length > 0) return;
        this.disposers.forEach((dispose) => {
          dispose();
        });
        this.disposers = registerRules(this.ctx, previous);
        this.rules = previous;
      }
    };
  }
};

// src/thinking-policy.ts
var THINKING_LEVELS = ["minimum", "low", "medium", "high", "maximum"];
function policyKey(providerId, modelId) {
  return `${providerId}\0${modelId}`;
}
function mapThinkingLevel(level, efforts) {
  if (efforts.length === 0) return void 0;
  const levelIndex = THINKING_LEVELS.indexOf(level);
  const effortIndex = Math.round(levelIndex * (efforts.length - 1) / (THINKING_LEVELS.length - 1));
  return efforts[effortIndex];
}
function findThinkingPolicy(policies, providerId, modelId) {
  return policies.find((policy) => policy.providerId === providerId && policy.modelId === modelId);
}
function findThinkingFallback(fallbacks, providerId, modelId) {
  const exactMatch = fallbacks.find((fb) => fb.providerId === providerId && fb.modelId === modelId);
  if (exactMatch !== void 0) return exactMatch;
  return fallbacks.find((fb) => {
    if (fb.providerId !== providerId) return false;
    if (fb.modelId.endsWith("*")) {
      const prefix = fb.modelId.slice(0, -1);
      return modelId.startsWith(prefix);
    }
    return false;
  });
}
function syntheticEffortsFromEfforts(efforts) {
  return [
    { id: efforts.minimum, name: "Minimum", description: "Fallback minimum effort" },
    { id: efforts.low, name: "Low", description: "Fallback low effort" },
    { id: efforts.medium, name: "Medium", description: "Fallback medium effort" },
    { id: efforts.high, name: "High", description: "Fallback high effort" },
    { id: efforts.maximum, name: "Maximum", description: "Fallback maximum effort" }
  ];
}
function syntheticEffortsFromFallback(fallback) {
  return syntheticEffortsFromEfforts(fallback.simulatedEfforts);
}
var ThinkingPolicyRuntime = class {
  constructor(ctx, source) {
    this.ctx = ctx;
    this.source = source;
  }
  ctx;
  source;
  capabilityCache = /* @__PURE__ */ new Map();
  installedAgents = /* @__PURE__ */ new WeakSet();
  start() {
    for (const agent of this.ctx.agents.list()) this.install(agent);
    return this.ctx.on("agent/created", ({ agent }) => this.install(agent));
  }
  install(agent) {
    if (this.installedAgents.has(agent)) return;
    this.installedAgents.add(agent);
    agent.ctx.effect(() => agent.ctx.on("agent/request", async (payload, next) => {
      const base = await next();
      return this.applyPolicy(base, payload.signal);
    }), "ant-sword-runtime.thinking-policy");
  }
  clearCapabilities() {
    this.capabilityCache.clear();
  }
  /**
   * Resolve a synthetic capability for a model with no native reasoning support:
   * an explicit per-model {@link ThinkingFallbackPolicy} wins, otherwise the
   * config-wide `defaultThinkingFallback` (when not disabled) makes every
   * custom-channel model surface the same five-level thinking UI as the
   * official adapter, with no per-model configuration.
   */
  resolveFallbackCapability(providerId, modelId) {
    const applied = this.source.snapshot().applied;
    const explicit = findThinkingFallback(applied.thinkingFallbacks, providerId, modelId);
    if (explicit !== void 0) {
      return {
        providerId,
        modelId,
        supported: true,
        efforts: syntheticEffortsFromFallback(explicit),
        fallback: true
      };
    }
    const fallbackDefault = applied.defaultThinkingFallback === void 0 ? DEFAULT_THINKING_FALLBACK : applied.defaultThinkingFallback;
    if (fallbackDefault !== null) {
      return {
        providerId,
        modelId,
        supported: true,
        efforts: syntheticEffortsFromEfforts(fallbackDefault),
        fallback: true
      };
    }
    return void 0;
  }
  capability(providerId, modelId, signal) {
    const key = policyKey(providerId, modelId);
    const cached = this.capabilityCache.get(key);
    if (cached !== void 0) return cached;
    const pending = this.ctx.llm.resolveModelInfo(providerId, modelId, signal).then((info) => {
      if ((info.reasoning?.efforts.length ?? 0) > 0) {
        return {
          providerId,
          modelId,
          supported: true,
          efforts: info.reasoning?.efforts ?? [],
          ...info.reasoning?.defaultEffort === void 0 ? {} : { defaultEffort: info.reasoning.defaultEffort }
        };
      }
      const fallbackCapability = this.resolveFallbackCapability(providerId, modelId);
      if (fallbackCapability !== void 0) return fallbackCapability;
      return {
        providerId,
        modelId,
        supported: false,
        efforts: []
      };
    }).catch((error) => {
      const fallbackCapability = this.resolveFallbackCapability(providerId, modelId);
      if (fallbackCapability !== void 0) return fallbackCapability;
      this.capabilityCache.delete(key);
      throw error;
    });
    this.capabilityCache.set(key, pending);
    return pending;
  }
  async applyPolicy(base, signal) {
    const policy = findThinkingPolicy(
      this.source.snapshot().applied.thinkingPolicies,
      base.provider,
      base.model
    );
    if (policy === void 0) return base;
    const capability = await this.capability(base.provider, base.model, signal);
    const effort = mapThinkingLevel(policy.level, capability.efforts);
    return effort === void 0 ? base : { ...base, reasoningEffort: effort.id };
  }
};

// src/skill-runtime.ts
import { join as join5 } from "node:path";
import { isSkillName as isSkillName2 } from "@deepseek-ai/dsh-skill";

// src/skill-catalog.ts
import { mkdir as mkdir3, readFile as readFile4, readdir as readdir4, rename as rename2, rm as rm2, writeFile as writeFile2 } from "node:fs/promises";
import { dirname as dirname3, join as join4, relative, resolve } from "node:path";
import { BUNDLED_SKILL_RANK as BUNDLED_SKILL_RANK2, isSkillName } from "@deepseek-ai/dsh-skill";
var MAX_SKILL_BODY_BYTES = 96 * 1024;
var USER_RANK = BUNDLED_SKILL_RANK2 - 1;
function isWithin(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || !rel.startsWith("..") && !rel.includes(":");
}
function unquote(value) {
  return value.trim().replace(/^["']|["']$/g, "");
}
function parseSkillDocument(text) {
  const src = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  if (!src.startsWith("---")) return { frontmatter: {}, body: text };
  const end = src.indexOf("\n---", 3);
  if (end < 0) return { frontmatter: {}, body: text };
  const frontmatter = {};
  for (const line of src.slice(3, end).split("\n")) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (match?.[1] !== void 0 && match[2] !== void 0) frontmatter[match[1]] = unquote(match[2]);
  }
  return { frontmatter, body: src.slice(end + 4) };
}
function falseValue(value) {
  return value !== void 0 && /^(false|0|no|off)$/i.test(value);
}
function candidate(path, frontmatter) {
  const name2 = frontmatter.name ?? "";
  return {
    name: name2,
    description: frontmatter.description ?? "",
    ...frontmatter.whenToUse ? { whenToUse: frontmatter.whenToUse } : {},
    invocation: {
      modelInvocable: !frontmatter["disable-model-invocation"] || falseValue(frontmatter["disable-model-invocation"]),
      userInvocable: !falseValue(frontmatter["user-invocable"])
    },
    provider: "ant-sword-user-skills",
    source: "user-dsh",
    rank: USER_RANK,
    resourceBase: { kind: "directory", path: dirname3(path) },
    locator: path,
    path
  };
}
async function scan(root) {
  const result = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir4(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join4(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name === "SKILL.md") {
        try {
          const parsed = parseSkillDocument(await readFile4(path, "utf8"));
          if (isSkillName(parsed.frontmatter.name ?? "")) result.push(candidate(path, parsed.frontmatter));
        } catch {
        }
      }
    }
  }
  await walk(root);
  return result;
}
var SkillCatalog = class {
  constructor(root) {
    this.root = root;
  }
  root;
  async list() {
    const bundled = await skillProvider.list({});
    const base = "candidates" in bundled ? [...bundled.candidates] : [...bundled];
    const all = [...base, ...await scan(this.root)];
    const winners = /* @__PURE__ */ new Map();
    for (const item of all) {
      const previous = winners.get(item.name);
      if (previous === void 0 || item.rank < previous.rank) winners.set(item.name, item);
    }
    return [...winners.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  async get(name2) {
    const selected = (await this.list()).find((item) => item.name === name2);
    if (selected === void 0) return void 0;
    if (typeof selected.locator !== "string") return skillProvider.get(selected, {});
    try {
      const parsed = parseSkillDocument(await readFile4(selected.locator, "utf8"));
      return { ...selected, content: parsed.body.trim() };
    } catch {
      return void 0;
    }
  }
  async write(input) {
    if (!isSkillName(input.name)) throw new TypeError("invalid skill name");
    if (!isWithin(this.root, join4(this.root, input.name))) throw new TypeError("skill path escapes user root");
    if (Buffer.byteLength(input.content, "utf8") > MAX_SKILL_BODY_BYTES || input.content.includes("\0")) throw new TypeError("invalid skill content");
    if (input.description.length > 1024 || input.whenToUse !== void 0 && input.whenToUse.length > 2048) throw new TypeError("invalid skill metadata");
    const directory = resolve(this.root, input.name);
    const target = join4(directory, "SKILL.md");
    if (!isWithin(this.root, target) || dirname3(directory) !== resolve(this.root)) throw new TypeError("skill path escapes user root");
    await mkdir3(directory, { recursive: true });
    const temporary = join4(directory, `.SKILL.${process.pid}.${Date.now()}.tmp`);
    const text = ["---", `name: ${JSON.stringify(input.name)}`, `description: ${JSON.stringify(input.description)}`, ...input.whenToUse ? [`whenToUse: ${JSON.stringify(input.whenToUse)}`] : [], `user-invocable: ${input.userInvocable}`, `disable-model-invocation: ${!input.modelInvocable}`, "---", "", input.content, ""].join("\n");
    try {
      await writeFile2(temporary, text, { encoding: "utf8", mode: 384 });
      await rename2(temporary, target);
    } catch (error) {
      await rm2(temporary, { force: true }).catch(() => void 0);
      throw error;
    }
  }
  async delete(name2) {
    if (!isSkillName(name2)) throw new TypeError("invalid skill name");
    const directory = resolve(this.root, name2);
    if (!isWithin(this.root, directory) || dirname3(directory) !== resolve(this.root)) throw new TypeError("skill path escapes user root");
    await rm2(directory, { recursive: true, force: true });
  }
};

// src/skill-runtime.ts
var MAX_BODY_BYTES3 = 128 * 1024;
function sendJson3(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}
async function readBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const part = Buffer.from(chunk);
    bytes += part.byteLength;
    if (bytes > MAX_BODY_BYTES3) throw new TypeError("skill request body is too large");
    chunks.push(part);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new TypeError("skill request must be an object");
  return parsed;
}
var SkillsReconciler = class {
  name = "skills";
  disabled = /* @__PURE__ */ new Set();
  invalidate = () => void 0;
  catalog;
  constructor(root = join5(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".dsh", "skills")) {
    this.catalog = new SkillCatalog(root);
  }
  provider(control) {
    this.invalidate = control.invalidate;
    return { name: skillProvider.name, list: async () => ({ candidates: (await this.catalog.list()).filter((candidate2) => !this.disabled.has(candidate2.name)), complete: true }), get: async (candidate2, options) => {
      if (this.disabled.has(candidate2.name)) return void 0;
      const loaded = await this.catalog.get(candidate2.name);
      return loaded ?? await skillProvider.get(candidate2, options);
    } };
  }
  prepare(next, _previousConfig) {
    const previous = this.disabled;
    const desired = new Set(next.disabledSkills);
    return { commit: () => {
      this.disabled = desired;
      this.invalidate();
    }, rollback: () => {
      this.disabled = previous;
      this.invalidate();
    } };
  }
  refresh() {
    this.invalidate();
  }
};
function applySkillApi(ctx, reconciler, root = join5(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".dsh", "skills")) {
  const catalog = new SkillCatalog(root);
  ctx.webServer.register({ kind: "exact", path: "/ant-sword/skills/list", handler: async (req, res) => {
    if (req.method !== "GET") {
      sendJson3(res, 405, { error: "method-not-allowed" });
      return;
    }
    try {
      const skills = await catalog.list();
      sendJson3(res, 200, { skills: skills.map((skill) => ({ ...skill, userOwned: skill.source === "user-dsh" })) });
    } catch (error) {
      sendJson3(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  } });
  ctx.webServer.register({ kind: "exact", path: "/ant-sword/skills/detail", handler: async (req, res) => {
    if (req.method !== "GET") {
      sendJson3(res, 405, { error: "method-not-allowed" });
      return;
    }
    try {
      const name2 = new URL(req.url ?? "", "http://localhost").searchParams.get("name");
      if (name2 === null || !isSkillName2(name2)) throw new TypeError("invalid skill name");
      const skill = await catalog.get(name2);
      if (skill === void 0) {
        sendJson3(res, 404, { error: "skill-not-found" });
        return;
      }
      ;
      sendJson3(res, 200, { skill });
    } catch (error) {
      sendJson3(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  } });
  ctx.webServer.register({ kind: "exact", path: "/ant-sword/skills/upsert", handler: async (req, res) => {
    if (req.method !== "POST") {
      sendJson3(res, 405, { error: "method-not-allowed" });
      return;
    }
    try {
      const body = await readBody(req);
      const allowed = ["name", "description", "whenToUse", "modelInvocable", "userInvocable", "content"];
      if (Object.keys(body).some((key) => !allowed.includes(key))) throw new TypeError("unsupported skill field");
      if (typeof body.name !== "string" || !isSkillName2(body.name) || typeof body.description !== "string" || typeof body.modelInvocable !== "boolean" || typeof body.userInvocable !== "boolean" || typeof body.content !== "string") throw new TypeError("invalid skill payload");
      if (body.whenToUse !== void 0 && typeof body.whenToUse !== "string") throw new TypeError("invalid skill whenToUse");
      await catalog.write({ name: body.name, description: body.description, ...typeof body.whenToUse === "string" ? { whenToUse: body.whenToUse } : {}, modelInvocable: body.modelInvocable, userInvocable: body.userInvocable, content: body.content });
      reconciler.refresh();
      sendJson3(res, 200, { name: body.name });
    } catch (error) {
      sendJson3(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  } });
  ctx.webServer.register({ kind: "exact", path: "/ant-sword/skills/delete", handler: async (req, res) => {
    if (req.method !== "POST") {
      sendJson3(res, 405, { error: "method-not-allowed" });
      return;
    }
    try {
      const body = await readBody(req);
      if (Object.keys(body).some((key) => key !== "name") || typeof body.name !== "string" || !isSkillName2(body.name)) throw new TypeError("invalid skill name");
      await catalog.delete(body.name);
      reconciler.refresh();
      sendJson3(res, 200, { name: body.name, fallback: await catalog.get(body.name) !== void 0 });
    } catch (error) {
      sendJson3(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  } });
}

// src/dynamic-runtime.ts
function applyDynamicRuntime(ctx, mcpServers, pentestswarmApiKey, skillsReconciler = new SkillsReconciler()) {
  const base = {
    mcpServers: mcpServers.map((server) => ({ ...server })),
    disabledSkills: [],
    rules: [],
    thinkingPolicies: [],
    thinkingFallbacks: []
  };
  const scope = ctx.settings.register(
    settingsNamespace2(ANT_SWORD_SETTINGS_NAMESPACE),
    AntSwordRuntimeConfigSchema,
    { base, applies: "live", validate: validateRuntimeConfig }
  );
  const mcp = new McpReconciler(ctx, pentestswarmApiKey);
  const controller = new RuntimeController(scope, [mcp, skillsReconciler, new RulesReconciler(ctx)]);
  const thinking = new ThinkingPolicyRuntime(ctx, controller);
  const stopThinking = thinking.start();
  let capabilityGeneration = controller.snapshot().generation;
  const stopCapabilityRefresh = controller.subscribe((snapshot) => {
    if (snapshot.generation === capabilityGeneration) return;
    capabilityGeneration = snapshot.generation;
    thinking.clearCapabilities();
  });
  const stop = controller.start();
  ctx.effect(() => async () => {
    stopCapabilityRefresh();
    stopThinking();
    await stop();
  }, "ant-sword-runtime.controller");
  return { controller, mcp, thinking };
}

// src/pi-ai-reasoning.ts
import { settingsNamespace as settingsNamespace3 } from "@deepseek-ai/dsh-settings";
var PI_AI_SETTINGS_NAMESPACE = "llm-pi-ai";
var REASONING_EFFORTS_BY_API = {
  // OpenAI Responses: minimal/low/medium/high — the effort enum the API defines
  // (no xhigh/max; those are not Responses values).
  "openai-responses": { off: null, minimal: "minimal", low: "low", medium: "medium", high: "high" },
  // Anthropic Messages (adaptive thinking): the full effort ladder. `max` is
  // accepted by every adaptive-thinking Claude model; `xhigh` by the newest.
  // Custom Anthropic-compatible relays (GLM/Kimi/etc.) expose the same ladder,
  // so offer it and let dispatch send the chosen effort verbatim. Requires
  // forceAdaptiveThinking (installPiAiAdaptiveThinking) so these are real
  // effort levels, not budget-clamped down to `high`.
  "anthropic-messages": { off: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
  // OpenAI Chat Completions reasoning models: low/medium/high.
  "openai-completions": { off: null, low: "low", medium: "medium", high: "high" }
};
var ADAPTIVE_THINKING_APIS = /* @__PURE__ */ new Set(["anthropic-messages"]);
var SUPERSEDED_DEFAULTS_BY_API = {
  // rc.21 anthropic-messages default (before the adaptive xhigh/max ladder).
  "anthropic-messages": [{ off: null, low: "low", medium: "medium", high: "high" }]
};
function effortsEqual(a, b) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => key in b && a[key] === b[key]);
}
function isSupersededDefault(api, current) {
  return (SUPERSEDED_DEFAULTS_BY_API[api] ?? []).some((old) => effortsEqual(old, current));
}
function fillReasoningEfforts(providers) {
  let changed = 0;
  const next = {};
  for (const [routeId, route] of Object.entries(providers)) {
    const efforts = route.api === void 0 ? void 0 : REASONING_EFFORTS_BY_API[route.api];
    const models = route.models;
    if (efforts === void 0 || models === void 0 || models.length === 0) {
      next[routeId] = route;
      continue;
    }
    const nextModels = models.map((model) => {
      const declared = model.reasoningEfforts;
      if (declared === void 0) {
        changed += 1;
        return { ...model, reasoningEfforts: { ...efforts } };
      }
      if (declared !== false && isSupersededDefault(route.api, declared) && !effortsEqual(declared, efforts)) {
        changed += 1;
        return { ...model, reasoningEfforts: { ...efforts } };
      }
      return model;
    });
    next[routeId] = { ...route, models: nextModels };
  }
  return changed === 0 ? void 0 : { providers: next, changed };
}
async function reconcilePiAiReasoning(ctx, attempts = 20, delayMs = 250) {
  const ns = settingsNamespace3(PI_AI_SETTINGS_NAMESPACE);
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    const current = ctx.settings.get(ns);
    const providers = current?.providers;
    if (providers !== void 0 && Object.keys(providers).length > 0) {
      const result = fillReasoningEfforts(providers);
      if (result === void 0) return 0;
      await ctx.settings.update(ns, { providers: result.providers });
      return result.changed;
    }
    if (attempt < attempts - 1) await new Promise((resolve2) => setTimeout(resolve2, delayMs));
  }
  return 0;
}
function installPiAiAdaptiveThinking(ctx, adaptiveApis = ADAPTIVE_THINKING_APIS) {
  const llm = ctx.llm;
  const original = llm.resolveModelInfoFor;
  if (typeof original !== "function") return () => void 0;
  const patchedAdapters = /* @__PURE__ */ new WeakSet();
  const restores = [];
  function patchAdapter(adapter) {
    if (typeof adapter.modelOf !== "function" || patchedAdapters.has(adapter)) return;
    patchedAdapters.add(adapter);
    const originalModelOf = adapter.modelOf.bind(adapter);
    const patchedModelOf = (snapshot, provider, model) => {
      const resolved = originalModelOf(snapshot, provider, model);
      if (resolved.api === void 0 || !adaptiveApis.has(resolved.api)) return resolved;
      if (resolved.reasoning !== true) return resolved;
      if (resolved.compat?.forceAdaptiveThinking === true) return resolved;
      return { ...resolved, compat: { ...resolved.compat, forceAdaptiveThinking: true } };
    };
    Object.defineProperty(adapter, "modelOf", { value: patchedModelOf, writable: true, configurable: true });
    restores.push(() => {
      const current = adapter.modelOf;
      if (current === patchedModelOf) {
        Object.defineProperty(adapter, "modelOf", { value: originalModelOf, writable: true, configurable: true });
      }
    });
  }
  const wrapped = async function(registration, model, signal) {
    if (registration?.adapter !== void 0) patchAdapter(registration.adapter);
    return original.call(this, registration, model, signal);
  };
  Object.defineProperty(llm, "resolveModelInfoFor", { value: wrapped, writable: true, configurable: true });
  return () => {
    if (llm.resolveModelInfoFor === wrapped) {
      Object.defineProperty(llm, "resolveModelInfoFor", { value: original, writable: true, configurable: true });
    }
    for (const restore of restores) restore();
  };
}

// src/index.ts
var name = "ant-sword-harness";
var inject = ["skills", "sessions", "storageDomain", "commands", "tools", "agents", "llm", "webServer", "subprocess", "settings", "systemPrompt"];
var Config = z5.object({
  autoLoop: AutoLoopConfigSchema,
  mcpServers: z5.array(McpServerSchema).description("\u5185\u5D4C\u6E17\u900F MCP \u670D\u52A1\u5668\u5217\u8868\uFF1B\u6BCF\u53F0\u53EF\u7528 enabled \u5355\u72EC\u542F\u505C\uFF0C\u4F20\u8F93/\u547D\u4EE4/\u5730\u5740\u5747\u53EF\u6539\u3002"),
  pentestswarmApiKey: z5.string().role("secret").description("Pentest Swarm \u7F16\u6392\u5668 API key\uFF0C\u4EC5\u6CE8\u5165\u8BE5\u670D\u52A1\u5668\u7684 env\u3002"),
  syncRedTeamPreset: z5.boolean()
});
function apply(ctx, config) {
  const skillsReconciler = new SkillsReconciler();
  ctx.skills.registerProvider((control) => skillsReconciler.provider(control));
  applyAutoLoop(ctx, config.autoLoop ?? {});
  const mcpServers = config.mcpServers === void 0 || config.mcpServers.length === 0 ? DEFAULT_MCP_SERVERS : config.mcpServers;
  const runtime = applyDynamicRuntime(ctx, mcpServers, config.pentestswarmApiKey, skillsReconciler);
  applyRuntimeStatus(
    ctx,
    () => runtime.controller.snapshot().applied.mcpServers,
    (serverName) => runtime.mcp.reload(serverName),
    (serverName) => runtime.mcp.probe(serverName),
    (serverName) => runtime.mcp.isMounted(serverName)
  );
  applyRuntimeConfigApi(ctx, runtime.controller);
  applyThinkingPolicyApi(ctx, runtime.thinking);
  applyInstallApi(ctx);
  applySkillApi(ctx, skillsReconciler);
  void reconcilePiAiReasoning(ctx).catch(() => void 0);
  const stopAdaptive = installPiAiAdaptiveThinking(ctx);
  ctx.effect(() => stopAdaptive, "ant-sword-runtime.pi-ai-adaptive-thinking");
  if (config.syncRedTeamPreset ?? true) {
    void syncRedTeamPreset().catch(() => void 0);
    void syncRedTeamAutoPreset().catch(() => void 0);
  }
}
export {
  Config,
  apply,
  inject,
  name
};
