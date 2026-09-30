// src/index.ts
import z6 from "@deepseek-ai/schemastery";

// src/auto/blackboard.ts
import { randomBytes } from "node:crypto";
import { Service } from "@deepseek-ai/cordis";

// src/auto/domain.ts
import z from "zod";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
var nodeSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  generation: z.number().int().nonnegative().optional(),
  kind: z.enum(["fact", "intent", "hint", "goal"]),
  label: z.string(),
  detail: z.string().optional(),
  parentId: z.string().optional(),
  status: z.enum(["open", "claimed", "done", "abandoned"]).optional(),
  claim: z.object({ owner: z.string(), leaseUntil: z.number().int().nonnegative() }).optional(),
  time: z.number(),
  cycle: z.number()
});
var runStateSchema = z.object({
  sessionId: z.string(),
  generation: z.number().int().nonnegative().optional(),
  cycle: z.number().int().nonnegative(),
  paused: z.boolean(),
  complete: z.boolean(),
  startedAt: z.number().int().nonnegative()
});
var blackboardDomain = defineDomain({
  name: "ant_sword_blackboard",
  version: 1,
  tables: {
    nodes: domainTable(nodeSchema),
    // Additive under v1: DSH 0.2 JSON storage reads a missing table as empty,
    // preserving existing node records.
    run_states: domainTable(runStateSchema)
  }
});

// src/auto/blackboard.ts
var BOARD_CHANGE = "board/change";
function newNodeId() {
  return randomBytes(8).toString("hex");
}
var DEFAULT_CLAIM_LEASE_MS = 10 * 60 * 1e3;
function withIntentStatus(node, status, claim) {
  const { claim: _previousClaim, ...withoutClaim } = node;
  return { ...withoutClaim, status, ...claim === void 0 ? {} : { claim } };
}
var BlackboardService = class _BlackboardService extends Service {
  static inject = ["storageDomain"];
  domainReady;
  /** Serializes validation with writes, including concurrent same-session calls. */
  mutationTail = Promise.resolve();
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
  static sessionId(session) {
    if (typeof session.id !== "string" || session.id.length === 0) {
      throw new Error("blackboard requires a session with a nonempty id");
    }
    return session.id;
  }
  enqueue(operation) {
    const pending = this.mutationTail.then(operation);
    this.mutationTail = pending.then(() => void 0, () => void 0);
    return pending;
  }
  stateFrom(domain, sessionId) {
    return domain.table("run_states").get(sessionId) ?? {
      sessionId,
      generation: 0,
      cycle: 0,
      paused: false,
      complete: false,
      startedAt: 0
    };
  }
  nodesFrom(domain, sessionId) {
    const generation = this.stateFrom(domain, sessionId).generation ?? 0;
    const nodes = [];
    for (const [, node] of domain.table("nodes").entries()) {
      if (node.sessionId === sessionId && (node.generation ?? 0) === generation) nodes.push(node);
    }
    return nodes.sort((a, b) => a.time - b.time);
  }
  snapshotFrom(domain, sessionId) {
    const state = this.stateFrom(domain, sessionId);
    return {
      nodes: this.nodesFrom(domain, sessionId),
      cycle: state.cycle,
      paused: state.paused,
      complete: state.complete
    };
  }
  publish(session, domain, change) {
    session.append(BOARD_CHANGE, change);
    this.ctx.emit("board/changed", session, this.snapshotFrom(domain, session.id));
  }
  /** All nodes for one session, creation order. */
  async nodes(session) {
    const sessionId = _BlackboardService.sessionId(session);
    await this.mutationTail;
    const domain = await this.domainReady;
    return this.nodesFrom(domain, sessionId);
  }
  /** Durable run state; startedAt is zero until the first cycle begins. */
  async runState(session) {
    const sessionId = _BlackboardService.sessionId(session);
    await this.mutationTail;
    const domain = await this.domainReady;
    return this.stateFrom(domain, sessionId);
  }
  /** A consistent point-in-time read of one session's board. */
  async snapshot(session) {
    const sessionId = _BlackboardService.sessionId(session);
    await this.mutationTail;
    const domain = await this.domainReady;
    return this.snapshotFrom(domain, sessionId);
  }
  /** Add one graph node after validating goal uniqueness and parent ownership. */
  async add(session, input) {
    const sessionId = _BlackboardService.sessionId(session);
    return this.enqueue(async () => {
      const domain = await this.domainReady;
      const table = domain.table("nodes");
      const generation = this.stateFrom(domain, sessionId).generation ?? 0;
      if (!["fact", "intent", "hint", "goal"].includes(input.kind)) {
        throw new Error(`invalid blackboard node kind: ${String(input.kind)}`);
      }
      if (typeof input.label !== "string" || input.label.trim().length === 0) {
        throw new Error("blackboard node label must be nonempty");
      }
      if (input.detail !== void 0 && typeof input.detail !== "string") {
        throw new Error("blackboard node detail must be a string");
      }
      if (input.parentId !== void 0 && (typeof input.parentId !== "string" || input.parentId.length === 0)) {
        throw new Error("blackboard parent id must be nonempty");
      }
      if (input.kind === "goal") {
        if (input.parentId !== void 0) throw new Error("blackboard goal cannot have a parent");
        if (this.nodesFrom(domain, sessionId).some((node2) => node2.kind === "goal")) {
          throw new Error(`blackboard session '${sessionId}' already has a goal`);
        }
      }
      if (input.parentId !== void 0) {
        const parent = table.get(input.parentId);
        if (parent === void 0 || parent.sessionId !== sessionId || (parent.generation ?? 0) !== generation) {
          throw new Error(`blackboard parent '${input.parentId}' does not belong to session '${sessionId}'`);
        }
      }
      if (input.kind === "intent") {
        if (input.status !== void 0 && input.status !== "open") {
          throw new Error("new blackboard intent must start open");
        }
      } else if (input.status !== void 0) {
        throw new Error(`blackboard ${input.kind} cannot have an intent status`);
      }
      let id = newNodeId();
      while (table.get(id) !== void 0) id = newNodeId();
      const node = {
        id,
        sessionId,
        ...generation > 0 ? { generation } : {},
        kind: input.kind,
        label: input.label,
        ...input.detail !== void 0 ? { detail: input.detail } : {},
        ...input.parentId !== void 0 ? { parentId: input.parentId } : {},
        ...input.kind === "intent" ? { status: "open" } : {},
        time: Date.now(),
        cycle: this.stateFrom(domain, sessionId).cycle
      };
      await table.put(node.id, node);
      this.publish(session, domain, { op: "add", node });
      return node;
    });
  }
  /** Transition an Intent: open -> claimed -> done or abandoned. */
  async setStatus(session, nodeId, status, options) {
    const sessionId = _BlackboardService.sessionId(session);
    await this.enqueue(async () => {
      const domain = await this.domainReady;
      const table = domain.table("nodes");
      const node = table.get(nodeId);
      if (node === void 0 || node.sessionId !== sessionId || (node.generation ?? 0) !== (this.stateFrom(domain, sessionId).generation ?? 0)) {
        throw new Error(`blackboard intent '${nodeId}' does not belong to session '${sessionId}'`);
      }
      if (node.kind !== "intent") throw new Error(`blackboard node '${nodeId}' is not an intent`);
      const current = node.status ?? "open";
      const valid = current === "open" && status === "claimed" || current === "claimed" && (status === "done" || status === "abandoned");
      if (!valid) throw new Error(`invalid blackboard intent transition: ${current} -> ${status}`);
      if (status !== "claimed" && options !== void 0) {
        throw new Error("blackboard claim options require status claimed");
      }
      let claim;
      if (status === "claimed") {
        const owner = options?.owner ?? sessionId;
        const now = options?.now ?? Date.now();
        const leaseMs = options?.leaseMs ?? DEFAULT_CLAIM_LEASE_MS;
        if (typeof owner !== "string" || owner.length === 0) throw new Error("blackboard claim owner must be nonempty");
        if (!Number.isSafeInteger(now) || now < 0) throw new Error("blackboard claim time must be a nonnegative safe integer");
        if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0 || !Number.isSafeInteger(now + leaseMs)) {
          throw new Error("blackboard claim lease must fit a positive safe integer duration");
        }
        claim = { owner, leaseUntil: now + leaseMs };
      }
      await table.update(nodeId, (value) => withIntentStatus(value, status, claim));
      this.publish(session, domain, {
        op: "status",
        nodeId,
        status,
        ...claim === void 0 ? {} : { claim }
      });
    });
  }
  async recover(session, expired) {
    const sessionId = _BlackboardService.sessionId(session);
    return this.enqueue(async () => {
      const domain = await this.domainReady;
      const table = domain.table("nodes");
      const claimed = this.nodesFrom(domain, sessionId).filter((node) => node.kind === "intent" && node.status === "claimed" && expired(node));
      for (const node of claimed) {
        await table.update(node.id, (value) => withIntentStatus(value, "open"));
        session.append(BOARD_CHANGE, { op: "status", nodeId: node.id, status: "open" });
      }
      if (claimed.length > 0) this.ctx.emit("board/changed", session, this.snapshotFrom(domain, sessionId));
      return claimed.length;
    });
  }
  /** Explicitly reopen all claims left in flight after a confirmed restart. */
  async recoverClaimed(session) {
    return this.recover(session, () => true);
  }
  /** Reopen only expired claims; older claimed nodes without a lease are stale. */
  async recoverExpiredClaims(session, now = Date.now()) {
    if (!Number.isSafeInteger(now) || now < 0) throw new Error("blackboard recovery time must be a nonnegative safe integer");
    return this.recover(session, (node) => (node.claim?.leaseUntil ?? 0) <= now);
  }
  /** Archive the current run by advancing its generation in one durable write. */
  async resetRun(session) {
    const sessionId = _BlackboardService.sessionId(session);
    return this.enqueue(async () => {
      const domain = await this.domainReady;
      const current = this.stateFrom(domain, sessionId);
      const generation = (current.generation ?? 0) + 1;
      if (!Number.isSafeInteger(generation)) throw new Error("blackboard generation exceeded the safe integer range");
      await domain.table("run_states").put(sessionId, {
        sessionId,
        generation,
        cycle: 0,
        paused: false,
        complete: false,
        startedAt: 0
      });
      this.publish(session, domain, { op: "reset", generation });
      return generation;
    });
  }
  /** Start the wall-clock budget once, before the first admitted Goal round. */
  async startRun(session, now = Date.now()) {
    const sessionId = _BlackboardService.sessionId(session);
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error("blackboard run start must be a positive safe integer time");
    return this.enqueue(async () => {
      const domain = await this.domainReady;
      const current = this.stateFrom(domain, sessionId);
      if (current.startedAt !== 0) return current.startedAt;
      await domain.table("run_states").put(sessionId, { ...current, startedAt: now });
      return now;
    });
  }
  /** Advance to a scheduler-owned cycle without incrementing twice. */
  async advanceToCycle(session, target) {
    const sessionId = _BlackboardService.sessionId(session);
    if (!Number.isSafeInteger(target) || target < 0) throw new Error("blackboard cycle must be a nonnegative safe integer");
    return this.enqueue(async () => {
      const domain = await this.domainReady;
      const current = this.stateFrom(domain, sessionId);
      if (target <= current.cycle) return current.cycle;
      await domain.table("run_states").put(sessionId, {
        ...current,
        cycle: target,
        startedAt: current.startedAt || Date.now()
      });
      this.publish(session, domain, { op: "cycle", cycle: target });
      return target;
    });
  }
  /** Advance the OODA cycle by one. */
  async nextCycle(session) {
    const sessionId = _BlackboardService.sessionId(session);
    return this.enqueue(async () => {
      const domain = await this.domainReady;
      const current = this.stateFrom(domain, sessionId);
      if (!Number.isSafeInteger(current.cycle + 1)) throw new Error("blackboard cycle exceeded the safe integer range");
      const next = current.cycle + 1;
      await domain.table("run_states").put(sessionId, {
        ...current,
        cycle: next,
        startedAt: current.startedAt || Date.now()
      });
      this.publish(session, domain, { op: "cycle", cycle: next });
      return next;
    });
  }
  /** Persist the operator pause flag. Repeating the same value is a no-op. */
  async setPaused(session, paused) {
    const sessionId = _BlackboardService.sessionId(session);
    if (typeof paused !== "boolean") throw new Error("blackboard paused flag must be a boolean");
    await this.enqueue(async () => {
      const domain = await this.domainReady;
      const current = this.stateFrom(domain, sessionId);
      if (current.paused === paused) return;
      await domain.table("run_states").put(sessionId, { ...current, paused });
      this.publish(session, domain, { op: "paused", paused });
    });
  }
  async isPaused(session) {
    return (await this.runState(session)).paused;
  }
  /** Persist completion. Repeated calls remain idempotent across restarts. */
  async markComplete(session) {
    const sessionId = _BlackboardService.sessionId(session);
    await this.enqueue(async () => {
      const domain = await this.domainReady;
      const current = this.stateFrom(domain, sessionId);
      if (current.complete) return;
      await domain.table("run_states").put(sessionId, { ...current, complete: true });
      this.publish(session, domain, { op: "complete", complete: true });
    });
  }
  async isComplete(session) {
    return (await this.runState(session)).complete;
  }
};
function applyBoardProjection(state, event) {
  if (event.type !== BOARD_CHANGE) return state;
  const data = event.data;
  const current = state ?? { nodes: [], cycle: 0, paused: false, complete: false };
  if (data.op === "add") return { ...current, nodes: [...current.nodes, data.node] };
  if (data.op === "reset") return { nodes: [], cycle: 0, paused: false, complete: false };
  if (data.op === "status") {
    return {
      ...current,
      nodes: current.nodes.map((node) => node.id === data.nodeId ? withIntentStatus(node, data.status, data.claim) : node)
    };
  }
  if (data.op === "cycle") return { ...current, cycle: data.cycle };
  if (data.op === "paused") return { ...current, paused: data.paused };
  if (data.op === "complete") return { ...current, complete: data.complete };
  return state;
}

// src/auto/loop.ts
import { Service as Service3 } from "@deepseek-ai/cordis";
import z2 from "@deepseek-ai/schemastery";
import { z as zod } from "zod";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { defineTool } from "@deepseek-ai/dsh-tools";

// src/auto/board-view.ts
function clip(value, maximum) {
  if (value.length <= maximum) return value;
  return `${value.slice(0, Math.max(0, maximum - 1))}\u2026`;
}
function line(node, evidenceChars) {
  const evidence = node.detail === void 0 ? "" : ` | evidence=${clip(JSON.stringify(node.detail), evidenceChars)}`;
  return `#${node.id} [${node.kind}${node.status === void 0 ? "" : `/${node.status}`}] (cycle ${node.cycle}) ${clip(node.label, 160)}${node.parentId === void 0 ? "" : ` <- ${node.parentId}`}${evidence}`;
}
function header(snapshot, budget) {
  const facts = snapshot.nodes.filter((node) => node.kind === "fact").length;
  const intents = snapshot.nodes.filter((node) => node.kind === "intent");
  const active = intents.filter((node) => node.status === "open" || node.status === "claimed").length;
  return `blackboard: ${snapshot.nodes.length} nodes, ${facts} Facts, ${active} active Intents, cycle ${snapshot.cycle}, paused=${snapshot.paused}, complete=${snapshot.complete}; context=${budget.contextTier}`;
}
function boundedLines(prefix, nodes, budget, pageStart) {
  const cap = Math.max(512, budget.boardChars);
  const lines = [...prefix];
  let used = lines.join("\n").length;
  let included = 0;
  for (const node of nodes) {
    const rendered = line(node, budget.evidenceChars);
    const remaining = cap - used - 220;
    if (remaining < 80 && included > 0) break;
    const next = clip(rendered, Math.max(80, remaining));
    lines.push(next);
    used += next.length + 1;
    included++;
  }
  const omitted = nodes.length - included;
  if (pageStart === void 0) {
    if (omitted > 0) lines.push(`${omitted} lower-priority node(s) omitted. Use board_read(cursor="0") for chronological pages or board_read(nodeId="ID") for full evidence.`);
  } else if (omitted > 0) {
    lines.push(`Next page: board_read(cursor="${pageStart + included}").`);
  }
  return {
    summary: clip(lines.join("\n"), cap),
    ...pageStart === void 0 || omitted === 0 ? {} : { nextCursor: String(pageStart + included) }
  };
}
function readBoard(snapshot, request, budget) {
  const cap = Math.max(512, budget.boardChars);
  const base = header(snapshot, budget);
  if (request.nodeId !== void 0) {
    const node = snapshot.nodes.find((item) => item.id === request.nodeId);
    if (node === void 0) throw new TypeError(`board node '${request.nodeId}' does not exist in this run`);
    const offset = request.detailOffset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0) throw new TypeError("detailOffset must be a nonnegative integer");
    const detail = node.detail ?? "";
    if (offset > detail.length) throw new TypeError("detailOffset exceeds node detail length");
    const { detail: _detail, ...nodeWithoutDetail } = node;
    const metadata = line(nodeWithoutDetail, 0);
    const room = Math.max(1, Math.min(budget.evidenceChars, cap - base.length - metadata.length - 150));
    const chunk = detail.slice(offset, offset + room);
    const next = offset + chunk.length;
    const suffix = next < detail.length ? `
Next detail chunk: board_read(nodeId="${node.id}", detailOffset=${next}).` : "";
    return {
      summary: clip(`${base}
${metadata}
Detail ${offset}-${next}/${detail.length}: ${chunk}${suffix}`, cap),
      ...next < detail.length ? { nextDetailOffset: next } : {}
    };
  }
  if (request.cursor !== void 0) {
    if (!/^(0|[1-9]\d*)$/.test(request.cursor)) throw new TypeError("cursor must be a decimal node offset");
    const offset = Number(request.cursor);
    if (!Number.isSafeInteger(offset) || offset > snapshot.nodes.length) throw new TypeError("cursor exceeds board length");
    return boundedLines([base, `Chronological page from node ${offset}/${snapshot.nodes.length}:`], snapshot.nodes.slice(offset), budget, offset);
  }
  const priority = (node) => {
    if (node.kind === "goal") return 0;
    if (node.kind === "intent" && node.status === "claimed") return 1;
    if (node.kind === "hint") return 2;
    if (node.kind === "intent" && node.status === "open") return 3;
    if (node.kind === "fact") return 4;
    return 5;
  };
  const sorted = snapshot.nodes.map((node, index) => ({ node, index })).sort((a, b) => priority(a.node) - priority(b.node) || b.index - a.index).map((item) => item.node);
  return boundedLines([base, "Priority view (goal, active work, hints, recent facts):"], sorted, budget);
}

// node_modules/.pnpm/@deepseek-ai+dsh-session@0._c9dee8deba3bd498ce58eb9c566c157f/node_modules/@deepseek-ai/dsh-session/lib/index.js
import { Service as Service2 } from "@deepseek-ai/cordis";
import { brandNumber, brandString } from "@deepseek-ai/dsh-brand";
import { assertNever, deepFreeze, snapshotJsonValue } from "@deepseek-ai/dsh-util-values";
import { scopeOf, scopeTarget } from "@deepseek-ai/dsh-scope";
import { callConfigEquals } from "@deepseek-ai/dsh-llm";
function SessionSeq(value) {
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) throw new TypeError(`SessionSeq must be a non-negative safe integer, got ${String(value)}`);
  return brandNumber(value);
}

// src/auto/preset.ts
var observations = /* @__PURE__ */ new WeakMap();
function isAutoPreset(agent) {
  const session = agent.session;
  let observed = observations.get(session);
  if (observed === void 0 || observed.scannedThrough > session.seq) {
    observed = { scannedThrough: 0, preset: session.header.agentPreset };
  }
  for (let seq = observed.scannedThrough; seq < session.seq; seq++) {
    const event = session.eventAt(SessionSeq(seq));
    if (event?.type === "agent-preset/selected" && typeof event.data?.agentPreset === "string") {
      observed.preset = event.data.agentPreset;
    }
  }
  observed.scannedThrough = session.seq;
  observations.set(session, observed);
  return observed.preset === "red-team-auto";
}

// src/auto/loop.ts
var COMPACT_PROFILE = {
  contextTier: "compact",
  reasoningMode: "balanced",
  boardChars: 2e3,
  evidenceChars: 500,
  lessonCount: 2
};
function reasoningGuidance(mode) {
  if (mode === "guided") return "Use one testable Intent at a time; observe each result before the next tool call.";
  if (mode === "deep") return "Compare competing hypotheses and prerequisite chains before selecting the next Intent.";
  return "Compare plausible routes briefly, then pursue the strongest evidence-producing Intent.";
}
function contextGuidance(tier) {
  if (tier === "compact") return "Keep one active Intent and short summaries. Use paged board and experience reads for older evidence.";
  if (tier === "wide") return "Track up to three plausible Intents with their prerequisite and evidence links.";
  return "Track up to two plausible Intents; retrieve full evidence on demand.";
}
function boardService(ctx) {
  const service = ctx.get("blackboard");
  if (service === void 0) throw new Error("blackboard service is not mounted");
  return service;
}
var AutoLoopConfigSchema = z2.object({
  enabled: z2.boolean(),
  maxCycles: z2.number(),
  stallThreshold: z2.number(),
  maxDurationMs: z2.number()
});
function resolveConfig(config) {
  const resolved = {
    enabled: config.enabled ?? true,
    maxCycles: config.maxCycles ?? 64,
    stallThreshold: config.stallThreshold ?? 3,
    maxDurationMs: config.maxDurationMs ?? 30 * 60 * 1e3
  };
  for (const [key, value] of [
    ["maxCycles", resolved.maxCycles],
    ["stallThreshold", resolved.stallThreshold],
    ["maxDurationMs", resolved.maxDurationMs]
  ]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${key} must be a positive safe integer`);
  }
  return resolved;
}
function hasCompletionEvidence(snapshot, factId) {
  return snapshot.nodes.some((node) => {
    if (node.kind !== "fact" || !node.detail?.trim() || factId !== void 0 && node.id !== factId) return false;
    const parent = snapshot.nodes.find((candidate2) => candidate2.id === node.parentId);
    return parent?.kind === "intent" && parent.status === "done";
  });
}
var AutoLoopService = class extends Service3 {
  static inject = ["blackboard", "goals"];
  constructor(ctx) {
    super(ctx, "autoLoop");
  }
  /** Pause the current DSH Goal, then update the board view. */
  async pause(agent) {
    const goal = this.ctx.goals.get(agent);
    if (goal === void 0) throw new Error("No active goal. Create one from a direct human task first.");
    if (goal.phase === "active") this.ctx.goals.pause(agent, { id: goal.id, revision: goal.revision });
    else if (goal.phase !== "paused") throw new Error(`Goal is ${goal.phase}; it cannot be paused.`);
    await this.ctx.blackboard.setPaused(agent.session, true);
  }
  /** Rearm the current DSH Goal; its round driver schedules the next turn. */
  async resume(agent) {
    const goal = this.ctx.goals.get(agent);
    if (goal === void 0) throw new Error("No goal to resume. Create one from a direct human task first.");
    if (goal.phase === "complete") throw new Error("Completed goals cannot be resumed.");
    if (goal.phase !== "active" || goal.activation !== "armed") {
      await this.ctx.blackboard.recoverExpiredClaims(agent.session);
      this.ctx.goals.resume(agent, { id: goal.id, revision: goal.revision });
    }
    await this.ctx.blackboard.setPaused(agent.session, false);
  }
  /** Persist a Hint and place it in the next admitted step without waking work. */
  async injectHint(agent, text) {
    await this.ctx.blackboard.add(agent.session, { kind: "hint", label: text });
    agent.inject(createUserMessage({
      content: [{ type: "text", text: `[auto-loop] Operator hint: ${text}
Absorb this into your next Observe/Orient pass and re-plan Intents accordingly.` }],
      source: { kind: "auto-loop" }
    }));
  }
};
function registerAutoCommand(ctx) {
  ctx.commands.register({
    name: "auto",
    description: "Control the autonomous loop: /auto pause | resume | hint <text> | status",
    input: { hint: "[pause | resume | hint <text> | status]" },
    handler: async (invocation) => {
      const agent = invocation.agent;
      const board = boardService(ctx);
      const loop = ctx.autoLoop;
      const arg = invocation.rawInput.trim();
      if (arg === "pause") {
        await loop.pause(agent);
        return { kind: "success", text: 'auto-loop: goal paused. Resume with "/auto resume".' };
      }
      if (arg === "resume") {
        await loop.resume(agent);
        return { kind: "success", text: "auto-loop: goal resumed; DSH Goal will schedule the next round." };
      }
      if (arg.startsWith("hint ")) {
        const text = arg.slice("hint ".length).trim();
        if (text.length === 0) return { kind: "error", text: 'auto-loop: "/auto hint <text>" needs hint text.' };
        await loop.injectHint(agent, text);
        return { kind: "success", text: `auto-loop: hint injected \u2014 ${text}` };
      }
      if (arg === "status") {
        const snap = await board.snapshot(agent.session);
        const goal = ctx.goals.get(agent);
        return {
          kind: "success",
          text: `auto-loop: cycle ${snap.cycle}, ${snap.nodes.length} node(s), paused=${snap.paused}, complete=${snap.complete}; goal=${goal?.phase ?? "none"}, activation=${goal?.activation ?? "none"}, rounds=${goal?.roundsStarted ?? 0}/${goal?.maxGoalRounds ?? 0}`
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
  ctx.systemPrompt.section({
    name: "ant-sword:auto-goal-budget",
    order: 95,
    text: ({ agent }) => agent !== void 0 && isAutoPreset(agent) ? `In Red Team (Auto), the first direct human task turn must create a DSH Goal with create_goal(objective, max_goal_rounds=${resolved.maxCycles}) before starting the board. DSH Goal controls automatic continuation. The board is a durable evidence graph, not a turn scheduler. After ${resolved.stallThreshold} equivalent attempts without new evidence, abandon that Intent and choose a different hypothesis. This run has a ${resolved.maxDurationMs} ms wall-clock budget from its first admitted goal round.` : ""
  });
  ctx.on("system-prompt/assemble", async (_assembly, context, next) => {
    const assembled = await next();
    const agent = context.agent;
    if (agent === void 0 || !isAutoPreset(agent)) return assembled;
    const provider = assembled.variables["provider"] ?? agent.options.provider;
    const model = assembled.variables["model"] ?? agent.options.model;
    const header2 = agent.session.requestHeader()?.config;
    const adaptation = ctx.get("modelAdaptation");
    const profile = adaptation === void 0 ? COMPACT_PROFILE : provider !== void 0 && model !== void 0 && (header2?.provider !== provider || header2.model !== model) ? await adaptation.forRoute(provider, model) : await adaptation.profile(agent);
    assembled.sections.push({
      name: "ant-sword:auto-context-guidance",
      text: `Autonomous context budget: ${profile.contextTier}. ${contextGuidance(profile.contextTier)}`,
      interpolate: false
    });
    return assembled;
  }, { global: true });
  const boardProjectionSchema = zod.union([
    zod.object({
      nodes: zod.array(zod.object({
        id: zod.string(),
        sessionId: zod.string(),
        generation: zod.number().int().nonnegative().optional(),
        kind: zod.enum(["fact", "intent", "hint", "goal"]),
        label: zod.string(),
        detail: zod.string().optional(),
        parentId: zod.string().optional(),
        status: zod.enum(["open", "claimed", "done", "abandoned"]).optional(),
        claim: zod.object({ owner: zod.string(), leaseUntil: zod.number() }).optional(),
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
      stateSchema: boardProjectionSchema,
      init: () => null,
      apply: applyBoardProjection,
      wire: { viewSchema: boardProjectionSchema, view: (state) => state },
      stateVersion: 1
    });
  });
  const board = () => boardService(ctx);
  const alignGoalCycle = async (agent) => {
    await mirrorTails.get(agent.session.id);
    const goal = ctx.goals.get(agent);
    if (goal !== void 0) await board().advanceToCycle(agent.session, goal.roundsStarted);
  };
  const restoreTails = /* @__PURE__ */ new Map();
  ctx.on("agent/created", ({ agent }) => {
    const restored = board().recoverClaimed(agent.session).then(() => void 0);
    restoreTails.set(agent.session.id, restored);
    void restored.catch((error) => {
      ctx.logger.warn(`auto-loop: failed to recover claimed Intents: ${String(error)}`);
    }).finally(() => {
      if (restoreTails.get(agent.session.id) === restored) restoreTails.delete(agent.session.id);
    });
    return void 0;
  });
  const mirrorTails = /* @__PURE__ */ new Map();
  ctx.on("goal/changed", ({ agent, change }) => {
    if (!isAutoPreset(agent)) return;
    const previous = mirrorTails.get(agent.session.id) ?? Promise.resolve();
    const current = previous.catch(() => void 0).then(async () => {
      if (change.operation === "create") {
        const [previousBoard, previousRun] = await Promise.all([
          board().snapshot(agent.session),
          board().runState(agent.session)
        ]);
        if (previousBoard.nodes.length > 0 || previousBoard.cycle > 0 || previousBoard.paused || previousBoard.complete || previousRun.startedAt > 0) {
          await board().resetRun(agent.session);
        }
      }
      if (change.operation === "resume") await board().recoverExpiredClaims(agent.session);
      const phase = change.goal?.phase;
      await board().setPaused(agent.session, phase === "paused" || phase === "blocked" || phase === void 0);
      if (phase === "complete") {
        const snapshot = await board().snapshot(agent.session);
        if (hasCompletionEvidence(snapshot)) await board().markComplete(agent.session);
        else ctx.logger.warn(`auto-loop: DSH Goal completed without linked board evidence in session "${agent.session.id}"`);
      }
    });
    mirrorTails.set(agent.session.id, current);
    void current.catch((error) => {
      ctx.logger.warn(`auto-loop: failed to mirror goal state: ${String(error)}`);
    }).finally(() => {
      if (mirrorTails.get(agent.session.id) === current) mirrorTails.delete(agent.session.id);
    });
  });
  ctx.on("tools/pre-execute", async (exec, next) => {
    const args = exec.arguments;
    if (exec.name !== "update_goal" || exec.agent === void 0 || !isAutoPreset(exec.agent) || typeof args !== "object" || args === null || Array.isArray(args) || args["action"] !== "complete") return next();
    await mirrorTails.get(exec.agent.session.id);
    const snapshot = await board().snapshot(exec.agent.session);
    if (!snapshot.nodes.some((node) => node.kind === "goal")) return next();
    if (!hasCompletionEvidence(snapshot)) {
      return { kind: "deny", reason: "Complete a linked Intent and record a detailed Fact before completing this Goal." };
    }
    return next();
  }, { global: true });
  ctx.on("agent/pre-step", async ({ agent, messages }, next) => {
    if (!isAutoPreset(agent) || messages.some((message) => message.source.kind === "user")) return next();
    const round = messages.find((message) => message.source.kind === "goal");
    if (round?.source.kind !== "goal") return next();
    await restoreTails.get(agent.session.id);
    await mirrorTails.get(agent.session.id);
    const goal = ctx.goals.get(agent);
    if (goal === void 0 || goal.phase !== "active" || round.source.goalId !== goal.id || round.source.revision !== goal.revision || round.source.round !== goal.roundsStarted + 1) return next();
    await board().recoverExpiredClaims(agent.session);
    await board().startRun(agent.session);
    const run = await board().runState(agent.session);
    if (Date.now() - run.startedAt < resolved.maxDurationMs) return next();
    ctx.goals.block(agent, { id: goal.id, revision: goal.revision }, {
      code: "time-limit",
      message: `Autonomous run exceeded its ${resolved.maxDurationMs} ms wall-clock budget.`
    });
    await board().setPaused(agent.session, true);
    return { kind: "reject" };
  });
  ctx.tools.register(defineTool({
    name: "board_write",
    description: "Write a node to the engagement blackboard (the shared Fact/Intent/Hint graph that drives this autonomous run). Write a `fact` for every confirmed, objective finding, with concrete evidence in `detail` and `parentId` pointing to the Intent that produced it. Write an `intent` for each direction of exploration you decide to pursue next. Write the single `goal` node once, at bootstrap, to fix the target state. Link each node to the node it derives from via parentId so the graph grows origin \u2192 goal.",
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
      await alignGoalCycle(exec.agent);
      if (args.kind === "goal" && ctx.goals.get(exec.agent) === void 0) {
        throw new Error("Create a DSH Goal from a direct human task before writing the board Goal");
      }
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
    description: "Read a bounded priority overview of the current blackboard at the start of each Observe pass. Use cursor for chronological pages or nodeId and detailOffset to inspect complete evidence in chunks.",
    parameters: {
      cursor: { type: "string", description: 'Decimal chronological node offset, starting at "0".' },
      nodeId: { type: "string", description: "Read one node and a chunk of its full detail." },
      detailOffset: { type: "integer", description: "Character offset into node detail; use with nodeId." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string", required: true },
          nextCursor: { type: "string" },
          nextDetailOffset: { type: "integer" }
        }
      },
      render: (_args, value) => [{ type: "text", text: value.summary }]
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error("board_read requires an owning agent session");
      await alignGoalCycle(exec.agent);
      const profile = await ctx.get("modelAdaptation")?.profile(exec.agent) ?? COMPACT_PROFILE;
      const preface = `Reasoning mode: ${profile.reasoningMode}. ${reasoningGuidance(profile.reasoningMode)}
`;
      const snap = await board().snapshot(exec.agent.session);
      const result = readBoard(snap, args, {
        contextTier: profile.contextTier,
        boardChars: Math.max(512, profile.boardChars - preface.length),
        evidenceChars: profile.evidenceChars
      });
      return {
        ...result,
        summary: `${preface}${result.summary}`
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
      await alignGoalCycle(exec.agent);
      await board().setStatus(exec.agent.session, args.nodeId, args.status);
      return { ok: true };
    }
  }));
  ctx.tools.register(defineTool({
    name: "board_complete",
    description: "Finish the current DSH Goal and mark the board complete. Reference a detailed Fact linked to a done Intent that verifies the whole objective.",
    parameters: {
      evidenceNodeId: { type: "string", required: true, description: "Id of an existing Fact node that proves the goal is met." },
      evidence: { type: "string", required: true, description: "Why the goal is met (flag, shell, access proof)." }
    },
    output: {
      schema: { type: "object", additionalProperties: false, properties: { ok: { type: "boolean", required: true } } },
      render: (_args, value) => [{ type: "text", text: value.ok ? "blackboard: goal marked complete \u2014 loop stops" : "blackboard: no-op" }]
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error("board_complete requires an owning agent session");
      if (!isAutoPreset(exec.agent)) throw new Error("board_complete is available only in red-team-auto");
      await alignGoalCycle(exec.agent);
      const goal = ctx.goals.get(exec.agent);
      if (goal === void 0) throw new Error("board_complete requires an active DSH Goal");
      const snapshot = await board().snapshot(exec.agent.session);
      if (!hasCompletionEvidence(snapshot, args.evidenceNodeId)) {
        throw new Error("board_complete requires a detailed Fact linked to a done Intent in this session");
      }
      if (snapshot.nodes.some((node) => node.kind === "fact" && node.label === "GOAL MET" && node.parentId === args.evidenceNodeId)) {
        return { ok: false };
      }
      if (goal.phase !== "complete") {
        ctx.goals.complete(exec.agent, { id: goal.id, revision: goal.revision });
      }
      await board().add(exec.agent.session, {
        kind: "fact",
        label: "GOAL MET",
        detail: args.evidence,
        parentId: args.evidenceNodeId
      });
      await board().markComplete(exec.agent.session);
      return { ok: true };
    }
  }));
}

// src/auto/experience.ts
import { createHash, randomUUID } from "node:crypto";
import { Service as Service4 } from "@deepseek-ai/cordis";
import { defineDomain as defineDomain2, domainTable as domainTable2 } from "@deepseek-ai/dsh-storage-domain";
import { defineTool as defineTool2, RUN_CODE_NAME } from "@deepseek-ai/dsh-tools";
import z3 from "zod";
var ATTEMPT_WINDOW_MS = 10 * 6e4;
var MAX_TEXT = 1500;
var DEFAULT_RECALL = 5;
var MAX_RECALL = 8;
var DEFAULT_TOOL_RECALL = 2;
var DEFAULT_SUMMARY_CHARS = 2e3;
var DEFAULT_EXCERPT_CHARS = 500;
var MAX_SUMMARY_CHARS = 12e3;
function clampBudget(value, fallback, minimum, maximum) {
  return value !== void 0 && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, Math.trunc(value))) : fallback;
}
async function budgetFor(ctx, agent) {
  const adaptation = ctx.get("modelAdaptation");
  const profile = await adaptation?.profile(agent);
  return {
    lessonCount: clampBudget(profile?.lessonCount, DEFAULT_TOOL_RECALL, 1, MAX_RECALL),
    summaryChars: clampBudget(profile?.boardChars, DEFAULT_SUMMARY_CHARS, 512, MAX_SUMMARY_CHARS),
    excerptChars: clampBudget(profile?.evidenceChars, DEFAULT_EXCERPT_CHARS, 80, MAX_TEXT * 2)
  };
}
function clip2(value, maximum) {
  return value.length <= maximum ? value : `${value.slice(0, Math.max(0, maximum - 1))}\u2026`;
}
var attemptSchema = z3.object({
  id: z3.string(),
  sessionId: z3.string(),
  intentId: z3.string().optional(),
  rootCallId: z3.string(),
  toolName: z3.string(),
  actionHash: z3.string(),
  resultHash: z3.string(),
  outcome: z3.enum(["success", "transient", "missing-capability", "missing-prerequisite", "error"]),
  errorCode: z3.string().optional(),
  time: z3.number()
});
var lessonSchema = z3.object({
  id: z3.string(),
  situation: z3.string(),
  strategy: z3.string(),
  status: z3.enum(["candidate", "validated", "avoid"]),
  evaluations: z3.array(z3.object({
    sessionId: z3.string(),
    result: z3.enum(["worked", "failed"]),
    evidenceNodeId: z3.string(),
    time: z3.number()
  })),
  updatedAt: z3.number()
});
var experienceDomain = defineDomain2({
  name: "ant_sword_experience",
  version: 1,
  tables: {
    attempts: domainTable2(attemptSchema),
    lessons: domainTable2(lessonSchema)
  }
});
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}
function abstractLessonText(input) {
  const text = input.trim().slice(0, MAX_TEXT).replace(/\bhttps?:\/\/[^\s)\]]+/gi, "TARGET_URL").replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "TARGET_IP").replace(/\b[A-Fa-f0-9]{32,}\b/g, "TOKEN").replace(/\b[A-Za-z0-9+/=_-]{48,}\b/g, "TOKEN");
  if (text.length < 8) throw new TypeError("experience text needs at least 8 characters");
  return text;
}
function outcomeOf(result) {
  if (!result.isError) return { outcome: "success" };
  const code = result.error.info?.code ?? result.error.info?.name ?? "TOOL_ERROR";
  const signal = `${code} ${result.error.message}`;
  if (/TIMEOUT|TIMED_OUT|RATE.?LIMIT|429|ECONNRESET|EAI_AGAIN|502|503|504/i.test(signal)) {
    return { outcome: "transient", errorCode: code };
  }
  if (/UNKNOWN_TOOL|ENOENT|COMMAND_NOT_FOUND|NOT_INSTALLED|MODULE_NOT_FOUND/i.test(signal)) {
    return { outcome: "missing-capability", errorCode: code };
  }
  if (/AUTH|UNAUTHORIZED|FORBIDDEN|401|403|MISSING_TOKEN|MISSING_CREDENTIAL/i.test(signal)) {
    return { outcome: "missing-prerequisite", errorCode: code };
  }
  return { outcome: "error", errorCode: code };
}
function lessonStatus(evaluations) {
  const wins = evaluations.filter((item) => item.result === "worked").length;
  const losses = evaluations.length - wins;
  if (wins >= 2 && wins > losses * 2) return "validated";
  if (losses >= 2 && losses > wins * 2) return "avoid";
  return "candidate";
}
function terms(text) {
  const normalized = text.toLowerCase();
  const result = new Set(normalized.match(/[a-z0-9_-]{3,}/g) ?? []);
  for (const run of normalized.match(/[\p{Script=Han}]+/gu) ?? []) {
    for (let index = 0; index < run.length - 1; index++) result.add(run.slice(index, index + 2));
  }
  return result;
}
function relevance(query, situation) {
  const a = terms(query);
  const b = terms(situation);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const term of a) if (b.has(term)) overlap++;
  return overlap / Math.max(a.size, b.size);
}
function attemptsFor(domain, sessionId, intentId) {
  const records = [];
  for (const [, attempt] of domain.table("attempts").entries()) {
    if (attempt.sessionId === sessionId && (intentId === void 0 || attempt.intentId === intentId)) records.push(attempt);
  }
  return records.sort((a, b) => a.time - b.time);
}
function claimedIntent(snapshot) {
  return snapshot.nodes.filter((node) => node.kind === "intent" && node.status === "claimed").at(-1)?.id;
}
function recallSummary(lessons, diagnosis, budget) {
  const lines = [diagnosis === void 0 ? "No current stall diagnosis." : `Recovery: Intent #${diagnosis.intentId}, ${diagnosis.attemptsWithoutProgress} attempts without evidence; ${diagnosis.nextStep}. ${diagnosis.reason}`];
  let used = lines[0].length;
  let included = 0;
  for (const lesson of lessons) {
    const wins = lesson.evaluations.filter((item) => item.result === "worked").length;
    const losses = lesson.evaluations.length - wins;
    const prefix = `#${lesson.id} [${lesson.status}; ${wins} worked, ${losses} failed] `;
    const room = budget.summaryChars - used - prefix.length - 100;
    if (room < 24) break;
    const excerpt = Math.min(budget.excerptChars, room);
    const situation = clip2(lesson.situation, Math.max(12, Math.floor(excerpt * 0.45)));
    const strategy = clip2(lesson.strategy, Math.max(12, excerpt - situation.length - 4));
    const line2 = `${prefix}${situation} -> ${strategy}`;
    lines.push(line2);
    used += line2.length + 1;
    included++;
  }
  if (lessons.length === 0) lines.push("No matching experience yet; test a new hypothesis and record the observed outcome.");
  else if (included < lessons.length) lines.push(`${lessons.length - included} matching lesson(s) omitted by context budget; narrow the situation to retrieve them.`);
  if (included > 0) lines.push('Use experience_read(id="LESSON_ID", offset=0) for a full lesson.');
  return clip2(lines.join("\n"), budget.summaryChars);
}
var ExperienceService = class extends Service4 {
  static inject = ["storageDomain", "blackboard"];
  domainReady;
  tail = Promise.resolve();
  stallThreshold;
  constructor(ctx, config = {}, facility) {
    super(ctx, "experience");
    const threshold = config.stallThreshold ?? 3;
    if (!Number.isSafeInteger(threshold) || threshold < 1) {
      throw new TypeError("experience stallThreshold must be a positive safe integer");
    }
    this.stallThreshold = threshold;
    this.domainReady = (facility ?? ctx.storageDomain).open(experienceDomain);
    void this.domainReady.catch(() => void 0);
    ctx.effect(async () => {
      const domain = await this.domainReady.catch(() => void 0);
      return () => {
        void domain?.close();
      };
    }, "ant-sword-experience: domain");
  }
  serialize(operation) {
    const next = this.tail.then(operation);
    this.tail = next.then(() => void 0, () => void 0);
    return next;
  }
  async observe(exec, result) {
    const agent = exec.agent;
    if (agent === void 0 || exec.name === RUN_CODE_NAME || /^(?:board_|experience_|mcp_capabilities$|model_capabilities$|get_goal$|create_goal$|update_goal$)/.test(exec.name)) return void 0;
    const time = Date.now();
    return this.serialize(async () => {
      const snapshot = await this.ctx.blackboard.snapshot(agent.session);
      const intentId = claimedIntent(snapshot);
      if (intentId === void 0) return void 0;
      const classification = outcomeOf(result);
      const record = {
        id: randomUUID(),
        sessionId: agent.session.id,
        intentId,
        rootCallId: String(exec.rootCallId),
        toolName: exec.name,
        actionHash: hash(`${exec.name}:${stableJson(exec.arguments)}`),
        resultHash: hash(result.isError ? stableJson(result.error) : stableJson(result.value)),
        ...classification,
        time
      };
      const domain = await this.domainReady;
      await domain.table("attempts").put(record.id, record);
      return record;
    });
  }
  async propose(session, proposal) {
    return this.serialize(async () => {
      const snapshot = await this.ctx.blackboard.snapshot(session);
      const intent = snapshot.nodes.find((node) => node.id === proposal.intentId && node.kind === "intent");
      const fact = snapshot.nodes.find((node) => node.id === proposal.evidenceNodeId && node.kind === "fact");
      if (intent === void 0 || fact === void 0 || fact.parentId !== intent.id || !fact.detail?.trim()) {
        throw new TypeError("experience needs a detailed Fact linked to an Intent in this session");
      }
      if (proposal.result === "worked" && intent.status !== "done") {
        throw new TypeError("worked experience requires a completed Intent");
      }
      if (proposal.result === "failed" && intent.status !== "abandoned") {
        throw new TypeError("failed experience requires an abandoned Intent");
      }
      const domain = await this.domainReady;
      const recentAttempts = attemptsFor(domain, session.id, intent.id).filter((item) => item.time <= fact.time && fact.time - item.time <= ATTEMPT_WINDOW_MS);
      if (recentAttempts.length === 0 || proposal.result === "worked" && !recentAttempts.some((item) => item.outcome === "success")) {
        throw new TypeError("experience needs a matching tool attempt before its evidence");
      }
      const situation = abstractLessonText(proposal.situation);
      const strategy = abstractLessonText(proposal.strategy);
      const id = hash(`${situation.toLowerCase()}
${strategy.toLowerCase()}`);
      const previous = domain.table("lessons").get(id);
      const evaluation = {
        sessionId: session.id,
        result: proposal.result,
        evidenceNodeId: fact.id,
        time: Date.now()
      };
      const evaluations = [...(previous?.evaluations ?? []).filter((item) => item.sessionId !== session.id), evaluation];
      const lesson = { id, situation, strategy, evaluations, status: lessonStatus(evaluations), updatedAt: Date.now() };
      await domain.table("lessons").put(id, lesson);
      return lesson;
    });
  }
  async recall(situation, limit = DEFAULT_RECALL) {
    const query = abstractLessonText(situation);
    const domain = await this.domainReady;
    const scored = [];
    for (const [, lesson] of domain.table("lessons").entries()) {
      const score = relevance(query, lesson.situation);
      if (score > 0) scored.push({ lesson, score });
    }
    return scored.sort((a, b) => b.score - a.score || b.lesson.evaluations.length - a.lesson.evaluations.length).slice(0, Math.max(1, Math.min(MAX_RECALL, limit))).map((item) => item.lesson);
  }
  async read(id, offset = 0, pageChars = DEFAULT_SUMMARY_CHARS) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new TypeError("experience id must be a SHA-256 lesson id");
    if (!Number.isSafeInteger(offset) || offset < 0) throw new TypeError("offset must be a nonnegative safe integer");
    const domain = await this.domainReady;
    const lesson = domain.table("lessons").get(id);
    if (lesson === void 0) throw new TypeError(`experience #${id} does not exist`);
    const full = JSON.stringify(lesson, null, 2);
    if (offset > full.length) throw new TypeError("offset exceeds lesson length");
    const cap = clampBudget(pageChars, DEFAULT_SUMMARY_CHARS, 512, MAX_SUMMARY_CHARS);
    const chunk = full.slice(offset, offset + cap - 300);
    const next = offset + chunk.length;
    const suffix = next < full.length ? `
Next page: experience_read(id="${id}", offset=${next}).` : "";
    return {
      summary: `Experience #${id}, chars ${offset}-${next}/${full.length}:
${chunk}${suffix}`,
      ...next < full.length ? { nextOffset: next } : {}
    };
  }
  async diagnose(session) {
    await this.tail;
    const snapshot = await this.ctx.blackboard.snapshot(session);
    const intentId = claimedIntent(snapshot);
    if (intentId === void 0) return void 0;
    const domain = await this.domainReady;
    const latestFactTime = Math.max(0, ...snapshot.nodes.filter((node) => node.kind === "fact" && node.parentId === intentId).map((node) => node.time));
    const recent = attemptsFor(domain, session.id, intentId).filter((item) => item.time > latestFactTime);
    if (recent.length < this.stallThreshold) return void 0;
    const last = recent.at(-1);
    if (last === void 0) return void 0;
    const latestWindow = recent.slice(-this.stallThreshold);
    const novelSuccesses = latestWindow.every((item) => item.outcome === "success") && new Set(latestWindow.map((item) => item.resultHash)).size === latestWindow.length;
    if (novelSuccesses && recent.length < this.stallThreshold + 2) return void 0;
    let nextStep = "replan-branch";
    if (last.outcome === "transient") nextStep = "retry-with-backoff";
    else if (last.outcome === "missing-capability") nextStep = "switch-capability";
    else if (last.outcome === "missing-prerequisite") nextStep = "resolve-prerequisite";
    else if (novelSuccesses) nextStep = "capture-evidence";
    else if (latestWindow.every((item) => item.actionHash === last.actionHash && item.resultHash === last.resultHash)) nextStep = "switch-method";
    return {
      intentId,
      attemptsWithoutProgress: recent.length,
      reason: `No linked Fact after ${recent.length} tool attempts; latest outcome: ${last.outcome}.`,
      nextStep
    };
  }
};
function applyExperience(ctx, config = {}) {
  ctx.plugin(ExperienceService, config);
  ctx.inject(["experience", "tools"], (scope) => {
    scope.on("tools/result", (exec, result) => {
      void scope.experience.observe(exec, result).catch((error) => scope.logger.warn(error));
    }, { global: true });
    scope.tools.register(defineTool2({
      name: "experience_recall",
      description: "Before planning or after a stall, retrieve bounded evidence-backed strategies and a structured recovery diagnosis. Validated lessons have succeeded in at least two independent sessions; candidates are hypotheses. Use experience_read with a returned ID for the full record.",
      parameters: {
        situation: { type: "string", required: true, description: "Abstract current service, failure mode, and objective; omit credentials and target identifiers." }
      },
      output: {
        schema: { type: "object", additionalProperties: false, properties: { summary: { type: "string", required: true } } },
        render: (_args, value) => [{ type: "text", text: value.summary }]
      },
      async execute(args, exec) {
        if (!exec.agent) throw new Error("experience_recall requires an owning agent session");
        const budget = await budgetFor(scope, exec.agent);
        const [lessons, diagnosis] = await Promise.all([
          scope.experience.recall(args.situation, budget.lessonCount),
          scope.experience.diagnose(exec.agent.session)
        ]);
        return { summary: recallSummary(lessons, diagnosis, budget) };
      }
    }));
    scope.tools.register(defineTool2({
      name: "experience_read",
      description: "Read a complete experience record by the ID returned from experience_recall. Long records are paged; pass nextOffset as offset until complete.",
      parameters: {
        id: { type: "string", required: true, description: "SHA-256 lesson ID from experience_recall." },
        offset: { type: "integer", description: "Character offset of the next page; omit for the first page." }
      },
      output: {
        schema: { type: "object", additionalProperties: false, properties: {
          summary: { type: "string", required: true },
          nextOffset: { type: "integer" }
        } },
        render: (_args, value) => [{ type: "text", text: value.summary }]
      },
      async execute(args, exec) {
        if (!exec.agent) throw new Error("experience_read requires an owning agent session");
        return scope.experience.read(args.id, args.offset, (await budgetFor(scope, exec.agent)).summaryChars);
      }
    }));
    scope.tools.register(defineTool2({
      name: "experience_record",
      description: "After closing an Intent, record a transferable method or dead end using a detailed Fact linked to that Intent. Evidence from one session stays a candidate; independent sessions can validate or disconfirm it.",
      parameters: {
        intentId: { type: "string", required: true },
        evidenceNodeId: { type: "string", required: true },
        situation: { type: "string", required: true, description: "Abstract conditions under which the method applies." },
        strategy: { type: "string", required: true, description: "Reusable action or method, without target-specific secrets." },
        result: { type: "string", required: true, enum: ["worked", "failed"] }
      },
      output: {
        schema: { type: "object", additionalProperties: false, properties: {
          id: { type: "string", required: true },
          status: { type: "string", required: true },
          independentSessions: { type: "integer", required: true }
        } },
        render: (_args, value) => [{ type: "text", text: `experience: ${value.status} (${value.independentSessions} independent session(s)) #${value.id}` }]
      },
      async execute(args, exec) {
        if (!exec.agent) throw new Error("experience_record requires an owning agent session");
        const lesson = await scope.experience.propose(exec.agent.session, {
          intentId: args.intentId,
          evidenceNodeId: args.evidenceNodeId,
          situation: args.situation,
          strategy: args.strategy,
          result: args.result
        });
        return { id: lesson.id, status: lesson.status, independentSessions: lesson.evaluations.length };
      }
    }));
  });
}

// src/auto/model-adaptation.ts
import { Service as Service5 } from "@deepseek-ai/cordis";
var BUDGETS = {
  compact: { boardChars: 2e3, evidenceChars: 500, lessonCount: 2 },
  standard: { boardChars: 5e3, evidenceChars: 1e3, lessonCount: 4 },
  wide: { boardChars: 1e4, evidenceChars: 2e3, lessonCount: 6 }
};
function validWindow(value) {
  return Number.isSafeInteger(value) && value > 0;
}
function tierFor(window) {
  if (window === void 0 || window <= 32768) return "compact";
  if (window <= 131072) return "standard";
  return "wide";
}
function effortMode(effort, info) {
  if (effort === void 0) return "balanced";
  const named = info?.reasoning?.efforts.find((item) => item.id === effort)?.name;
  const words = `${effort} ${named ?? ""}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.some((word) => /^(high|xhigh|ultra|max|deep|extended|intense|heavy)$/.test(word))) return "deep";
  if (words.some((word) => /^(minimal|none|off|low|light|fast)$/.test(word))) return "guided";
  return "balanced";
}
function routeFor(agent) {
  const header2 = agent.session.requestHeader();
  const config = header2?.config ?? agent.options;
  if (!config.provider || !config.model) return void 0;
  const effort = config.reasoningEffort;
  return {
    provider: config.provider,
    model: config.model,
    ...effort === void 0 ? {} : { effort: String(effort) }
  };
}
var ModelAdaptationService = class extends Service5 {
  static inject = ["llm"];
  metadata = /* @__PURE__ */ new Map();
  observedInput = /* @__PURE__ */ new WeakMap();
  generation = 0;
  constructor(ctx) {
    super(ctx, "modelAdaptation");
    ctx.on("llm/adapters-updated", () => {
      this.generation++;
      this.metadata.clear();
    });
    ctx.on("session/event", (session, event) => {
      if (event.type !== "assistant/message" || event.data.usage === void 0) return;
      const header2 = session.requestHeader()?.config;
      if (header2 === void 0) return;
      const usage = event.data.usage;
      const parts = [usage.inputTokens, usage.cacheReadTokens ?? 0, usage.cacheWriteTokens ?? 0];
      if (!parts.every((value) => Number.isSafeInteger(value) && value >= 0)) return;
      const tokens = parts.reduce((sum, value) => sum + value, 0);
      if (Number.isSafeInteger(tokens) && tokens > 0) {
        this.observedInput.set(session, { provider: header2.provider, model: header2.model, tokens });
      }
    });
  }
  resolve(route) {
    const key = JSON.stringify([route.provider, route.model]);
    const cached = this.metadata.get(key);
    if (cached !== void 0) return cached;
    let pending;
    pending = Promise.resolve().then(() => this.ctx.llm.resolveModelInfo(route.provider, route.model)).catch(() => void 0).then((info) => {
      if (info === void 0 && this.metadata.get(key) === pending) this.metadata.delete(key);
      return info;
    });
    this.metadata.set(key, pending);
    return pending;
  }
  async profile(agent) {
    const route = routeFor(agent);
    if (route === void 0) return { contextTier: "compact", reasoningMode: "balanced", ...BUDGETS.compact };
    const requestContext = agent.session.requestContext();
    const recordedWindow = requestContext?.provider === route.provider && requestContext.model === route.model && validWindow(requestContext.contextWindow) ? requestContext.contextWindow : void 0;
    return this.profileFor(route, recordedWindow, this.observedInput.get(agent.session));
  }
  /** Resolve the route captured by prompt assembly before a header exists. */
  async forRoute(provider, model, effort, contextWindowHint) {
    if (!provider || !model) return { contextTier: "compact", reasoningMode: "balanced", ...BUDGETS.compact };
    return this.profileFor({
      provider,
      model,
      ...effort === void 0 ? {} : { effort: String(effort) }
    }, validWindow(contextWindowHint) ? contextWindowHint : void 0);
  }
  async profileFor(route, contextWindowHint, observed) {
    const generation = this.generation;
    let info = await this.resolve(route);
    if (this.generation !== generation) info = await this.resolve(route);
    const liveWindow = info?.context?.contextWindow;
    const contextWindow = validWindow(liveWindow) ? liveWindow : contextWindowHint;
    const effort = route.effort ?? (info?.reasoning?.defaultEffort === void 0 ? void 0 : String(info.reasoning.defaultEffort));
    let contextTier = tierFor(contextWindow);
    if (contextWindow !== void 0 && observed?.provider === route.provider && observed.model === route.model) {
      const pressure = observed.tokens / contextWindow;
      if (pressure >= 0.9) contextTier = "compact";
      else if (pressure >= 0.75 && contextTier === "wide") contextTier = "standard";
      else if (pressure >= 0.75 && contextTier === "standard") contextTier = "compact";
    }
    return {
      contextTier,
      reasoningMode: effortMode(effort, info),
      ...BUDGETS[contextTier],
      ...contextWindow === void 0 ? {} : { contextWindow },
      ...effort === void 0 ? {} : { effort }
    };
  }
};
function applyModelAdaptation(ctx) {
  ctx.plugin(ModelAdaptationService);
}

// src/runtime-status.ts
import { defineTool as defineTool3 } from "@deepseek-ai/dsh-tools";

// src/mcp-servers.ts
import { spawnSync } from "node:child_process";
import z4 from "@deepseek-ai/schemastery";
import * as mcpClient from "@deepseek-ai/dsh-mcp-client";
var McpServerSchema = z4.object({
  enabled: z4.boolean().default(true).description("\u542F\u7528\u6B64 MCP \u670D\u52A1\u5668\uFF1B\u5173\u95ED\u5219\u4E0D\u6302\u8F7D\uFF0C\u5176 mcp__* \u5DE5\u5177\u4E0D\u51FA\u73B0\u3002"),
  serverName: z4.string().required().description("\u5DE5\u5177\u547D\u540D\u7A7A\u95F4\uFF0C\u6A21\u578B\u770B\u5230\u7684\u662F mcp__<serverName>__<tool>\u3002"),
  transport: z4.union(["stdio", "streamable-http"]).required().description("stdio=\u62C9\u8D77\u5B50\u8FDB\u7A0B\uFF1Bstreamable-http=\u5F53\u524D HTTP MCP\u3002"),
  command: z4.string().description("stdio\uFF1A\u8981\u542F\u52A8\u7684\u53EF\u6267\u884C\u6587\u4EF6\u3002"),
  args: z4.array(z4.string()).description("stdio\uFF1A\u547D\u4EE4\u53C2\u6570\u3002"),
  cwd: z4.string().description("stdio\uFF1A\u5DE5\u4F5C\u76EE\u5F55\uFF1B\u7559\u7A7A\u4F7F\u7528 Harness \u5DE5\u4F5C\u76EE\u5F55\u3002"),
  toolCallTimeoutMs: z4.number().min(1).max(2147483647).default(6e4).description("\u5355\u6B21\u5DE5\u5177\u8C03\u7528\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09\u3002"),
  env: z4.dict(z4.string()).description("stdio\uFF1A\u989D\u5916\u73AF\u5883\u53D8\u91CF\uFF08\u4E0D\u542B\u5BC6\u94A5\uFF0C\u5BC6\u94A5\u8D70 secret \u5B57\u6BB5\uFF09\u3002"),
  url: z4.string().description("streamable-http\uFF1A\u670D\u52A1\u5668\u5730\u5740\u3002"),
  headers: z4.dict(z4.string()).description("streamable-http\uFF1A\u989D\u5916\u8BF7\u6C42\u5934\u3002")
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
function commandExists(command) {
  if (command === "") return false;
  const locator = process.platform === "win32" ? "where.exe" : "which";
  return spawnSync(locator, [command], { stdio: "ignore", windowsHide: true }).status === 0;
}

// src/skills.ts
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BUNDLED_SKILL_RANK
} from "@deepseek-ai/dsh-skill";
var SKILLS_ROOT = fileURLToPath(new URL("../skills", import.meta.url));
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
    const line2 = lines[i];
    if (line2 === void 0) continue;
    if (line2.trim() === "metadata:") {
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
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line2);
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
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name === "SKILL.md") {
        const text = await readFile(path, "utf8");
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
    resourceBase: { kind: "directory", path: dirname(path) },
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
      text = await readFile(locator, "utf8");
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
function mcpAvailability(mount, toolCount, lastCall) {
  if (mount === "disabled") return "disabled";
  if (mount === "missing-command") return "missing";
  if (mount === "pending" || mount === "mounting") return "pending";
  if (mount === "failed" || toolCount === 0) return "unavailable";
  return lastCall?.ok === false ? "degraded" : "available";
}
var FALLBACK_CAPABILITY_BUDGET = {
  boardChars: 1200,
  evidenceChars: 160,
  contextTier: "compact"
};
async function capabilityBudget(ctx, agent) {
  const service = ctx.get?.("modelAdaptation");
  const profile = agent === void 0 ? void 0 : await service?.profile(agent);
  const bounded = (value, fallback, minimum, maximum) => value !== void 0 && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, Math.floor(value))) : fallback;
  return {
    boardChars: bounded(profile?.boardChars, FALLBACK_CAPABILITY_BUDGET.boardChars, 512, 8192),
    evidenceChars: bounded(profile?.evidenceChars, FALLBACK_CAPABILITY_BUDGET.evidenceChars, 40, 1024),
    contextTier: profile?.contextTier === "standard" || profile?.contextTier === "wide" ? profile.contextTier : "compact"
  };
}
function capabilityServer(status, visibleNames, shownNames, detailed = false, hasMoreTools = shownNames.length < visibleNames.length) {
  return {
    serverName: status.serverName,
    mount: status.mount,
    availability: mcpAvailability(status.mount, visibleNames.length, status.lastCall),
    toolCount: visibleNames.length,
    toolNames: [...shownNames],
    hasMoreTools,
    ...detailed && status.initialConnectedAt !== void 0 ? { initialConnectedAt: status.initialConnectedAt } : {},
    ...detailed && status.lastCall !== void 0 ? { lastCallOk: status.lastCall.ok, lastCallAt: status.lastCall.at } : {}
  };
}
function capabilityPages(statuses, budget, checkedAt, selectedServer) {
  const limits = {
    compact: { servers: 4, preview: 2, focused: 8 },
    standard: { servers: 8, preview: 4, focused: 16 },
    wide: { servers: 12, preview: 8, focused: 32 }
  }[budget.contextTier];
  const result = (servers, page, hasNext) => ({
    checkedAt,
    page,
    totalServers: statuses.length,
    servers: [...servers],
    ...selectedServer === void 0 ? {} : { selectedServer },
    ...hasNext ? { nextPage: page + 1 } : {}
  });
  const fits = (servers, page) => JSON.stringify(result(servers, page, true)).length <= budget.boardChars;
  if (selectedServer !== void 0) {
    const found = statuses.find((item) => item.status.serverName === selectedServer);
    if (found === void 0) throw new TypeError("unknown MCP serverName");
    const pages2 = [];
    let offset = 0;
    do {
      const page = pages2.length + 1;
      const names = [];
      while (offset < found.names.length && names.length < limits.focused) {
        const candidate2 = [...names, found.names[offset]];
        const server = capabilityServer(found.status, found.names, candidate2, true, offset + 1 < found.names.length);
        if (names.length > 0 && !fits([server], page)) break;
        names.push(found.names[offset]);
        offset++;
      }
      pages2.push([capabilityServer(found.status, found.names, names, true, offset < found.names.length)]);
    } while (offset < found.names.length);
    return pages2.map((servers, index) => result(servers, index + 1, index + 1 < pages2.length));
  }
  const pages = [[]];
  for (const { status, names } of statuses) {
    const preview = [];
    let previewChars = 0;
    for (const name2 of names) {
      if (preview.length >= limits.preview) break;
      if (previewChars + name2.length > budget.evidenceChars) continue;
      preview.push(name2);
      previewChars += name2.length;
    }
    let current = pages[pages.length - 1];
    let page = pages.length;
    let server = capabilityServer(status, names, preview);
    if (current.length >= limits.servers || current.length > 0 && !fits([...current, server], page)) {
      current = [];
      pages.push(current);
      page++;
    }
    while (server.toolNames.length > 0 && !fits([...current, server], page)) {
      server = capabilityServer(status, names, server.toolNames.slice(0, -1));
    }
    current.push(server);
  }
  return pages.map((servers, index) => result(servers, index + 1, index + 1 < pages.length));
}
function mcpStatus(server, observed, lastProbe) {
  const guide = INSTALL_GUIDES[server.serverName] ?? { hint: "\u5B89\u88C5\u5BF9\u5E94 MCP server\uFF0C\u5E76\u786E\u8BA4\u914D\u7F6E\u7684\u547D\u4EE4\u6216 URL \u53EF\u8BBF\u95EE\u3002" };
  const target = server.transport === "stdio" ? server.command ?? "" : server.url ?? "";
  const mount = observed?.mount ?? (server.enabled === false ? "disabled" : server.transport === "stdio" && !commandExists(target) ? "missing-command" : "pending");
  const toolNames = observed?.toolNames ?? [];
  return {
    serverName: server.serverName,
    transport: server.transport,
    availability: mcpAvailability(mount, toolNames.length, observed?.lastCall),
    mount,
    toolNames,
    toolCount: toolNames.length,
    mounted: mount === "mounted",
    target,
    ...lastProbe === void 0 ? {} : { lastProbe },
    ...observed?.initialConnectedAt === void 0 ? {} : { initialConnectedAt: observed.initialConnectedAt },
    ...observed?.lastCall === void 0 ? {} : { lastCall: observed.lastCall },
    ...observed?.error === void 0 ? {} : { error: observed.error },
    ...guide.command === void 0 ? {} : { installCommand: guide.command },
    installHint: guide.hint
  };
}
async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.byteLength;
    if (size > 16384) throw new TypeError("request body is too large");
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (typeof body !== "object" || body === null || !("serverName" in body) || typeof body.serverName !== "string" || body.serverName === "") {
    throw new TypeError("serverName is required");
  }
  return { serverName: body.serverName };
}
function applyRuntimeStatus(ctx, controller, mcpReconciler) {
  let disposed = false;
  let running = false;
  let pending = false;
  const runtimeStatus = ({ generation, applying, lastFailure }) => {
    return { generation, applying, ...lastFailure === void 0 ? {} : { lastFailure } };
  };
  const initialSnapshot = controller.snapshot();
  const probes = /* @__PURE__ */ new Map();
  const mcpStatuses = (servers) => {
    const observed = new Map(mcpReconciler.statusFor(servers).map((status) => [status.serverName, status]));
    return servers.map((server) => mcpStatus(server, observed.get(server.serverName), probes.get(server.serverName)));
  };
  let latest = {
    checkedAt: Date.now(),
    skills: { available: 0, provider: skillProvider.name, state: "ready" },
    mcp: mcpStatuses(initialSnapshot.applied.mcpServers),
    runtimeConfig: runtimeStatus(initialSnapshot)
  };
  ctx.tools.register(defineTool3({
    name: "mcp_capabilities",
    description: "Read MCP mount states and visible tool counts before selecting an MCP-dependent Intent. The default response previews a few tool names per server. Use serverName to page through every tool on one server; page starts at 1 and nextPage indicates more results. A configured URL alone is not evidence of a working server.",
    parameters: {
      serverName: { type: "string", description: "Optional exact server name. Select it to enumerate all visible tool names in pages." },
      page: { type: "integer", description: "One-based page number; follows nextPage in the current listing." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          checkedAt: { type: "integer", required: true },
          page: { type: "integer", required: true },
          totalServers: { type: "integer", required: true },
          selectedServer: { type: "string" },
          nextPage: { type: "integer" },
          servers: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                serverName: { type: "string", required: true },
                mount: { type: "string", required: true },
                availability: { type: "string", required: true },
                toolCount: { type: "integer", required: true },
                toolNames: { type: "array", required: true, items: { type: "string" } },
                hasMoreTools: { type: "boolean", required: true },
                initialConnectedAt: { type: "integer" },
                lastCallOk: { type: "boolean" },
                lastCallAt: { type: "integer" }
              }
            }
          }
        }
      },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
    },
    async execute(args, exec) {
      const page = args.page ?? 1;
      if (!Number.isSafeInteger(page) || page < 1) throw new TypeError("page must be a positive integer");
      const visible = new Set(ctx.tools.schemas(exec.agent).map((tool) => tool.name));
      const statuses = mcpStatuses(controller.snapshot().applied.mcpServers).map((status) => ({
        status,
        names: status.toolNames.filter((name2) => visible.has(name2)).sort()
      }));
      const pages = capabilityPages(statuses, await capabilityBudget(ctx, exec.agent), Date.now(), args.serverName);
      if (page > pages.length) throw new TypeError("page exceeds available MCP capability pages");
      return pages[page - 1];
    }
  }));
  const publish = async () => {
    if (disposed) return;
    pending = true;
    if (running) return;
    running = true;
    try {
      while (pending && !disposed) {
        pending = false;
        let skills;
        try {
          const candidates2 = await ctx.skills.list({ signal: new AbortController().signal });
          skills = { available: candidates2.length, provider: skillProvider.name, state: "ready" };
        } catch (error) {
          skills = { available: 0, provider: skillProvider.name, state: "error", error: String(error) };
        }
        if (disposed) return;
        const snapshot = controller.snapshot();
        latest = {
          checkedAt: Date.now(),
          skills,
          mcp: mcpStatuses(snapshot.applied.mcpServers),
          runtimeConfig: runtimeStatus(snapshot)
        };
        ctx.emit("ant-sword/runtime-status", latest);
      }
    } finally {
      running = false;
    }
  };
  ctx.effect(() => {
    const timer = setInterval(() => {
      void publish();
    }, 5e3);
    timer.unref();
    const unsubscribe = controller.subscribe(() => {
      void publish();
    });
    return () => {
      disposed = true;
      unsubscribe();
      clearInterval(timer);
    };
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
          const { serverName } = await readJsonBody(req);
          await mcpReconciler.reload(serverName);
          await publish();
          res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
          res.end(JSON.stringify({ ok: true, serverName }));
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
          const { serverName } = await readJsonBody(req);
          const result = await mcpReconciler.probe(serverName);
          probes.set(serverName, { checkedAt: Date.now(), ...result });
          await publish();
          res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
          res.end(JSON.stringify({ ok: true, serverName, ...result }));
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
  ctx.on("tools/change", () => {
    void publish();
  });
  ctx.on("tools/post-execute", (exec, _result, next) => {
    if (exec.name.startsWith("mcp__")) void publish();
    return next();
  }, { global: true });
}

// src/runtime-config-api.ts
import { isDeepStrictEqual } from "node:util";
import { SettingsConflictError } from "@deepseek-ai/dsh-settings";

// src/runtime-config.ts
import z5 from "@deepseek-ai/schemastery";
var ANT_SWORD_SETTINGS_ENTRY_ID = "ant-sword-harness";
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
var ChannelThinkingPolicySchema = z5.object({
  providerId: z5.string().required(),
  modelId: z5.string().required(),
  level: z5.union(["minimum", "low", "medium", "high", "maximum"]).required()
});
var SimulatedEffortsSchema = z5.object({
  minimum: z5.string().required(),
  low: z5.string().required(),
  medium: z5.string().required(),
  high: z5.string().required(),
  maximum: z5.string().required()
});
var ThinkingFallbackPolicySchema = z5.object({
  providerId: z5.string().required(),
  modelId: z5.string().required(),
  simulatedEfforts: SimulatedEffortsSchema.required()
});
var RuntimeRuleSchema = z5.object({
  id: z5.string().required(),
  title: z5.string().required(),
  enabled: z5.boolean().default(true),
  order: z5.number().default(0),
  placement: z5.union(["before-persona", "after-persona", "before-tools", "after-tools"]).required(),
  content: z5.string().required()
});
var AntSwordRuntimeConfigSchema = z5.object({
  mcpServers: z5.array(McpServerSchema).default(DEFAULT_MCP_SERVERS.map((server) => ({ ...server }))),
  disabledSkills: z5.array(z5.string()).default([]),
  rules: z5.array(RuntimeRuleSchema).default([]),
  thinkingPolicies: z5.array(ChannelThinkingPolicySchema).default([]),
  thinkingFallbacks: z5.array(ThinkingFallbackPolicySchema).default([]),
  // No schema `.default()`: schemastery coerces an explicit `null` back to a
  // non-null default, which would make disabling impossible. Instead, an
  // omitted field arrives as `undefined` and the runtime treats that as
  // "use DEFAULT_THINKING_FALLBACK"; only an explicit `null` disables it.
  defaultThinkingFallback: z5.union([SimulatedEffortsSchema, z5.const(null)])
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
  constructor(initialConfig, reconcilers) {
    this.reconcilers = reconcilers;
    this.desired = cloneConfig(initialConfig);
    this.applied = cloneConfig(this.desired);
    validateRuntimeConfig(this.desired);
  }
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
    void this.enqueue(this.desired);
    return async () => {
      this.stopped = true;
      await this.tail;
      this.listeners.clear();
    };
  }
  /** Apply a replacement received from this plugin's Loader config. */
  update(next) {
    if (this.stopped) return Promise.resolve();
    return this.enqueue(next);
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
        for (const entry of committed.reverse()) {
          try {
            await entry.change.rollback();
          } catch {
          }
        }
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
var MUTABLE_FIELDS = /* @__PURE__ */ new Set([
  "mcpServers",
  "disabledSkills",
  "rules",
  "thinkingPolicies",
  "thinkingFallbacks",
  "defaultThinkingFallback"
]);
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
    throw new TypeError("field must be a runtime config field");
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
  const found = settings.describe({ redactSecrets: true }).find((candidate2) => candidate2.ns === ANT_SWORD_SETTINGS_ENTRY_ID);
  if (found === void 0) throw new Error(`settings entry "${ANT_SWORD_SETTINGS_ENTRY_ID}" is not registered`);
  return found;
}
function runtimeFields(value) {
  if (!isRecord(value)) return {};
  const fields = {};
  for (const field of MUTABLE_FIELDS) {
    if (Object.hasOwn(value, field)) Object.assign(fields, { [field]: value[field] });
  }
  return fields;
}
function runtimeConfigApiView(settings, controller) {
  const settingsView = descriptor(settings);
  const runtime = controller.snapshot();
  return {
    value: { ...runtime.desired, ...runtimeFields(settingsView.value) },
    desired: runtime.desired,
    applied: runtime.applied,
    ...settingsView.base === void 0 ? {} : { base: runtimeFields(settingsView.base) },
    ...settingsView.user === void 0 ? {} : { user: runtimeFields(settingsView.user) },
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
  await settings.mutate(ANT_SWORD_SETTINGS_ENTRY_ID, [op], mutation.expectedRevision);
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
import { createHash as createHash2, randomUUID as randomUUID2 } from "node:crypto";
import { mkdir, readFile as readFile2, readdir as readdir2, rename, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join as join2 } from "node:path";

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
    const id = randomUUID2();
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
    const staging = join2(tmpdir(), "dsh-ant-sword-installer", snapshot.id);
    await mkdir(staging, { recursive: true });
    const target = join2(staging, step.targetName);
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
  const toolsRoot = join2(homedir(), ".dsh", "tools");
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
      const { writeFile: writeFile2 } = await import("node:fs/promises");
      await writeFile2(target, Buffer.from(await response.arrayBuffer()));
    },
    verifySha256: async (path, expected) => {
      const actual = createHash2("sha256").update(await readFile2(path)).digest("hex");
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
      await mkdir(toolsRoot, { recursive: true });
      const extracted = join2(toolsRoot, `.${component.id}-${randomUUID2()}`);
      const target = join2(toolsRoot, component.installDirectory);
      const backup = join2(toolsRoot, `.${component.id}-backup-${randomUUID2()}`);
      await mkdir(extracted, { recursive: true });
      if (process.platform === "win32") {
        await command("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force", path, extracted], 10 * 6e4, signal);
      } else {
        await command("unzip", ["-q", path, "-d", extracted], 10 * 6e4, signal);
      }
      const entries = await readdir2(extracted, { withFileTypes: true });
      const firstEntry = entries[0];
      const source = entries.length === 1 && firstEntry?.isDirectory() === true ? join2(extracted, firstEntry.name) : extracted;
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
      const target = join2(toolsRoot, component.installDirectory);
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

// src/mcp-reconciler.ts
import * as mcpClient2 from "@deepseek-ai/dsh-mcp-client";
function errorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}
function sameConfig(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
      failOnStartupError: true,
      reconnect: { enabled: true, initialDelayMs: 1e3, maxDelayMs: 3e4, maxAttempts: 5 }
    };
  }
  return {
    transport: "streamable-http",
    serverName: server.serverName,
    url: server.url ?? "",
    headers: server.headers ?? {},
    toolCallTimeoutMs: server.toolCallTimeoutMs ?? 6e4,
    failOnStartupError: true,
    reconnect: { enabled: true, initialDelayMs: 1e3, maxDelayMs: 3e4, maxAttempts: 5 }
  };
}
var McpReconciler = class {
  constructor(ctx, getPentestswarmApiKey = () => void 0, canResolveCommand = commandExists) {
    this.ctx = ctx;
    this.getPentestswarmApiKey = getPentestswarmApiKey;
    this.canResolveCommand = canResolveCommand;
    ctx.on("tools/post-execute", (exec, result, next) => {
      if (exec.name.startsWith("mcp__")) {
        for (const name2 of this.configs.keys()) {
          if (exec.name.startsWith(`mcp__${name2}__`)) {
            this.lastCalls.set(name2, {
              at: Date.now(),
              ok: !result.isError,
              ...result.isError ? { error: result.error.message } : {}
            });
            break;
          }
        }
      }
      return next();
    }, { global: true });
  }
  ctx;
  getPentestswarmApiKey;
  canResolveCommand;
  name = "mcp";
  fibers = /* @__PURE__ */ new Map();
  mounting = /* @__PURE__ */ new Set();
  initiallyConnected = /* @__PURE__ */ new Map();
  lastCalls = /* @__PURE__ */ new Map();
  failures = /* @__PURE__ */ new Map();
  configs = /* @__PURE__ */ new Map();
  currentApiKey;
  /** Serializes HTTP reloads with Loader-driven config commits. */
  tail = Promise.resolve();
  /** Current mount and callable-tool evidence for the committed server list. */
  statusFor(servers) {
    const toolNames = this.ctx.tools.schemas().map((tool) => tool.name);
    return servers.map((server) => {
      const name2 = server.serverName;
      const names = toolNames.filter((tool) => tool.startsWith(`mcp__${name2}__`));
      const mount = server.enabled === false ? "disabled" : this.mounting.has(name2) ? "mounting" : this.fibers.has(name2) ? "mounted" : server.transport === "stdio" && !this.canResolveCommand(server.command ?? "") ? "missing-command" : this.failures.has(name2) ? "failed" : "pending";
      const initialConnectedAt = this.initiallyConnected.get(name2);
      const lastCall = this.lastCalls.get(name2);
      const error = this.failures.get(name2);
      return {
        serverName: name2,
        mount,
        toolNames: names,
        ...initialConnectedAt === void 0 ? {} : { initialConnectedAt },
        ...lastCall === void 0 ? {} : { lastCall: { ...lastCall } },
        ...error === void 0 || mount !== "failed" ? {} : { error }
      };
    });
  }
  isMounted(serverName) {
    return this.fibers.has(serverName);
  }
  enqueue(operation) {
    const run = this.tail.then(operation);
    this.tail = run.catch(() => void 0);
    return run;
  }
  /** Reconnect one configured server without changing its persisted settings. */
  reload(serverName) {
    return this.enqueue(async () => {
      const config = this.configs.get(serverName);
      if (config === void 0) throw new TypeError(`unknown MCP server "${serverName}"`);
      if (config.enabled === false) throw new TypeError(`MCP server "${serverName}" is disabled`);
      if (config.transport === "stdio" && !this.canResolveCommand(config.command ?? "")) {
        throw new TypeError(`MCP server "${serverName}" command is not available`);
      }
      const previous = this.fibers.get(serverName);
      if (previous !== void 0) {
        await previous.dispose();
        this.fibers.delete(serverName);
      }
      this.initiallyConnected.delete(serverName);
      this.lastCalls.delete(serverName);
      this.failures.delete(serverName);
      this.mounting.add(serverName);
      let replacement;
      try {
        replacement = this.ctx.plugin(mcpClient2, clientConfig(config, this.currentApiKey));
        await replacement.await();
        this.fibers.set(serverName, replacement);
        this.initiallyConnected.set(serverName, Date.now());
      } catch (error) {
        this.failures.set(serverName, errorMessage2(error));
        if (replacement !== void 0) {
          try {
            await replacement.dispose();
          } catch (disposeError) {
            this.ctx.logger.warn(`mcp: failed to dispose ${serverName} after reload error: ${errorMessage2(disposeError)}`);
          }
        }
        throw error;
      } finally {
        this.mounting.delete(serverName);
      }
    });
  }
  /** Read the mounted tool catalog for the legacy UI probe endpoint. */
  probe(serverName) {
    return this.enqueue(async () => {
      const config = this.configs.get(serverName);
      if (config === void 0) throw new TypeError(`unknown MCP server "${serverName}"`);
      if (!this.fibers.has(serverName)) throw new TypeError(`MCP server "${serverName}" is not mounted`);
      const tools = this.ctx.tools.schemas().filter((tool) => tool.name.startsWith(`mcp__${serverName}__`)).map((tool) => ({ name: tool.name.slice(`mcp__${serverName}__`.length), ...tool.description === void 0 ? {} : { description: tool.description } }));
      return { toolCount: tools.length, tools };
    });
  }
  prepare(next, _previousConfig) {
    const desired = new Map(next.mcpServers.map((server) => [server.serverName, server]));
    const previous = new Map(this.configs);
    const nextApiKey = this.getPentestswarmApiKey();
    const previousApiKey = this.currentApiKey;
    const previousCalls = new Map(this.lastCalls);
    const previousConnected = new Map(this.initiallyConnected);
    const previousFailures = new Map(this.failures);
    const previouslyMounted = new Set(this.fibers.keys());
    return {
      commit: () => this.enqueue(async () => {
        const changed = new Set([...previous.keys(), ...desired.keys()].filter((name2) => {
          const before = previous.get(name2);
          const after = desired.get(name2);
          return before === void 0 || after === void 0 || !sameConfig(before, after) || name2 === "pentestswarm" && previousApiKey !== nextApiKey;
        }));
        const disposed = [];
        const mounted = [];
        try {
          for (const name2 of changed) {
            const fiber = this.fibers.get(name2);
            const config = previous.get(name2);
            if (fiber !== void 0) {
              await fiber.dispose();
              this.fibers.delete(name2);
              if (config !== void 0) disposed.push([name2, config]);
            }
            this.initiallyConnected.delete(name2);
            this.lastCalls.delete(name2);
            this.failures.delete(name2);
          }
          for (const name2 of changed) {
            const config = desired.get(name2);
            if (config === void 0 || config.enabled === false) continue;
            if (config.transport === "stdio" && !this.canResolveCommand(config.command ?? "")) continue;
            this.mounting.add(name2);
            let fiber;
            try {
              fiber = this.ctx.plugin(mcpClient2, clientConfig(config, nextApiKey));
              await fiber.await();
              this.fibers.set(name2, fiber);
              this.initiallyConnected.set(name2, Date.now());
              mounted.push(name2);
            } catch (error) {
              this.failures.set(name2, errorMessage2(error));
              this.ctx.logger.warn(`mcp: ${name2} initial connection failed: ${errorMessage2(error)}`);
              if (fiber !== void 0) {
                try {
                  await fiber.dispose();
                } catch (disposeError) {
                  this.ctx.logger.warn(`mcp: failed to dispose ${name2} after startup error: ${errorMessage2(disposeError)}`);
                }
              }
            } finally {
              this.mounting.delete(name2);
            }
          }
          this.configs = desired;
          this.currentApiKey = nextApiKey;
        } catch (error) {
          await Promise.allSettled(mounted.map(async (name2) => {
            await this.fibers.get(name2)?.dispose();
            this.fibers.delete(name2);
          }));
          for (const [name2, config] of disposed) {
            const fiber = this.ctx.plugin(mcpClient2, clientConfig(config, previousApiKey));
            await fiber.await();
            this.fibers.set(name2, fiber);
          }
          this.lastCalls.clear();
          for (const [name2, call] of previousCalls) this.lastCalls.set(name2, call);
          this.initiallyConnected.clear();
          for (const [name2, at] of previousConnected) this.initiallyConnected.set(name2, at);
          this.configs = previous;
          this.currentApiKey = previousApiKey;
          throw error;
        }
      }),
      rollback: () => this.enqueue(async () => {
        const current = [...this.fibers.values()];
        await Promise.allSettled(current.map((fiber) => fiber.dispose()));
        this.fibers.clear();
        for (const [name2, config] of previous) {
          if (!previouslyMounted.has(name2)) continue;
          const fiber = this.ctx.plugin(mcpClient2, clientConfig(config, previousApiKey));
          await fiber.await();
          this.fibers.set(name2, fiber);
        }
        this.lastCalls.clear();
        for (const [name2, call] of previousCalls) this.lastCalls.set(name2, call);
        this.initiallyConnected.clear();
        for (const [name2, at] of previousConnected) this.initiallyConnected.set(name2, at);
        this.failures.clear();
        for (const [name2, message] of previousFailures) this.failures.set(name2, message);
        this.configs = previous;
        this.currentApiKey = previousApiKey;
      })
    };
  }
};

// src/rules-reconciler.ts
import { randomUUID as randomUUID3 } from "node:crypto";
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
  let id = `rule-${randomUUID3()}`;
  while (used.has(id)) id = `rule-${randomUUID3()}`;
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
    return this.ctx.on("agent/created", ({ agent }) => {
      this.install(agent);
      return void 0;
    });
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
import { join as join4 } from "node:path";
import { isSkillName as isSkillName2 } from "@deepseek-ai/dsh-skill";

// src/skill-catalog.ts
import { mkdir as mkdir2, readFile as readFile3, readdir as readdir3, rename as rename2, rm as rm2, writeFile } from "node:fs/promises";
import { dirname as dirname2, join as join3, relative, resolve } from "node:path";
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
  for (const line2 of src.slice(3, end).split("\n")) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line2);
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
    resourceBase: { kind: "directory", path: dirname2(path) },
    locator: path,
    path
  };
}
async function scan(root) {
  const result = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir3(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join3(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name === "SKILL.md") {
        try {
          const parsed = parseSkillDocument(await readFile3(path, "utf8"));
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
      const parsed = parseSkillDocument(await readFile3(selected.locator, "utf8"));
      return { ...selected, content: parsed.body.trim() };
    } catch {
      return void 0;
    }
  }
  async write(input) {
    if (!isSkillName(input.name)) throw new TypeError("invalid skill name");
    if (!isWithin(this.root, join3(this.root, input.name))) throw new TypeError("skill path escapes user root");
    if (Buffer.byteLength(input.content, "utf8") > MAX_SKILL_BODY_BYTES || input.content.includes("\0")) throw new TypeError("invalid skill content");
    if (input.description.length > 1024 || input.whenToUse !== void 0 && input.whenToUse.length > 2048) throw new TypeError("invalid skill metadata");
    const directory = resolve(this.root, input.name);
    const target = join3(directory, "SKILL.md");
    if (!isWithin(this.root, target) || dirname2(directory) !== resolve(this.root)) throw new TypeError("skill path escapes user root");
    await mkdir2(directory, { recursive: true });
    const temporary = join3(directory, `.SKILL.${process.pid}.${Date.now()}.tmp`);
    const text = ["---", `name: ${JSON.stringify(input.name)}`, `description: ${JSON.stringify(input.description)}`, ...input.whenToUse ? [`whenToUse: ${JSON.stringify(input.whenToUse)}`] : [], `user-invocable: ${input.userInvocable}`, `disable-model-invocation: ${!input.modelInvocable}`, "---", "", input.content, ""].join("\n");
    try {
      await writeFile(temporary, text, { encoding: "utf8", mode: 384 });
      await rename2(temporary, target);
    } catch (error) {
      await rm2(temporary, { force: true }).catch(() => void 0);
      throw error;
    }
  }
  async delete(name2) {
    if (!isSkillName(name2)) throw new TypeError("invalid skill name");
    const directory = resolve(this.root, name2);
    if (!isWithin(this.root, directory) || dirname2(directory) !== resolve(this.root)) throw new TypeError("skill path escapes user root");
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
  constructor(root = join4(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".dsh", "skills")) {
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
function applySkillApi(ctx, reconciler, root = join4(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".dsh", "skills")) {
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
function applyDynamicRuntime(ctx, initialConfig, getPentestswarmApiKey = () => void 0, skillsReconciler = new SkillsReconciler()) {
  const mcp = new McpReconciler(ctx, getPentestswarmApiKey);
  const controller = new RuntimeController(initialConfig, [mcp, skillsReconciler, new RulesReconciler(ctx)]);
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
var PI_AI_SETTINGS_ENTRY_ID = "llm-pi-ai";
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
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    const current = ctx.settings.describe().find((entry) => entry.ns === PI_AI_SETTINGS_ENTRY_ID)?.value;
    const providers = current?.providers;
    if (providers !== void 0 && Object.keys(providers).length > 0) {
      const result = fillReasoningEfforts(providers);
      if (result === void 0) return 0;
      await ctx.settings.update(PI_AI_SETTINGS_ENTRY_ID, { providers: result.providers });
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
var inject = [
  "skills",
  "sessions",
  "storageDomain",
  "commands",
  "tools",
  "agents",
  "goals",
  "llm",
  "webServer",
  "subprocess",
  "settings",
  "systemPrompt"
];
var Config = z6.object({
  autoLoop: AutoLoopConfigSchema,
  mcpServers: z6.array(McpServerSchema).default(DEFAULT_MCP_SERVERS.map((server) => ({ ...server }))).volatile(),
  disabledSkills: z6.array(z6.string()).default([]).volatile(),
  rules: z6.array(RuntimeRuleSchema).default([]).volatile(),
  thinkingPolicies: z6.array(ChannelThinkingPolicySchema).default([]).volatile(),
  thinkingFallbacks: z6.array(ThinkingFallbackPolicySchema).default([]).volatile(),
  // Omitted means the built-in fallback; explicit null disables it.
  defaultThinkingFallback: z6.union([SimulatedEffortsSchema, z6.const(null)]).volatile(),
  pentestswarmApiKey: z6.string().role("secret").volatile()
});
function apply(ctx, config) {
  const skillsReconciler = new SkillsReconciler();
  ctx.skills.registerProvider((control) => skillsReconciler.provider(control));
  applyModelAdaptation(ctx);
  applyAutoLoop(ctx, config.autoLoop ?? {});
  if (config.autoLoop?.enabled !== false) {
    applyExperience(ctx, { stallThreshold: config.autoLoop?.stallThreshold ?? 3 });
  }
  const runtimeConfig = () => structuredClone({
    mcpServers: config.mcpServers.get(),
    disabledSkills: config.disabledSkills.get(),
    rules: config.rules.get(),
    thinkingPolicies: config.thinkingPolicies.get(),
    thinkingFallbacks: config.thinkingFallbacks.get(),
    defaultThinkingFallback: config.defaultThinkingFallback.get()
  });
  const runtime = applyDynamicRuntime(ctx, runtimeConfig(), () => config.pentestswarmApiKey.get(), skillsReconciler);
  ctx.on("loader/volatile-update", (paths) => {
    if (!paths.some(([field]) => field === "mcpServers" || field === "disabledSkills" || field === "rules" || field === "thinkingPolicies" || field === "thinkingFallbacks" || field === "defaultThinkingFallback" || field === "pentestswarmApiKey")) return;
    void runtime.controller.update(runtimeConfig());
  });
  applyRuntimeStatus(ctx, runtime.controller, runtime.mcp);
  applyRuntimeConfigApi(ctx, runtime.controller);
  applyThinkingPolicyApi(ctx, runtime.thinking);
  applyInstallApi(ctx);
  applySkillApi(ctx, skillsReconciler);
  void reconcilePiAiReasoning(ctx).catch(() => void 0);
  const stopAdaptive = installPiAiAdaptiveThinking(ctx);
  ctx.effect(() => stopAdaptive, "ant-sword-runtime.pi-ai-adaptive-thinking");
}
export {
  Config,
  apply,
  inject,
  name
};
