window.__ModuleLoader__.load({ id: "@deepseek-ai/dsh-client-ui-autograph", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// vendor/ui-autograph/src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_client2 = require("@deepseek-ai/dsh-client-runtime/client");

// vendor/ui-autograph/src/client/AutoGraphView.tsx
var import_react10 = require("react");
var import_react11 = require("@xyflow/react");

// vendor/ui-autograph/src/client/RuntimeStatus.tsx
var import_react6 = require("react");

// vendor/ui-autograph/src/client/RuntimeConfigEditor.tsx
var import_react5 = require("react");

// vendor/ui-autograph/src/client/McpConfigEditor.tsx
var import_react = require("react");

// vendor/ui-autograph/src/client/mcp-config-json.ts
var McpJsonError = class extends Error {
  name = "McpJsonError";
};
function fail(message) {
  throw new McpJsonError(`${message} \u8BF7\u4FEE\u6B63 JSON \u540E\u91CD\u8BD5\uFF1B\u5F53\u524D\u53EF\u89C6\u5316\u914D\u7F6E\u4E0D\u4F1A\u88AB\u8986\u76D6\u3002`);
}
function stringRecord(value, field, serverName) {
  if (value === void 0) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`MCP\u201C${serverName}\u201D\u7684 ${field} \u5FC5\u987B\u662F\u952E\u503C\u5BF9\u8C61\u3002`);
  const entries = Object.entries(value);
  if (entries.some(([, item]) => typeof item !== "string")) fail(`MCP\u201C${serverName}\u201D\u7684 ${field} \u503C\u5FC5\u987B\u5168\u90E8\u662F\u5B57\u7B26\u4E32\u3002`);
  return Object.fromEntries(entries);
}
function stringArray(value, serverName) {
  if (value === void 0) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) fail(`MCP\u201C${serverName}\u201D\u7684 args \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4\u3002`);
  return value;
}
function normalizeImportedMcp(fallbackName, value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`MCP\u201C${fallbackName}\u201D\u5FC5\u987B\u662F\u5BF9\u8C61\u3002`);
  const input = value;
  const serverName = typeof input.serverName === "string" ? input.serverName : typeof input.name === "string" ? input.name : fallbackName;
  if (serverName.trim() === "") fail("\u6BCF\u4E2A MCP \u90FD\u9700\u8981\u975E\u7A7A\u540D\u79F0\u3002");
  const requested = input.transport ?? input.type;
  const transport = requested === "sse" ? "sse" : requested === "streamable-http" || requested === "http" ? "streamable-http" : requested === "stdio" || typeof input.command === "string" ? "stdio" : typeof input.url === "string" ? "streamable-http" : fail(`MCP\u201C${serverName}\u201D\u9700\u8981 command\uFF08stdio\uFF09\u6216 url\uFF08HTTP\uFF09\u3002`);
  if (input.enabled !== void 0 && typeof input.enabled !== "boolean") fail(`MCP\u201C${serverName}\u201D\u7684 enabled \u5FC5\u987B\u662F\u5E03\u5C14\u503C\u3002`);
  if (input.toolCallTimeoutMs !== void 0 && (typeof input.toolCallTimeoutMs !== "number" || input.toolCallTimeoutMs <= 0)) {
    fail(`MCP\u201C${serverName}\u201D\u7684 toolCallTimeoutMs \u5FC5\u987B\u662F\u6B63\u6570\u3002`);
  }
  const common = {
    serverName,
    enabled: input.enabled ?? true,
    transport,
    toolCallTimeoutMs: input.toolCallTimeoutMs ?? 6e4
  };
  if (transport === "stdio") {
    if (input.command !== void 0 && typeof input.command !== "string") fail(`MCP\u201C${serverName}\u201D\u7684 command \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u3002`);
    if (input.cwd !== void 0 && typeof input.cwd !== "string") fail(`MCP\u201C${serverName}\u201D\u7684 cwd \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u3002`);
    return {
      ...common,
      command: input.command ?? "",
      args: stringArray(input.args, serverName),
      cwd: input.cwd ?? "",
      env: stringRecord(input.env, "env", serverName)
    };
  }
  if (input.url !== void 0 && typeof input.url !== "string") fail(`MCP\u201C${serverName}\u201D\u7684 url \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u3002`);
  return { ...common, url: input.url ?? "", headers: stringRecord(input.headers, "headers", serverName) };
}
function normalizeArray(values) {
  return values.map((value, index) => normalizeImportedMcp(`server-${index + 1}`, value));
}
function parseMcpJson(source) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const detail = error instanceof SyntaxError ? error.message : String(error);
    fail(`JSON \u89E3\u6790\u5931\u8D25\uFF1A${detail}`);
  }
  if (Array.isArray(parsed)) return normalizeArray(parsed);
  if (parsed === null || typeof parsed !== "object") fail("MCP JSON \u9876\u5C42\u5FC5\u987B\u662F\u5BF9\u8C61\u6216\u6570\u7EC4\u3002");
  const root = parsed;
  const catalog = root.mcpServers ?? parsed;
  if (Array.isArray(catalog)) return normalizeArray(catalog);
  if (typeof catalog !== "object") fail("mcpServers \u5FC5\u987B\u662F\u547D\u540D\u5BF9\u8C61\u6216\u6570\u7EC4\u3002");
  return Object.entries(catalog).map(([serverName, value]) => normalizeImportedMcp(serverName, value));
}
function formatMcpJson(servers) {
  return JSON.stringify({
    mcpServers: Object.fromEntries(servers.map(({ serverName, ...config }) => [serverName, config]))
  }, void 0, 2);
}

// vendor/ui-autograph/src/client/mcp-editor-state.ts
function createMcpServer(servers) {
  const names = new Set(servers.map((server) => server.serverName));
  let suffix = servers.length + 1;
  while (names.has(`server-${suffix}`)) suffix += 1;
  return { enabled: true, serverName: `server-${suffix}`, transport: "stdio", command: "", args: [], env: {}, toolCallTimeoutMs: 6e4 };
}
function copyMcpServer(server, servers) {
  const names = new Set(servers.map((item) => item.serverName));
  const base = `${server.serverName}-copy`;
  let name = base;
  let suffix = 2;
  while (names.has(name)) name = `${base}-${suffix++}`;
  return { ...structuredClone(server), serverName: name };
}
function switchMcpTransport(server, transport) {
  const common = {
    serverName: server.serverName,
    enabled: server.enabled ?? true,
    transport,
    toolCallTimeoutMs: server.toolCallTimeoutMs ?? 6e4
  };
  return transport === "stdio" ? { ...common, command: "", args: [], cwd: "", env: {} } : { ...common, url: "", headers: {} };
}
function validateMcpServers(servers) {
  const issues = [];
  const names = /* @__PURE__ */ new Set();
  for (const server of servers) {
    const name = server.serverName.trim();
    if (name === "") issues.push({ message: "\u670D\u52A1\u5668\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A\u3002" });
    else if (names.has(name)) issues.push({ serverName: name, message: `\u670D\u52A1\u5668\u540D\u79F0\u201C${name}\u201D\u91CD\u590D\u3002` });
    else names.add(name);
    if (server.transport === "stdio" && (server.command ?? "").trim() === "") {
      issues.push({ serverName: name, message: `MCP\u201C${name || "\u672A\u547D\u540D"}\u201D\u9700\u8981\u542F\u52A8\u547D\u4EE4\u3002` });
    }
    if (server.transport !== "stdio" && (server.url ?? "").trim() === "") {
      issues.push({ serverName: name, message: `MCP\u201C${name || "\u672A\u547D\u540D"}\u201D\u9700\u8981 URL\u3002` });
    }
    if ((server.toolCallTimeoutMs ?? 0) <= 0) {
      issues.push({ serverName: name, message: `MCP\u201C${name || "\u672A\u547D\u540D"}\u201D\u7684\u5DE5\u5177\u8D85\u65F6\u5FC5\u987B\u5927\u4E8E 0\u3002` });
    }
  }
  return issues;
}
function mcpServersEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

// vendor/ui-autograph/src/client/RuntimeStatus.module.css
var RuntimeStatus_default = {
  rail: "RuntimeStatus_rail",
  metric: "RuntimeStatus_metric",
  warning: "RuntimeStatus_warning",
  settings: "RuntimeStatus_settings",
  settingsHeader: "RuntimeStatus_settingsHeader",
  card: "RuntimeStatus_card",
  summary: "RuntimeStatus_summary",
  cardTitle: "RuntimeStatus_cardTitle",
  skillCard: "RuntimeStatus_skillCard",
  grid: "RuntimeStatus_grid",
  installToolbar: "RuntimeStatus_installToolbar",
  installActions: "RuntimeStatus_installActions",
  installError: "RuntimeStatus_installError",
  installProgress: "RuntimeStatus_installProgress",
  configEditor: "RuntimeStatus_configEditor",
  tabs: "RuntimeStatus_tabs",
  editorActions: "RuntimeStatus_editorActions",
  editorList: "RuntimeStatus_editorList",
  keyValues: "RuntimeStatus_keyValues",
  mcpEditor: "RuntimeStatus_mcpEditor",
  mcpHeader: "RuntimeStatus_mcpHeader",
  serverRailHeader: "RuntimeStatus_serverRailHeader",
  detailToolbar: "RuntimeStatus_detailToolbar",
  runtimeActions: "RuntimeStatus_runtimeActions",
  saveBar: "RuntimeStatus_saveBar",
  serverRail: "RuntimeStatus_serverRail",
  emptyDetail: "RuntimeStatus_emptyDetail",
  editorMessage: "RuntimeStatus_editorMessage",
  jsonEditor: "RuntimeStatus_jsonEditor",
  modeSwitch: "RuntimeStatus_modeSwitch",
  masterDetail: "RuntimeStatus_masterDetail",
  serverDetail: "RuntimeStatus_serverDetail",
  detailFields: "RuntimeStatus_detailFields",
  validation: "RuntimeStatus_validation"
};

// vendor/ui-autograph/src/client/McpKeyValueEditor.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function McpKeyValueEditor({ label, value, onChange }) {
  const entries = Object.entries(value);
  const update = (index, key2, itemValue) => {
    onChange(Object.fromEntries(entries.map((entry, at) => at === index ? [key2, itemValue] : entry)));
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", { className: RuntimeStatus_default.keyValues, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("legend", { children: label }),
    entries.map(([key2, itemValue], index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { "aria-label": `${label}\u540D\u79F0 ${index + 1}`, placeholder: "\u540D\u79F0", value: key2, onChange: (event) => {
        update(index, event.target.value, itemValue);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { "aria-label": `${label}\u503C ${index + 1}`, placeholder: "\u503C", value: itemValue, onChange: (event) => {
        update(index, key2, event.target.value);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "aria-label": `\u5220\u9664${label} ${key2 || index + 1}`, onClick: () => {
        onChange(Object.fromEntries(entries.filter((_, at) => at !== index)));
      }, children: "\u5220\u9664" })
    ] }, `${index}-${key2}`)),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", onClick: () => {
      onChange({ ...value, [`KEY_${entries.length + 1}`]: "" });
    }, children: [
      "\u6DFB\u52A0",
      label
    ] })
  ] });
}
function withMcpMap(server, field, value) {
  return { ...server, [field]: value };
}

// vendor/ui-autograph/src/client/McpConfigEditor.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function replaceServer(servers, index, value) {
  return servers.map((server, at) => at === index ? value : server);
}
function McpConfigEditor({ servers, savedServers, saving, onChange, onSave }) {
  const [mode, setMode] = (0, import_react.useState)("visual");
  const [selectedIndex, setSelectedIndex] = (0, import_react.useState)(servers.length === 0 ? -1 : 0);
  const [jsonDraft, setJsonDraft] = (0, import_react.useState)(() => formatMcpJson(servers));
  const [message, setMessage] = (0, import_react.useState)();
  const [probes, setProbes] = (0, import_react.useState)({});
  const [operations, setOperations] = (0, import_react.useState)({});
  const dirty = !mcpServersEqual(servers, savedServers);
  const issues = (0, import_react.useMemo)(() => validateMcpServers(servers), [servers]);
  const selected = selectedIndex >= 0 ? servers[selectedIndex] : void 0;
  (0, import_react.useEffect)(() => {
    if (servers.length > 0 && selectedIndex < 0) setSelectedIndex(0);
    else if (selectedIndex >= servers.length) setSelectedIndex(servers.length - 1);
  }, [selectedIndex, servers.length]);
  const update = (index, value) => {
    const next = replaceServer(servers, index, value);
    onChange(next);
    setJsonDraft(formatMcpJson(next));
  };
  const add = () => {
    const next = [...servers, createMcpServer(servers)];
    onChange(next);
    setJsonDraft(formatMcpJson(next));
    setSelectedIndex(next.length - 1);
  };
  const copy = () => {
    if (selected === void 0) return;
    const next = [...servers, copyMcpServer(selected, servers)];
    onChange(next);
    setJsonDraft(formatMcpJson(next));
    setSelectedIndex(next.length - 1);
  };
  const remove = () => {
    if (selected === void 0) return;
    const next = servers.filter((_, index) => index !== selectedIndex);
    onChange(next);
    setJsonDraft(formatMcpJson(next));
    setSelectedIndex(Math.min(selectedIndex, next.length - 1));
  };
  const importJson = () => {
    try {
      const next = parseMcpJson(jsonDraft);
      onChange(next);
      setSelectedIndex(next.length === 0 ? -1 : 0);
      setJsonDraft(formatMcpJson(next));
      setMessage(`\u5DF2\u5E94\u7528 ${next.length} \u4E2A MCP \u5230\u53EF\u89C6\u5316\u8349\u7A3F\uFF1B\u4FDD\u5B58\u540E\u5199\u5165\u8FD0\u884C\u65F6\u3002`);
      setMode("visual");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const reset = () => {
    const next = structuredClone(savedServers);
    onChange(next);
    setJsonDraft(formatMcpJson(next));
    setSelectedIndex(next.length === 0 ? -1 : 0);
    setMessage("\u5DF2\u91CD\u7F6E\u4E3A\u4E0A\u6B21\u4FDD\u5B58\u7684 MCP \u914D\u7F6E\u3002");
  };
  const save = async () => {
    if (issues.length > 0) {
      setMessage(`\u4FDD\u5B58\u524D\u8BF7\u4FEE\u6B63\uFF1A${issues[0]?.message ?? "\u914D\u7F6E\u65E0\u6548"}`);
      return;
    }
    await onSave();
    setMessage("MCP \u914D\u7F6E\u5DF2\u4FDD\u5B58\u5E76\u70ED\u5E94\u7528\u3002");
  };
  const runtimeAction = async (action) => {
    if (selected === void 0) return;
    const name = selected.serverName;
    setOperations((current) => ({ ...current, [name]: { action, status: "pending", message: action === "probe" ? "\u6B63\u5728\u6D4B\u6D3B\u2026" : "\u6B63\u5728\u91CD\u8F7D\u2026" } }));
    try {
      const response = await fetch(`/ant-sword/mcp/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ serverName: name })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? `${action} \u8BF7\u6C42\u5931\u8D25\uFF08${response.status}\uFF09`);
      if (action === "probe") setProbes((current) => ({ ...current, [name]: { toolCount: result.toolCount ?? 0, tools: result.tools ?? [] } }));
      setOperations((current) => ({ ...current, [name]: { action, status: "success", message: action === "probe" ? `\u6D4B\u6D3B\u6210\u529F\uFF0C\u53D1\u73B0 ${result.toolCount ?? 0} \u4E2A\u5DE5\u5177\u3002` : "\u70ED\u91CD\u8F7D\u6210\u529F\u3002" } }));
    } catch (error) {
      setOperations((current) => ({ ...current, [name]: { action, status: "error", message: error instanceof Error ? error.message : String(error) } }));
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: RuntimeStatus_default.mcpEditor, "aria-labelledby": "mcp-editor-title", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("header", { className: RuntimeStatus_default.mcpHeader, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { id: "mcp-editor-title", children: "MCP \u670D\u52A1\u5668" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: "\u914D\u7F6E\u672C\u5730 stdio \u6216\u8FDC\u7A0B HTTP MCP \u670D\u52A1\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: RuntimeStatus_default.modeSwitch, role: "group", "aria-label": "MCP \u7F16\u8F91\u6A21\u5F0F", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", "aria-pressed": mode === "visual", onClick: () => {
          setMode("visual");
        }, children: "\u53EF\u89C6\u5316" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", "aria-pressed": mode === "json", onClick: () => {
          setJsonDraft(formatMcpJson(servers));
          setMode("json");
        }, children: "JSON" })
      ] })
    ] }),
    mode === "json" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: RuntimeStatus_default.jsonEditor, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { htmlFor: "mcp-json-source", children: "MCP JSON" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("textarea", { id: "mcp-json-source", spellCheck: false, value: jsonDraft, onChange: (event) => {
        setJsonDraft(event.target.value);
      }, "aria-describedby": "mcp-json-help" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { id: "mcp-json-help", children: "\u652F\u6301\u76F4\u63A5\u7C98\u8D34 mcpServers \u547D\u540D\u5BF9\u8C61\u3001mcpServers \u6570\u7EC4\u6216\u670D\u52A1\u5668\u6570\u7EC4\u3002\u89E3\u6790\u5931\u8D25\u4E0D\u4F1A\u8986\u76D6\u5F53\u524D\u53EF\u89C6\u5316\u8349\u7A3F\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: RuntimeStatus_default.editorActions, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", onClick: importJson, children: "\u5E94\u7528\u5230\u53EF\u89C6\u5316" }) })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: RuntimeStatus_default.masterDetail, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("aside", { className: RuntimeStatus_default.serverRail, "aria-label": "MCP \u670D\u52A1\u5668\u5217\u8868", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: RuntimeStatus_default.serverRailHeader, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: "\u670D\u52A1\u5668" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", onClick: add, children: "\u6DFB\u52A0" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { role: "listbox", "aria-label": "MCP \u670D\u52A1\u5668", "aria-activedescendant": selected === void 0 ? void 0 : `mcp-server-${selectedIndex}`, children: servers.map((server, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "button",
          {
            id: `mcp-server-${index}`,
            type: "button",
            role: "option",
            "aria-selected": index === selectedIndex,
            onClick: () => {
              setSelectedIndex(index);
            },
            onKeyDown: (event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : -1;
              setSelectedIndex((index + step + servers.length) % servers.length);
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: server.serverName || "\u672A\u547D\u540D\u670D\u52A1\u5668" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: server.enabled === false ? "\u5DF2\u505C\u7528" : server.transport })
            ]
          },
          `${index}-${server.serverName}`
        )) }),
        servers.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: "\u5C1A\u672A\u914D\u7F6E\u670D\u52A1\u5668\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: RuntimeStatus_default.serverDetail, children: selected === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: RuntimeStatus_default.emptyDetail, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: "\u6DFB\u52A0\u670D\u52A1\u5668\u540E\u5728\u6B64\u7F16\u8F91\u8BE6\u60C5\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", onClick: add, children: "\u6DFB\u52A0 MCP \u670D\u52A1\u5668" })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: RuntimeStatus_default.detailToolbar, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: RuntimeStatus_default.enableToggle, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: selected.enabled !== false, onChange: (event) => {
              update(selectedIndex, { ...selected, enabled: event.target.checked });
            } }),
            "\u542F\u7528"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", onClick: copy, children: "\u590D\u5236" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", onClick: remove, children: "\u5220\u9664" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: RuntimeStatus_default.detailFields, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
            "\u540D\u79F0",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { value: selected.serverName, onChange: (event) => {
              update(selectedIndex, { ...selected, serverName: event.target.value });
            } })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
            "\u4F20\u8F93",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { value: selected.transport, onChange: (event) => {
              update(selectedIndex, switchMcpTransport(selected, event.target.value));
            }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "stdio", children: "stdio" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "sse", children: "HTTP + SSE\uFF08\u65E7\u7248\uFF09" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "streamable-http", children: "Streamable HTTP" })
            ] })
          ] }),
          selected.transport === "stdio" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
              "\u547D\u4EE4",
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { value: selected.command ?? "", onChange: (event) => {
                update(selectedIndex, { ...selected, command: event.target.value });
              } })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
              "\u53C2\u6570\uFF08\u6BCF\u884C\u4E00\u9879\uFF09",
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("textarea", { value: (selected.args ?? []).join("\n"), onChange: (event) => {
                update(selectedIndex, { ...selected, args: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) });
              } })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
              "\u5DE5\u4F5C\u76EE\u5F55",
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { value: selected.cwd ?? "", onChange: (event) => {
                update(selectedIndex, { ...selected, cwd: event.target.value });
              } })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(McpKeyValueEditor, { label: "\u73AF\u5883\u53D8\u91CF", value: selected.env ?? {}, onChange: (value) => {
              update(selectedIndex, withMcpMap(selected, "env", value));
            } })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
              "URL",
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "url", value: selected.url ?? "", onChange: (event) => {
                update(selectedIndex, { ...selected, url: event.target.value });
              } })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(McpKeyValueEditor, { label: "\u8BF7\u6C42\u5934", value: selected.headers ?? {}, onChange: (value) => {
              update(selectedIndex, withMcpMap(selected, "headers", value));
            } })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
            "\u5DE5\u5177\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "number", min: 1, value: selected.toolCallTimeoutMs ?? 6e4, onChange: (event) => {
              update(selectedIndex, { ...selected, toolCallTimeoutMs: Number(event.target.value) });
            } })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: RuntimeStatus_default.runtimeActions, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", disabled: !selected.serverName || operations[selected.serverName]?.status === "pending", onClick: () => {
            void runtimeAction("probe");
          }, children: "\u6D4B\u6D3B" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", disabled: !selected.serverName || operations[selected.serverName]?.status === "pending", onClick: () => {
            void runtimeAction("reload");
          }, children: "\u70ED\u91CD\u8F7D" }),
          operations[selected.serverName] !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { role: "status", "data-state": operations[selected.serverName]?.status, children: operations[selected.serverName]?.message })
        ] }),
        probes[selected.serverName] !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("details", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("summary", { children: [
            "\u5DF2\u53D1\u73B0 ",
            probes[selected.serverName]?.toolCount,
            " \u4E2A\u5DE5\u5177"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { children: probes[selected.serverName]?.tools.map((tool) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: tool.name }),
            tool.description === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: tool.description })
          ] }, tool.name)) })
        ] })
      ] }) })
    ] }),
    issues.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: RuntimeStatus_default.validation, "aria-label": "MCP \u914D\u7F6E\u95EE\u9898", children: issues.map((issue, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("li", { children: issue.message }, index)) }),
    message !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: RuntimeStatus_default.editorMessage, role: "status", children: message }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("footer", { className: RuntimeStatus_default.saveBar, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: dirty ? "\u6709\u672A\u4FDD\u5B58\u66F4\u6539" : "\u6240\u6709\u66F4\u6539\u5DF2\u4FDD\u5B58" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", disabled: !dirty || saving, onClick: reset, children: "\u91CD\u7F6E" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", disabled: !dirty || saving || issues.length > 0, onClick: () => {
        void save();
      }, children: saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58 MCP" })
    ] })
  ] });
}

// vendor/ui-autograph/src/client/RuleEditor.tsx
var import_react2 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
var PLACEMENTS = ["before-persona", "after-persona", "before-tools", "after-tools"];
function RuleEditor({ rules, saving, onChange, onSave }) {
  const [selectedId, setSelectedId] = (0, import_react2.useState)("");
  const [confirmDelete, setConfirmDelete] = (0, import_react2.useState)(false);
  const sorted = rules.toSorted((a, b) => a.placement.localeCompare(b.placement) || a.order - b.order || a.id.localeCompare(b.id));
  const selected = sorted.find((item) => item.id === selectedId);
  (0, import_react2.useEffect)(() => {
    if (selectedId === "" && sorted.length > 0 && sorted[0] !== void 0) setSelectedId(sorted[0].id);
  }, [selectedId, sorted]);
  const create = () => {
    const id = `rule-${crypto.randomUUID()}`;
    const next = { id, title: "\u65B0\u89C4\u5219", enabled: true, order: 0, placement: "after-persona", content: "" };
    onChange([...rules, next]);
    setSelectedId(id);
  };
  const duplicate = () => {
    if (!selected) return;
    const id = `rule-${crypto.randomUUID()}`;
    onChange([...rules, { ...selected, id, title: `${selected.title} \u526F\u672C` }]);
    setSelectedId(id);
  };
  const remove = () => {
    if (!selected) return;
    onChange(rules.filter((item) => item.id !== selectedId));
    setSelectedId("");
  };
  const patch = (patch2) => {
    onChange(rules.map((item) => item.id === selectedId ? { ...item, ...patch2 } : item));
  };
  const move = (delta) => {
    if (!selected) return;
    patch({ order: selected.order + delta });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: RuntimeStatus_default.editorList, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { children: "Rule \u5217\u8868" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: RuntimeStatus_default.masterDetail, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("aside", { className: RuntimeStatus_default.serverRail, role: "listbox", "aria-label": "Rule \u5217\u8868", children: [
        sorted.map((item) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("button", { role: "option", "aria-selected": item.id === selectedId, onClick: () => setSelectedId(item.id), children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: item.title }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("small", { children: [
            item.placement,
            " \xB7 order ",
            item.order,
            " \xB7 ",
            item.enabled ? "\u542F\u7528" : "\u505C\u7528"
          ] })
        ] }, item.id)),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", onClick: create, children: "+ \u65B0\u589E" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("main", { className: RuntimeStatus_default.serverDetail, children: selected ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: RuntimeStatus_default.detailFields, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { children: [
            "\u6807\u9898",
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("input", { value: selected.title, onChange: (e) => patch({ title: e.target.value }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { children: [
            "\u542F\u7528",
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("input", { type: "checkbox", checked: selected.enabled, onChange: (e) => patch({ enabled: e.target.checked }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { children: [
            "\u4F4D\u7F6E",
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("select", { value: selected.placement, onChange: (e) => patch({ placement: e.target.value }), children: PLACEMENTS.map((p) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: p, children: p }, p)) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { children: [
            "\u987A\u5E8F",
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                type: "number",
                value: selected.order,
                onChange: (e) => patch({ order: Number(e.target.value) })
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", onClick: () => move(1), children: "order +1" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", onClick: () => move(-1), children: "order -1" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { style: { gridColumn: "1 / -1" }, children: [
            "\u6B63\u6587",
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("textarea", { value: selected.content, onChange: (e) => patch({ content: e.target.value }) })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: RuntimeStatus_default.saveBar, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: selected.id }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", onClick: duplicate, children: "\u590D\u5236" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", onClick: () => setConfirmDelete(true), children: "\u5220\u9664" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", disabled: saving, onClick: () => {
            void onSave();
          }, children: "\u4FDD\u5B58" })
        ] }),
        confirmDelete && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { role: "alertdialog", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { children: [
            "\u786E\u8BA4\u5220\u9664\u89C4\u5219 \u201C",
            selected.title,
            "\u201D\uFF1F"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", onClick: () => {
            remove();
            setConfirmDelete(false);
          }, children: "\u786E\u8BA4" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", onClick: () => setConfirmDelete(false), children: "\u53D6\u6D88" })
        ] })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: RuntimeStatus_default.editorMessage, children: "\u9009\u62E9\u6216\u65B0\u5EFA\u4E00\u6761\u89C4\u5219" }) })
    ] })
  ] });
}

// vendor/ui-autograph/src/client/SkillEditor.tsx
var import_react3 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
function SkillEditor({ scopeList, onChange: _onChange, onSave }) {
  const [list, setList] = (0, import_react3.useState)([]);
  const [selectedId, setSelectedId] = (0, import_react3.useState)("");
  const [saving, setSaving] = (0, import_react3.useState)(false);
  const [error, setError] = (0, import_react3.useState)();
  const selected = list.find((item) => item.id === selectedId);
  const filtered = (0, import_react3.useMemo)(() => list.toSorted((a, b) => a.name.localeCompare(b.name)), [list]);
  (0, import_react3.useEffect)(() => {
    setList(scopeList.map((item) => ({ ...item })));
  }, [scopeList]);
  const newSkill = () => {
    const id = `skill-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const next = {
      id,
      name: "",
      description: "",
      whenToUse: "",
      modelInvocable: true,
      userInvocable: true,
      content: "",
      userOwned: false
    };
    setList((current) => [...current, next]);
    setSelectedId(id);
  };
  const updateSelected = (field, value) => {
    setList((current) => current.map((item) => item.id === selectedId ? { ...item, [field]: value } : item));
  };
  const remove = () => {
    if (!selected) return;
    const result = list.filter((item) => item.id !== selectedId);
    setList(result);
    const first = result[0];
    if (first !== void 0) setSelectedId(first.id);
    else setSelectedId("");
  };
  const saveOverlay = async () => {
    if (!selected || !selected.name.trim()) return;
    setSaving(true);
    try {
      setError(void 0);
      await fetch("/ant-sword/skills/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: selected.name.trim(),
          description: selected.description ?? "",
          whenToUse: selected.whenToUse,
          modelInvocable: selected.modelInvocable,
          userInvocable: selected.userInvocable,
          content: selected.content
        })
      }).then(async (response) => {
        const text = await response.text();
        try {
          const json = JSON.parse(text);
          if (!response.ok) throw new Error(json.error ?? "\u4FDD\u5B58\u5931\u8D25");
        } catch {
          if (!response.ok) throw new Error(response.statusText);
        }
        await onSave();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const deleteOverlay = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      setError(void 0);
      const response = await fetch("/ant-sword/skills/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: selected.name })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "\u5220\u9664\u5931\u8D25");
      await onSave();
      remove();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { className: RuntimeStatus_default.editorList, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { children: "Skill \u5217\u8868" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: RuntimeStatus_default.masterDetail, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("aside", { className: RuntimeStatus_default.serverRail, role: "listbox", "aria-label": "Skill \u5217\u8868", children: [
        filtered.map((item) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
          "button",
          {
            role: "option",
            "aria-selected": item.id === selectedId,
            onClick: () => setSelectedId(item.id),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { children: item.name }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("small", { children: [
                item.userOwned ? "\u7528\u6237" : "\u5185\u7F6E",
                " \xB7 ",
                item.description?.slice(0, 50)
              ] })
            ]
          },
          item.id
        )),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", onClick: newSkill, children: "+ \u65B0\u589E" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("main", { className: RuntimeStatus_default.serverDetail, children: selected ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: RuntimeStatus_default.detailFields, children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
            "\u540D\u79F0",
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                placeholder: "name",
                value: selected.name,
                onChange: (e) => updateSelected("name", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
            "\u63CF\u8FF0",
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                placeholder: "description",
                value: selected.description,
                onChange: (e) => updateSelected("description", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
            "\u4F7F\u7528\u65F6\u673A",
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                placeholder: "whenToUse",
                value: selected.whenToUse,
                onChange: (e) => updateSelected("whenToUse", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
            "\u6A21\u578B\u53EF\u8C03\u7528",
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                type: "checkbox",
                checked: selected.modelInvocable,
                onChange: (e) => updateSelected("modelInvocable", e.target.checked)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
            "\u7528\u6237\u53EF\u8C03\u7528",
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                type: "checkbox",
                checked: selected.userInvocable,
                onChange: (e) => updateSelected("userInvocable", e.target.checked)
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { style: { gridColumn: "1 / -1" }, children: [
            "\u6B63\u6587",
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "textarea",
              {
                value: selected.content,
                onChange: (e) => updateSelected("content", e.target.value)
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: RuntimeStatus_default.saveBar, children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: selected.userOwned ? "\u7528\u6237\u8986\u76D6" : "\u53EA\u8BFB\uFF08\u5185\u7F6E\uFF09" }),
          selected.userOwned && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", disabled: saving, onClick: saveOverlay, children: "\u4FDD\u5B58" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", disabled: saving, onClick: deleteOverlay, children: "\u5220\u9664" })
          ] })
        ] }),
        error && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: RuntimeStatus_default.installError, children: error })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: RuntimeStatus_default.editorMessage, children: "\u9009\u62E9\u6216\u65B0\u5EFA\u4E00\u4E2A Skill" }) })
    ] })
  ] });
}

// vendor/ui-autograph/src/client/ThinkingPolicyEditor.tsx
var import_react4 = require("react");
var import_jsx_runtime5 = require("react/jsx-runtime");
var LEVELS = [
  { id: "minimum", label: "\u6700\u4F4E" },
  { id: "low", label: "\u4F4E" },
  { id: "medium", label: "\u4E2D" },
  { id: "high", label: "\u9AD8" },
  { id: "maximum", label: "\u6700\u9AD8" }
];
function key(policy) {
  return `${policy.providerId}\0${policy.modelId}`;
}
function ThinkingPolicyEditor({ policies, saving, onChange, onSave }) {
  const [providers, setProviders] = (0, import_react4.useState)([]);
  const [providerId, setProviderId] = (0, import_react4.useState)("");
  const [modelId, setModelId] = (0, import_react4.useState)("");
  const [capability, setCapability] = (0, import_react4.useState)();
  const [error, setError] = (0, import_react4.useState)();
  const provider = providers.find((item) => item.id === providerId);
  const selected = policies.find((policy) => policy.providerId === providerId && policy.modelId === modelId);
  (0, import_react4.useEffect)(() => {
    void fetch("/ant-sword/thinking/catalog", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("\u6A21\u578B\u6E20\u9053\u76EE\u5F55\u52A0\u8F7D\u5931\u8D25");
      return response.json();
    }).then((result) => {
      setProviders(result.providers);
      const first = result.providers[0];
      if (first !== void 0) {
        setProviderId(first.id);
        setModelId(first.models[0]?.id ?? "");
      }
    }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);
  (0, import_react4.useEffect)(() => {
    if (providerId === "" || modelId === "") {
      setCapability(void 0);
      return;
    }
    const controller = new AbortController();
    setError(void 0);
    void fetch(`/ant-sword/thinking/capability?provider=${encodeURIComponent(providerId)}&model=${encodeURIComponent(modelId)}`, {
      cache: "no-store",
      signal: controller.signal
    }).then(async (response) => {
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message ?? body.error ?? "\u6A21\u578B\u80FD\u529B\u67E5\u8BE2\u5931\u8D25");
      }
      return response.json();
    }).then(setCapability).catch((reason) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => controller.abort();
  }, [modelId, providerId]);
  const chooseProvider = (nextProviderId) => {
    const next = providers.find((item) => item.id === nextProviderId);
    setProviderId(nextProviderId);
    setModelId(next?.models[0]?.id ?? "");
  };
  const setLevel = (level) => {
    const next = { providerId, modelId, level };
    onChange([...policies.filter((policy) => key(policy) !== key(next)), next]);
  };
  const remove = (target) => {
    onChange(policies.filter((policy) => key(policy) !== key(target)));
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: RuntimeStatus_default.editorList, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { children: "\u6E20\u9053\u601D\u8003\u5F3A\u5EA6" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: "\u7EDF\u4E00\u4E94\u6863\u4F1A\u6309\u6A21\u578B\u5B9E\u9645\u66B4\u9732\u7684 effort \u987A\u5E8F\u5355\u8C03\u6620\u5C04\uFF1B\u4E0D\u652F\u6301 reasoning \u7684\u6A21\u578B\u4E0D\u4F1A\u6CE8\u5165\u53C2\u6570\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: RuntimeStatus_default.grid, children: providers.map((item) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("article", { className: RuntimeStatus_default.card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: RuntimeStatus_default.cardTitle, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: item.name }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: item.id })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("small", { children: [
        item.models.length,
        " \u4E2A\u5DF2\u53D1\u73B0\u6A21\u578B \xB7 ",
        policies.filter((policy) => policy.providerId === item.id).length,
        " \u6761\u7B56\u7565"
      ] })
    ] }, item.id)) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("fieldset", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("legend", { children: "\u6A21\u578B\u7B56\u7565" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { children: [
        "\u6E20\u9053",
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("select", { value: providerId, onChange: (event) => chooseProvider(event.target.value), children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "", children: "\u9009\u62E9\u6E20\u9053" }),
          providers.map((item) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("option", { value: item.id, children: [
            item.name,
            " (",
            item.id,
            ")"
          ] }, item.id))
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { children: [
        "\u6A21\u578B",
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("select", { value: provider?.models.some((item) => item.id === modelId) === true ? modelId : "", onChange: (event) => setModelId(event.target.value), children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "", children: "\u81EA\u5B9A\u4E49\u6A21\u578B ID" }),
          provider?.models.map((item) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("option", { value: item.id, children: [
            item.name,
            " (",
            item.id,
            ")"
          ] }, item.id))
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { children: [
        "\u81EA\u5B9A\u4E49\u6A21\u578B ID",
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { value: modelId, onChange: (event) => setModelId(event.target.value.trim()), placeholder: "provider-owned model id" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: RuntimeStatus_default.editorActions, "aria-label": "\u4E94\u6863\u601D\u8003\u5F3A\u5EA6", children: LEVELS.map((level) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "button",
        {
          type: "button",
          disabled: capability?.supported !== true,
          "aria-pressed": selected?.level === level.id,
          onClick: () => setLevel(level.id),
          children: level.label
        },
        level.id
      )) }),
      capability !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("small", { children: capability.supported ? `\u6A21\u578B\u652F\u6301 ${capability.efforts.length} \u6863\uFF1A${capability.efforts.map((effort) => effort.name).join(" / ")}` : "\u8BE5\u6A21\u578B\u4E0D\u652F\u6301 reasoning effort" }),
      error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: RuntimeStatus_default.installError, children: error })
    ] }),
    policies.map((policy) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("article", { className: RuntimeStatus_default.card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: RuntimeStatus_default.cardTitle, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("strong", { children: [
          policy.providerId,
          " / ",
          policy.modelId
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: LEVELS.find((level) => level.id === policy.level)?.label })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", onClick: () => remove(policy), children: "\u5220\u9664\u7B56\u7565" })
    ] }, key(policy))),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: RuntimeStatus_default.editorActions, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", disabled: saving, onClick: () => {
      void onSave();
    }, children: "\u4FDD\u5B58\u601D\u8003\u7B56\u7565" }) })
  ] });
}

// vendor/ui-autograph/src/client/RuntimeConfigEditor.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
var EMPTY = { mcpServers: [], disabledSkills: [], rules: [], thinkingPolicies: [] };
function RuntimeConfigEditor({ configScope }) {
  const snapshot = (0, import_react5.useSyncExternalStore)(
    (listener) => configScope.subscribe(listener),
    () => configScope.getSnapshot()
  );
  const runtime = (0, import_react5.useSyncExternalStore)(
    (listener) => configScope.subscribeRuntime(listener),
    () => configScope.getRuntimeSnapshot()
  );
  const [draft, setDraft] = (0, import_react5.useState)(EMPTY);
  const [tab, setTab] = (0, import_react5.useState)("mcp");
  const [saving, setSaving] = (0, import_react5.useState)(false);
  const [skillList, setSkillList] = (0, import_react5.useState)([]);
  (0, import_react5.useEffect)(() => {
    if (snapshot.status === "ready" && snapshot.value !== void 0) setDraft(structuredClone(snapshot.value));
  }, [snapshot.revision, snapshot.status, snapshot.value]);
  const save = async (field) => {
    setSaving(true);
    try {
      await configScope.set(field, draft[field]);
    } finally {
      setSaving(false);
    }
  };
  const reloadSkills = async () => {
    try {
      const response = await fetch("/ant-sword/skills/list", { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json();
      setSkillList(result.skills.map((s) => ({ ...s, id: s.name, content: s.content ?? "" })));
    } catch {
    }
  };
  (0, import_react5.useEffect)(() => {
    void reloadSkills();
  }, [tab]);
  if (snapshot.status !== "ready" || snapshot.value === void 0) return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: RuntimeStatus_default.installError, children: "\u52A8\u6001\u914D\u7F6E\u5C1A\u672A\u8FDE\u63A5\u5230\u672C\u673A Host\u3002" });
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("section", { className: RuntimeStatus_default.configEditor, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: runtime.lastFailure !== void 0 ? RuntimeStatus_default.installError : RuntimeStatus_default.summary, role: "status", children: runtime.applying ? `\u6B63\u5728\u70ED\u5E94\u7528\u914D\u7F6E\uFF08\u76EE\u6807\u4EE3 ${runtime.desiredGeneration}\uFF09` : runtime.inSync ? `\u5DF2\u70ED\u5E94\u7528\uFF08\u4EE3 ${runtime.generation}\uFF09` : runtime.lastFailure === void 0 ? "\u914D\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u7B49\u5F85\u70ED\u5E94\u7528" : `\u70ED\u5E94\u7528\u5931\u8D25\uFF1A${runtime.lastFailure.reconciler} \xB7 ${runtime.lastFailure.message}` }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("nav", { className: RuntimeStatus_default.tabs, "aria-label": "Red Team \u914D\u7F6E", children: ["mcp", "thinking", "skills", "rules"].map((value) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      "button",
      {
        type: "button",
        "aria-current": tab === value ? "page" : void 0,
        "data-active": tab === value,
        onClick: () => {
          setTab(value);
        },
        children: value === "mcp" ? "MCP" : value === "thinking" ? "\u601D\u8003\u5F3A\u5EA6" : value === "skills" ? "Skills" : "Rules"
      },
      value
    )) }),
    tab === "mcp" && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      McpConfigEditor,
      {
        servers: draft.mcpServers,
        savedServers: snapshot.value.mcpServers,
        saving,
        onChange: (mcpServers) => {
          setDraft((current) => ({ ...current, mcpServers }));
        },
        onSave: () => save("mcpServers")
      }
    ),
    tab === "thinking" && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      ThinkingPolicyEditor,
      {
        policies: draft.thinkingPolicies,
        saving,
        onChange: (thinkingPolicies) => setDraft((current) => ({ ...current, thinkingPolicies })),
        onSave: () => save("thinkingPolicies")
      }
    ),
    tab === "skills" && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      SkillEditor,
      {
        scopeList: skillList,
        onChange: () => {
          void reloadSkills();
        },
        onSave: reloadSkills
      }
    ),
    tab === "rules" && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      RuleEditor,
      {
        rules: draft.rules,
        saving,
        onChange: (rules) => setDraft((current) => ({ ...current, rules: [...rules] })),
        onSave: () => save("rules")
      }
    )
  ] });
}

// vendor/ui-autograph/src/client/RuntimeStatus.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
var STATE_LABEL = {
  available: "\u53EF\u7528",
  configured: "\u5DF2\u914D\u7F6E",
  missing: "\u672A\u5B89\u88C5",
  disabled: "\u5DF2\u505C\u7528"
};
var INITIAL_RUNTIME_STATUS = {
  checkedAt: 0,
  skills: { available: 0, provider: "ant-sword-skills", state: "ready" },
  mcp: [
    ["kali", "stdio", "kali-server-mcp", "pip install kali-server-mcp", "\u5B89\u88C5 kali-server-mcp\uFF0C\u5E76\u786E\u4FDD\u547D\u4EE4\u5DF2\u52A0\u5165 PATH\u3002"],
    ["metasploit", "stdio", "metasploitmcp", "pip install metasploit-mcp", "\u5B89\u88C5 Metasploit MCP bridge\uFF0C\u5E76\u5148\u5B8C\u6210 Metasploit \u521D\u59CB\u5316\u3002"],
    ["hexstrike", "stdio", "hexstrike-ai", "pip install hexstrike-ai", "\u5B89\u88C5 HexStrike AI MCP \u670D\u52A1\u5E76\u5C06\u547D\u4EE4\u52A0\u5165 PATH\u3002"],
    ["pentestswarm", "stdio", "pentestswarm", "pip install pentestswarm", "\u5B89\u88C5 PentestSwarm\uFF0C\u5E76\u914D\u7F6E\u7F16\u6392\u5668 API key\u3002"],
    ["jshook", "stdio", "npx", "npm install -g @jshookmcp/jshook", "\u9700\u8981 Node.js\uFF1B\u4E5F\u53EF\u4FDD\u7559 npx \u6309\u9700\u4E0B\u8F7D\u6A21\u5F0F\u3002"],
    ["anything", "streamable-http", "http://localhost:23816/mcp", void 0, "\u542F\u52A8 AnythingLLM MCP \u670D\u52A1\u3002"],
    ["idapro", "streamable-http", "http://127.0.0.1:13337/mcp", void 0, "\u5728 IDA Pro \u4E2D\u542F\u52A8 MCP \u63D2\u4EF6\u3002"],
    ["ghidra", "streamable-http", "http://localhost:8765/mcp", void 0, "\u5728 Ghidra \u4E2D\u542F\u52A8 MCP \u63D2\u4EF6\u3002"]
  ].map(([serverName, transport, target, installCommand, installHint]) => ({
    serverName,
    transport,
    availability: "missing",
    mounted: false,
    target,
    ...installCommand === void 0 ? {} : { installCommand },
    installHint
  }))
};
var MCP_COMPONENT = {
  jshook: "jshookmcp",
  idapro: "idalib-mcp",
  ghidra: "ghidra-mcp"
};
var EMPTY_INSTALL_VIEW = { components: [], operations: [] };
async function requestInstall(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error ?? `install request failed: ${String(response.status)}`);
  }
}
function RuntimeStatus({ runtimeStatus, configScope, compact = false }) {
  const snapshot = (0, import_react6.useSyncExternalStore)(
    (onStoreChange) => runtimeStatus.subscribe(onStoreChange),
    () => runtimeStatus.getSnapshot()
  );
  const [installView, setInstallView] = (0, import_react6.useState)(EMPTY_INSTALL_VIEW);
  const [sourcePolicy, setSourcePolicy] = (0, import_react6.useState)("auto");
  const [installError, setInstallError] = (0, import_react6.useState)();
  const available = snapshot.mcp.filter((item) => item.availability === "available" || item.availability === "configured").length;
  const missing = snapshot.mcp.filter((item) => item.availability === "missing").length;
  (0, import_react6.useEffect)(() => {
    if (compact) return;
    let disposed = false;
    const refresh = async () => {
      try {
        const [catalogResponse, statusResponse] = await Promise.all([
          fetch("/ant-sword/install/catalog", { cache: "no-store" }),
          fetch("/ant-sword/install/status", { cache: "no-store" })
        ]);
        if (!catalogResponse.ok || !statusResponse.ok) throw new Error("\u5B89\u88C5\u72B6\u6001\u8BF7\u6C42\u5931\u8D25");
        const catalog = await catalogResponse.json();
        const status = await statusResponse.json();
        if (!disposed) setInstallView({ components: catalog.components, operations: status.operations });
      } catch (error) {
        if (!disposed) setInstallError(error instanceof Error ? error.message : String(error));
      }
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 1e3);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [compact]);
  const startInstall = async (componentId) => {
    setInstallError(void 0);
    try {
      await requestInstall("/ant-sword/install/start", { componentId, sourcePolicy });
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : String(error));
    }
  };
  const cancelInstall = async (operationId) => {
    setInstallError(void 0);
    try {
      await requestInstall("/ant-sword/install/cancel", { operationId });
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : String(error));
    }
  };
  if (compact) {
    return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: RuntimeStatus_default.rail, "data-runtime-status": true, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: RuntimeStatus_default.metric, children: [
        "Skills ",
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("strong", { children: snapshot.skills.available })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: RuntimeStatus_default.metric, children: [
        "MCP ",
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("strong", { children: [
          available,
          "/",
          snapshot.mcp.length
        ] })
      ] }),
      missing > 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: RuntimeStatus_default.warning, children: [
        missing,
        " \u9879\u5F85\u5B89\u88C5"
      ] })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("section", { className: RuntimeStatus_default.settings, "data-runtime-settings": true, children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("header", { className: RuntimeStatus_default.settingsHeader, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h2", { children: "Red Team \u8FD0\u884C\u73AF\u5883" }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: "Skill \u4E0E MCP \u4F7F\u7528\u540C\u4E00\u5B9E\u65F6\u72B6\u6001\u6E90\uFF1B\u7F3A\u5931\u7EC4\u4EF6\u4E0D\u4F1A\u4ECE\u914D\u7F6E\u4E2D\u6D88\u5931\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: RuntimeStatus_default.summary, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
          "Skills ",
          snapshot.skills.available
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
          "MCP ",
          available,
          "/",
          snapshot.mcp.length
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: RuntimeStatus_default.installToolbar, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { children: [
        "\u4E0B\u8F7D\u6E90",
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("select", { value: sourcePolicy, onChange: (event) => {
          setSourcePolicy(event.target.value);
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "auto", children: "\u81EA\u52A8" }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "domestic-first", children: "\u56FD\u5185\u4F18\u5148" }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "official-first", children: "\u5B98\u65B9\u4F18\u5148" })
        ] })
      ] }),
      installError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: RuntimeStatus_default.installError, children: installError })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: RuntimeStatus_default.skillCard, "data-state": snapshot.skills.state, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("strong", { children: "Skills" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: snapshot.skills.state === "ready" ? `${snapshot.skills.available} \u4E2A\u5DF2\u53D1\u73B0` : "\u52A0\u8F7D\u5F02\u5E38" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: snapshot.skills.error ?? `Provider: ${snapshot.skills.provider}` })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: RuntimeStatus_default.grid, children: snapshot.mcp.map((server) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("article", { className: RuntimeStatus_default.card, "data-state": server.availability, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: RuntimeStatus_default.cardTitle, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("strong", { children: server.serverName }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
          STATE_LABEL[server.availability],
          " \xB7 ",
          server.mounted ? "\u5DF2\u6302\u8F7D" : "\u672A\u6302\u8F7D"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("code", { children: server.target }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: server.installHint }),
      server.lastProbe !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("details", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("summary", { children: [
          "\u6700\u8FD1\u6D4B\u6D3B\uFF1A",
          server.lastProbe.toolCount,
          " \u4E2A\u5DE5\u5177"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("ul", { children: server.lastProbe.tools.map((tool) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("li", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("code", { children: `mcp__${server.serverName}__${tool.name}` }),
          tool.description !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: tool.description })
        ] }, tool.name)) })
      ] }),
      server.installCommand !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("pre", { children: server.installCommand }),
      (() => {
        const componentId = MCP_COMPONENT[server.serverName];
        if (componentId === void 0) return null;
        const component = installView.components.find((item) => item.id === componentId);
        const operation = [...installView.operations].reverse().find((item) => item.componentId === componentId);
        const active = operation !== void 0 && !["succeeded", "failed", "cancelled", "external-action-required", "restart-required"].includes(operation.phase);
        return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: RuntimeStatus_default.installActions, children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", disabled: component?.supported !== true || active, onClick: () => {
            void startInstall(componentId);
          }, children: operation?.phase === "failed" ? "\u91CD\u8BD5" : "\u4E00\u952E\u8865\u5168" }),
          active && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", onClick: () => {
            void cancelInstall(operation.id);
          }, children: "\u53D6\u6D88" }),
          operation !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: RuntimeStatus_default.installProgress, children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
              operation.phase,
              " \xB7 ",
              Math.round(operation.progress * 100),
              "%"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("progress", { value: operation.progress, max: 1 }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: operation.error ?? operation.logs.at(-1) })
          ] })
        ] });
      })()
    ] }, server.serverName)) }),
    configScope !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(RuntimeConfigEditor, { configScope })
  ] });
}

// vendor/ui-autograph/src/client/GraphOverview.tsx
var import_react7 = require("react");
var import_react8 = require("@xyflow/react");

// vendor/ui-autograph/src/client/AutoGraphView.module.css
var AutoGraphView_default = {
  panel: "AutoGraphView_panel",
  header: "AutoGraphView_header",
  title: "AutoGraphView_title",
  meta: "AutoGraphView_meta",
  status: "AutoGraphView_status",
  filters: "AutoGraphView_filters",
  filterCount: "AutoGraphView_filterCount",
  columnLegend: "AutoGraphView_columnLegend",
  canvas: "AutoGraphView_canvas",
  autographDash: "AutoGraphView_autographDash",
  overview: "AutoGraphView_overview",
  overviewEdge: "AutoGraphView_overviewEdge",
  overviewNode: "AutoGraphView_overviewNode",
  overviewViewport: "AutoGraphView_overviewViewport",
  empty: "AutoGraphView_empty",
  nodeCard: "AutoGraphView_nodeCard",
  nodeHeader: "AutoGraphView_nodeHeader",
  nodeIcon: "AutoGraphView_nodeIcon",
  nodeStatus: "AutoGraphView_nodeStatus",
  nodeLabel: "AutoGraphView_nodeLabel",
  handle: "AutoGraphView_handle",
  controls: "AutoGraphView_controls"
};

// vendor/ui-autograph/src/client/GraphOverview.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
var NODE_WIDTH = 252;
var NODE_HEIGHT = 92;
var PADDING = 40;
function GraphOverview({ nodes, edges }) {
  const viewport = (0, import_react8.useViewport)();
  const { setCenter } = (0, import_react8.useReactFlow)();
  const model = (0, import_react7.useMemo)(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const maxX = Math.max(...nodes.map((node) => node.position.x + NODE_WIDTH), NODE_WIDTH);
    const maxY = Math.max(...nodes.map((node) => node.position.y + NODE_HEIGHT), NODE_HEIGHT);
    return {
      byId,
      width: maxX + PADDING * 2,
      height: maxY + PADDING * 2
    };
  }, [nodes]);
  const locate = (clientX, clientY, svg) => {
    const rect = svg.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width * model.width - PADDING;
    const y = (clientY - rect.top) / rect.height * model.height - PADDING;
    void setCenter(x, y, { zoom: viewport.zoom, duration: 180 });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("aside", { className: AutoGraphView_default.overview, "aria-label": "\u903B\u8F91\u5173\u7CFB\u9E1F\u77B0\u56FE", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
    "svg",
    {
      viewBox: `0 0 ${model.width} ${model.height}`,
      preserveAspectRatio: "xMidYMid meet",
      onPointerDown: (event) => {
        locate(event.clientX, event.clientY, event.currentTarget);
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("g", { transform: `translate(${PADDING} ${PADDING})`, children: [
        edges.map((edge) => {
          const source = model.byId.get(edge.source);
          const target = model.byId.get(edge.target);
          if (source === void 0 || target === void 0) return null;
          const startX = source.position.x + NODE_WIDTH;
          const startY = source.position.y + NODE_HEIGHT / 2;
          const endX = target.position.x;
          const endY = target.position.y + NODE_HEIGHT / 2;
          const middleX = (startX + endX) / 2;
          return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
            "polyline",
            {
              className: AutoGraphView_default.overviewEdge,
              points: `${startX},${startY} ${middleX},${startY} ${middleX},${endY} ${endX},${endY}`
            },
            edge.id
          );
        }),
        nodes.map((node) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          "rect",
          {
            className: AutoGraphView_default.overviewNode,
            "data-kind": node.data.kind,
            x: node.position.x,
            y: node.position.y,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            rx: 10
          },
          node.id
        )),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          "rect",
          {
            className: AutoGraphView_default.overviewViewport,
            x: Math.max(0, -viewport.x / viewport.zoom),
            y: Math.max(0, -viewport.y / viewport.zoom),
            width: Math.min(model.width, 960 / viewport.zoom),
            height: Math.min(model.height, 540 / viewport.zoom),
            rx: 8
          }
        )
      ] })
    }
  ) });
}

// vendor/ui-autograph/src/client/BoardGraphNode.tsx
var import_react9 = require("@xyflow/react");
var import_jsx_runtime9 = require("react/jsx-runtime");
var KIND_LABEL = {
  fact: "\u4E8B\u5B9E",
  goal: "\u76EE\u6807",
  hint: "\u63D0\u793A",
  intent: "\u610F\u56FE"
};
function KindIcon({ kind }) {
  if (kind === "goal") {
    return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("circle", { cx: "12", cy: "12", r: "8" }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("circle", { cx: "12", cy: "12", r: "3" })
    ] });
  }
  if (kind === "fact") {
    return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("path", { d: "M5 5h14v14H5z" }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("path", { d: "m8 12 2.5 2.5L16 9" })
    ] });
  }
  if (kind === "intent") {
    return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("path", { d: "M5 19 19 5" }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("path", { d: "M10 5h9v9" })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("path", { d: "M12 3a7 7 0 0 0-4 12.7V19h8v-3.3A7 7 0 0 0 12 3Z" }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("path", { d: "M9 22h6M9 16h6" })
  ] });
}
function BoardGraphNode({ data }) {
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("article", { className: AutoGraphView_default.nodeCard, "data-kind": data.kind, children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_react9.Handle, { className: AutoGraphView_default.handle, type: "target", position: import_react9.Position.Left }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("header", { className: AutoGraphView_default.nodeHeader, children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: AutoGraphView_default.nodeIcon, children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(KindIcon, { kind: data.kind }) }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: KIND_LABEL[data.kind] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: AutoGraphView_default.nodeStatus, children: data.status })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: AutoGraphView_default.nodeLabel, children: data.label }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_react9.Handle, { className: AutoGraphView_default.handle, type: "source", position: import_react9.Position.Right })
  ] });
}

// vendor/ui-autograph/src/client/AutoGraphView.tsx
var import_jsx_runtime10 = require("react/jsx-runtime");
var NODE_TYPES = { board: BoardGraphNode };
var BOARD_KINDS = ["goal", "intent", "fact", "hint"];
var KIND_COLUMN = new Map(BOARD_KINDS.map((kind, index) => [kind, index]));
var KIND_LABEL2 = {
  fact: "\u4E8B\u5B9E",
  intent: "\u610F\u56FE",
  hint: "\u63D0\u793A",
  goal: "\u76EE\u6807"
};
var KIND_EDGE_COLOR = {
  fact: "var(--dsw-alias-state-success-primary)",
  intent: "var(--dsw-alias-state-business-primary)",
  hint: "var(--dsw-alias-brand-primary-new-colorprimary-new-color)",
  goal: "var(--dsw-alias-state-warn-primary)"
};
function edgeOpacity(node) {
  if (node.status === "open" || node.status === "claimed") return 1;
  if (node.status === "done") return 0.78;
  return 0.52;
}
function toFlow(board) {
  const byKind = /* @__PURE__ */ new Map();
  const sorted = [...board.nodes].sort((left, right) => left.cycle - right.cycle || left.time - right.time);
  const nodes = sorted.map((node) => {
    const row = byKind.get(node.kind) ?? 0;
    byKind.set(node.kind, row + 1);
    return {
      id: node.id,
      type: "board",
      position: { x: (KIND_COLUMN.get(node.kind) ?? 0) * 360, y: row * 156 },
      zIndex: 2,
      data: { label: node.label, kind: node.kind, status: node.status ?? "recorded" }
    };
  });
  const siblingLane = /* @__PURE__ */ new Map();
  const edges = board.nodes.filter((node) => node.parentId !== void 0).map((node) => {
    const parentId = node.parentId;
    const lane = siblingLane.get(parentId) ?? 0;
    siblingLane.set(parentId, lane + 1);
    return {
      id: `${parentId}->${node.id}`,
      source: parentId,
      target: node.id,
      type: "smoothstep",
      zIndex: 1,
      pathOptions: { borderRadius: 10, offset: 28 + lane * 14 },
      animated: node.kind === "intent" && (node.status === "open" || node.status === "claimed"),
      style: {
        stroke: KIND_EDGE_COLOR[node.kind],
        strokeOpacity: edgeOpacity(node),
        strokeWidth: node.status === "open" || node.status === "claimed" ? 2.5 : 1.75
      },
      markerEnd: {
        type: import_react11.MarkerType.ArrowClosed,
        color: KIND_EDGE_COLOR[node.kind]
      }
    };
  });
  return { nodes, edges };
}
var EMPTY_BOARD = {
  nodes: [],
  cycle: 0,
  paused: false,
  complete: false
};
function AutoGraphView({ isAutoMode, runtimeStatus, onPause, onResume, onHint, useProjection, t }) {
  const [hint, setHint] = (0, import_react10.useState)("");
  const [pending, setPending] = (0, import_react10.useState)(false);
  const [enabledKinds, setEnabledKinds] = (0, import_react10.useState)(
    () => new Set(BOARD_KINDS)
  );
  const projectedBoard = useProjection("board");
  const board = projectedBoard ?? EMPTY_BOARD;
  const flow = (0, import_react10.useMemo)(() => toFlow(board), [board]);
  const { nodes, edges } = (0, import_react10.useMemo)(() => {
    const visibleNodes = flow.nodes.filter((node) => enabledKinds.has(node.data.kind));
    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    return {
      nodes: visibleNodes,
      edges: flow.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
    };
  }, [enabledKinds, flow]);
  if (!isAutoMode) return null;
  const status = board.complete ? t("panel.complete") : board.paused ? t("panel.paused") : t("panel.running");
  const run = async (action) => {
    if (pending) return;
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: AutoGraphView_default.panel, "data-autograph": true, children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: AutoGraphView_default.header, children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: AutoGraphView_default.title, children: t("panel.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: AutoGraphView_default.meta, children: t("panel.cycle", { cycle: board.cycle }) }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: AutoGraphView_default.status, "data-paused": board.paused, "data-complete": board.complete, children: status })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(RuntimeStatus, { runtimeStatus, compact: true }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("fieldset", { className: AutoGraphView_default.filters, children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("legend", { children: "\u7B5B\u9009\u56FE\u5757" }),
      BOARD_KINDS.map((kind) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("label", { "data-kind": kind, children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "input",
          {
            type: "checkbox",
            checked: enabledKinds.has(kind),
            onChange: (event) => {
              setEnabledKinds((current) => {
                const next = new Set(current);
                if (event.target.checked) next.add(kind);
                else next.delete(kind);
                return next;
              });
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: KIND_LABEL2[kind] })
      ] }, kind)),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: AutoGraphView_default.filterCount, children: [
        nodes.length,
        "/",
        flow.nodes.length,
        " \u4E2A\u56FE\u5757"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: AutoGraphView_default.columnLegend, "aria-hidden": "true", children: BOARD_KINDS.map((kind) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { "data-kind": kind, children: KIND_LABEL2[kind] }, kind)) }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: AutoGraphView_default.canvas, children: nodes.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: AutoGraphView_default.empty, children: t("panel.empty") }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
      import_react11.ReactFlow,
      {
        nodes,
        edges,
        nodeTypes: NODE_TYPES,
        fitView: true,
        fitViewOptions: { padding: 0.2, maxZoom: 1.25 },
        minZoom: 0.15,
        maxZoom: 2.5,
        nodesDraggable: false,
        nodesConnectable: false,
        elementsSelectable: true,
        panOnDrag: true,
        panOnScroll: true,
        zoomOnPinch: true,
        zoomOnScroll: true,
        zoomOnDoubleClick: true,
        preventScrolling: true,
        proOptions: { hideAttribution: true },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_react11.Background, { gap: 20, size: 1 }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(GraphOverview, { nodes, edges }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_react11.Controls, { showInteractive: false })
        ]
      }
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: AutoGraphView_default.controls, children: [
      board.paused ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", disabled: pending, onClick: () => void run(onResume), children: t("control.resume") }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", disabled: pending, onClick: () => void run(onPause), children: t("control.pause") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        "input",
        {
          type: "text",
          value: hint,
          placeholder: t("control.hintPlaceholder"),
          onChange: (e) => {
            setHint(e.target.value);
          },
          onKeyDown: (e) => {
            if (e.key === "Enter" && hint.trim().length > 0) {
              void run(() => onHint(hint.trim()));
              setHint("");
            }
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        "button",
        {
          type: "button",
          disabled: pending || hint.trim().length === 0,
          onClick: () => {
            void run(() => onHint(hint.trim()));
            setHint("");
          },
          children: t("control.hint")
        }
      )
    ] })
  ] });
}

// vendor/ui-autograph/src/client/runtime-config-scope.ts
var import_client = require("@deepseek-ai/dsh-client-runtime/client");
var ENDPOINT = "/ant-sword/runtime-config";
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isRuntimeConfig(value) {
  return isRecord(value) && Array.isArray(value.mcpServers) && Array.isArray(value.disabledSkills) && Array.isArray(value.rules) && Array.isArray(value.thinkingPolicies);
}
function decodeFailure(value) {
  if (!isRecord(value) || typeof value.reconciler !== "string" || typeof value.message !== "string") return void 0;
  if (!Number.isSafeInteger(value.generation) || value.generation < 0) return void 0;
  return { reconciler: value.reconciler, message: value.message, generation: value.generation };
}
function decodeView(value) {
  if (!isRecord(value) || !isRuntimeConfig(value.value)) return void 0;
  if (!isRuntimeConfig(value.desired) || !isRuntimeConfig(value.applied)) return void 0;
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) return void 0;
  if (!Number.isSafeInteger(value.generation) || value.generation < 0) return void 0;
  if (!Number.isSafeInteger(value.desiredGeneration) || value.desiredGeneration < 0) return void 0;
  if (typeof value.writable !== "boolean" || typeof value.applying !== "boolean" || typeof value.inSync !== "boolean") return void 0;
  const lastFailure = decodeFailure(value.lastFailure);
  return {
    value: value.value,
    desired: value.desired,
    applied: value.applied,
    ...isRecord(value.base) ? { base: value.base } : {},
    ...isRecord(value.user) ? { user: value.user } : {},
    revision: value.revision,
    writable: value.writable,
    generation: value.generation,
    desiredGeneration: value.desiredGeneration,
    applying: value.applying,
    inSync: value.inSync,
    ...lastFailure === void 0 ? {} : { lastFailure }
  };
}
function initialSnapshot() {
  return {
    status: "loading",
    value: void 0,
    base: void 0,
    user: void 0,
    revision: void 0,
    writable: false,
    mode: "host"
  };
}
var RuntimeConfigScope = class {
  constructor(native, request = globalThis.fetch.bind(globalThis)) {
    this.native = native;
    this.request = request;
    this.store = (0, import_client.createSnapshotStore)(initialSnapshot());
    this.unsubscribeNative = native.subscribe(() => {
      this.syncNative();
    });
    this.syncNative();
    void this.refresh();
  }
  native;
  request;
  store;
  runtimeStore = (0, import_client.createSnapshotStore)({
    generation: 0,
    desiredGeneration: 0,
    applying: false,
    inSync: true
  });
  unsubscribeNative;
  tail = Promise.resolve();
  disposed = false;
  getSnapshot() {
    return this.store.getSnapshot();
  }
  subscribe(listener) {
    return this.store.subscribe(listener);
  }
  getRuntimeSnapshot() {
    return this.runtimeStore.getSnapshot();
  }
  subscribeRuntime(listener) {
    return this.runtimeStore.subscribe(listener);
  }
  set(field, value) {
    return this.write({ op: "set", field, value });
  }
  unset(field) {
    return this.write({ op: "unset", field });
  }
  refresh() {
    return this.enqueue(async () => {
      if (this.native.getSnapshot().status === "ready") this.syncNative();
      try {
        const response = await this.request(ENDPOINT, { method: "GET", cache: "no-store" });
        if (!response.ok) return;
        const view = decodeView(await response.json());
        if (view !== void 0) this.accept(view);
      } catch {
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
      if (this.native.getSnapshot().status === "ready") {
        if (operation.op === "set") await this.native.set(operation.field, operation.value);
        else await this.native.unset(operation.field);
        this.syncNative();
        await this.reloadFallback();
        return;
      }
      const revision = this.store.getSnapshot().revision;
      try {
        const response = await this.request(ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            op: operation.op,
            field: operation.field,
            ...operation.op === "set" ? { value: operation.value } : {},
            ...revision === void 0 ? {} : { expectedRevision: revision }
          })
        });
        if (!response.ok) {
          await this.reloadFallback();
          return;
        }
        const view = decodeView(await response.json());
        if (view !== void 0) this.accept(view);
      } catch {
        await this.reloadFallback();
      }
    });
  }
  enqueue(operation) {
    if (this.disposed) return Promise.resolve();
    const task = this.tail.then(async () => {
      if (!this.disposed) await operation();
    });
    this.tail = task.catch(() => void 0);
    return task;
  }
  syncNative() {
    const snapshot = this.native.getSnapshot();
    if (snapshot.status === "ready") this.store.set(snapshot);
  }
  async reloadFallback() {
    try {
      const response = await this.request(ENDPOINT, { method: "GET", cache: "no-store" });
      if (!response.ok) return;
      const view = decodeView(await response.json());
      if (view !== void 0) this.accept(view);
    } catch {
    }
  }
  accept(view) {
    this.runtimeStore.set({
      desired: view.desired,
      applied: view.applied,
      generation: view.generation,
      desiredGeneration: view.desiredGeneration,
      applying: view.applying,
      inSync: view.inSync,
      ...view.lastFailure === void 0 ? {} : { lastFailure: view.lastFailure }
    });
    if (this.native.getSnapshot().status === "ready") return;
    this.store.set({
      status: "ready",
      value: view.value,
      base: view.base,
      user: view.user,
      revision: view.revision,
      writable: view.writable,
      mode: "host"
    });
  }
};

// vendor/ui-autograph/src/client/locales.ts
var en = {
  "panel.title": "Autonomous run",
  "panel.cycle": "cycle {{cycle}}",
  "panel.paused": "paused",
  "panel.complete": "complete",
  "panel.running": "running",
  "panel.empty": "No blackboard yet \u2014 start a red-team-auto session to watch the agent decide.",
  "control.pause": "Pause",
  "control.resume": "Resume",
  "control.hint": "Inject hint",
  "control.hintPlaceholder": 'Steer the agent (e.g. "try the web path instead")\u2026',
  "node.goal": "Goal",
  "node.fact": "Fact",
  "node.intent": "Intent",
  "node.hint": "Hint"
};
var zh = {
  "panel.title": "\u81EA\u4E3B\u6E17\u900F",
  "panel.cycle": "\u5FAA\u73AF {{cycle}}",
  "panel.paused": "\u5DF2\u6682\u505C",
  "panel.complete": "\u5DF2\u5B8C\u6210",
  "panel.running": "\u8FD0\u884C\u4E2D",
  "panel.empty": "\u6682\u65E0\u9ED1\u677F\u6570\u636E\u2014\u2014\u542F\u52A8 red-team-auto \u4F1A\u8BDD\u5373\u53EF\u5B9E\u65F6\u67E5\u770B agent \u51B3\u7B56\u3002",
  "control.pause": "\u6682\u505C",
  "control.resume": "\u7EE7\u7EED",
  "control.hint": "\u6CE8\u5165\u63D0\u793A",
  "control.hintPlaceholder": '\u5E72\u9884 agent\uFF08\u4F8B\u5982"\u6539\u8D70 Web \u8DEF\u5F84"\uFF09\u2026',
  "node.goal": "\u76EE\u6807",
  "node.fact": "\u4E8B\u5B9E",
  "node.intent": "\u610F\u56FE",
  "node.hint": "\u63D0\u793A"
};

// vendor/ui-autograph/src/client/index.ts
var NS = "autograph";
var inject = ["slots", "sessions", "remote", "remote.commands", "locale", "settingsScope", "connection"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "ui-autograph: dictionaries");
  const t = ctx.locale.bind(NS);
  const runtimeStatus = (0, import_client2.createSnapshotStore)(INITIAL_RUNTIME_STATUS);
  const nativeConfigScope = ctx.settingsScope.bind({ namespace: "ant-sword-runtime" });
  const configScope = new RuntimeConfigScope(nativeConfigScope);
  ctx.effect(() => () => configScope.dispose(), "ui-autograph: runtime config scope");
  const refreshRuntimeStatus = async () => {
    const response = await fetch("/ant-sword/runtime-status", { cache: "no-store" });
    if (!response.ok) throw new Error(`runtime status request failed: ${response.status}`);
    runtimeStatus.set(await response.json());
  };
  ctx.effect(() => {
    let disposed = false;
    const refresh = () => {
      void refreshRuntimeStatus().catch((error) => {
        if (!disposed) ctx.logger.warn(error);
      });
    };
    refresh();
    const timer = setInterval(refresh, 5e3);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, "ui-autograph: runtime status polling");
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "red-team-runtime",
    order: 18,
    label: () => "Red Team \u73AF\u5883",
    inject: () => ({ runtimeStatus, configScope })
  }, RuntimeStatus));
  ctx.slots.inject("conversation.view", () => ctx.slots.register({
    name: "conversation.view",
    id: "autograph",
    order: 20,
    locale: NS,
    label: () => t("panel.title"),
    inject: (sessionId) => {
      const run = async (input) => {
        const result = await ctx.remote.commands.execute(sessionId, input);
        if (!result.ok) return `${result.error.message} (${result.error.code})`;
        return null;
      };
      return {
        isAutoMode: ctx.sessions.list.getSnapshot().byId[sessionId]?.agentPreset === "red-team-auto",
        runtimeStatus,
        onPause: () => run("/auto pause"),
        onResume: () => run("/auto resume"),
        onHint: (text) => run(`/auto hint ${text}`)
      };
    }
  }, AutoGraphView));
}
return module.exports; } });
//# sourceMappingURL=client.js.map
