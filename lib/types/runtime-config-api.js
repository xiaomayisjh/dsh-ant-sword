/** Loopback configuration bridge for Ant Sword's private settings namespace. */
import { SettingsConflictError, settingsNamespace, } from '@deepseek-ai/dsh-settings';
import { ANT_SWORD_SETTINGS_NAMESPACE, } from "./runtime-config.js";
const MAX_BODY_BYTES = 512 * 1024;
const MUTABLE_FIELDS = new Set(['mcpServers', 'disabledSkills', 'rules']);
const NAMESPACE = settingsNamespace(ANT_SWORD_SETTINGS_NAMESPACE);
function sendJson(res, status, value) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(value));
}
async function readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const bytes = Buffer.from(chunk);
        size += bytes.byteLength;
        if (size > MAX_BODY_BYTES)
            throw new TypeError(`request body exceeds ${String(MAX_BODY_BYTES)} bytes`);
        chunks.push(bytes);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isLoopbackRequest(req) {
    const address = req.socket.remoteAddress;
    return address === '127.0.0.1' || address === '::1' || address?.startsWith('::ffff:127.') === true;
}
function optionalRevision(value) {
    if (value === undefined)
        return undefined;
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError('expectedRevision must be a non-negative safe integer');
    }
    return value;
}
export function parseRuntimeConfigMutation(value) {
    if (!isRecord(value))
        throw new TypeError('runtime config request must be a JSON object');
    if (value.op !== 'set' && value.op !== 'unset')
        throw new TypeError('op must be "set" or "unset"');
    if (typeof value.field !== 'string' || !MUTABLE_FIELDS.has(value.field)) {
        throw new TypeError('field must be one of mcpServers, disabledSkills, or rules');
    }
    const allowed = value.op === 'set'
        ? new Set(['op', 'field', 'value', 'expectedRevision'])
        : new Set(['op', 'field', 'expectedRevision']);
    if (Object.keys(value).some(key => !allowed.has(key)))
        throw new TypeError('runtime config request contains unsupported fields');
    const expectedRevision = optionalRevision(value.expectedRevision);
    const field = value.field;
    if (value.op === 'unset')
        return { op: 'unset', field, ...(expectedRevision === undefined ? {} : { expectedRevision }) };
    if (!Object.hasOwn(value, 'value'))
        throw new TypeError('set requires value');
    return { op: 'set', field, value: value.value, ...(expectedRevision === undefined ? {} : { expectedRevision }) };
}
function descriptor(settings) {
    const found = settings.describe({ redactSecrets: true }).find(candidate => candidate.ns === NAMESPACE);
    if (found === undefined)
        throw new Error(`settings namespace "${ANT_SWORD_SETTINGS_NAMESPACE}" is not registered`);
    return found;
}
export function runtimeConfigApiView(settings, controller) {
    const settingsView = descriptor(settings);
    const runtime = controller.snapshot();
    return {
        value: settingsView.value,
        ...(settingsView.base === undefined ? {} : { base: settingsView.base }),
        ...(settingsView.user === undefined ? {} : { user: settingsView.user }),
        revision: settingsView.revision,
        writable: settings.writable,
        generation: runtime.generation,
        applying: runtime.applying,
        ...(runtime.lastFailure === undefined ? {} : { lastFailure: runtime.lastFailure }),
    };
}
export async function mutateRuntimeConfig(settings, controller, mutation) {
    const op = mutation.op === 'set'
        ? { op: 'set', path: [mutation.field], value: mutation.value }
        : { op: 'unset', path: [mutation.field] };
    await settings.mutate(NAMESPACE, [op], mutation.expectedRevision);
    // Settings commits enqueue owner watchers on their per-listener microtask
    // chain. Yield once so RuntimeController observes the generation before its
    // quiescence promise is sampled.
    await Promise.resolve();
    await controller.whenIdle();
    return runtimeConfigApiView(settings, controller);
}
export function applyRuntimeConfigApi(ctx, controller) {
    ctx.webServer.register({
        kind: 'exact',
        path: '/ant-sword/runtime-config',
        handler: async (req, res) => {
            if (!isLoopbackRequest(req)) {
                sendJson(res, 403, { error: 'loopback-only' });
                return;
            }
            if (req.method === 'GET') {
                try {
                    sendJson(res, 200, runtimeConfigApiView(ctx.settings, controller));
                }
                catch (error) {
                    sendJson(res, 503, { error: error instanceof Error ? error.message : String(error) });
                }
                return;
            }
            if (req.method !== 'POST') {
                sendJson(res, 405, { error: 'method-not-allowed' });
                return;
            }
            try {
                const mutation = parseRuntimeConfigMutation(await readJson(req));
                sendJson(res, 200, await mutateRuntimeConfig(ctx.settings, controller, mutation));
            }
            catch (error) {
                const status = error instanceof SettingsConflictError ? 409 : error instanceof TypeError ? 400 : 500;
                sendJson(res, status, { error: error instanceof Error ? error.message : String(error) });
            }
        },
    });
}
//# sourceMappingURL=runtime-config-api.js.map