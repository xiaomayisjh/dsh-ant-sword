/** Skill disable overlay and safe user-skill persistence. */
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { isSkillName } from '@deepseek-ai/dsh-skill';
import { skillProvider } from "./skills.js";
const MAX_BODY_BYTES = 128 * 1024;
const MAX_SKILL_BODY_BYTES = 96 * 1024;
function within(root, path) {
    const rel = relative(resolve(root), resolve(path));
    return rel === '' || (!rel.startsWith('..') && !rel.includes(':'));
}
function sendJson(res, status, value) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(value));
}
async function readBody(req) {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
        const part = Buffer.from(chunk);
        bytes += part.byteLength;
        if (bytes > MAX_BODY_BYTES)
            throw new TypeError('skill request body is too large');
        chunks.push(part);
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new TypeError('skill request must be an object');
    return parsed;
}
function scalar(value) {
    return JSON.stringify(value);
}
export class SkillsReconciler {
    name = 'skills';
    disabled = new Set();
    invalidate = () => undefined;
    provider(control) {
        this.invalidate = control.invalidate;
        return {
            name: skillProvider.name,
            list: async (options) => {
                const listed = await skillProvider.list(options);
                if ('candidates' in listed) {
                    return { ...listed, candidates: listed.candidates.filter((candidate) => !this.disabled.has(candidate.name)) };
                }
                return listed.filter(candidate => !this.disabled.has(candidate.name));
            },
            get: async (candidate, options) => {
                if (this.disabled.has(candidate.name))
                    return undefined;
                return skillProvider.get(candidate, options);
            },
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
            },
        };
    }
    refresh() {
        this.invalidate();
    }
}
export function applySkillApi(ctx, reconciler, root = join(homedir(), '.dsh', 'skills')) {
    ctx.webServer.register({
        kind: 'exact', path: '/ant-sword/skills/upsert',
        handler: async (req, res) => {
            if (req.method !== 'POST') {
                sendJson(res, 405, { error: 'method-not-allowed' });
                return;
            }
            try {
                const body = await readBody(req);
                if (Object.keys(body).some(key => !['name', 'description', 'whenToUse', 'modelInvocable', 'userInvocable', 'content'].includes(key)))
                    throw new TypeError('unsupported skill field');
                if (typeof body.name !== 'string' || !isSkillName(body.name))
                    throw new TypeError('invalid skill name');
                if (typeof body.description !== 'string' || body.description.length > 1_024)
                    throw new TypeError('invalid skill description');
                if (body.whenToUse !== undefined && (typeof body.whenToUse !== 'string' || body.whenToUse.length > 2_048))
                    throw new TypeError('invalid skill whenToUse');
                if (typeof body.content !== 'string' || Buffer.byteLength(body.content, 'utf8') > MAX_SKILL_BODY_BYTES || body.content.includes('\0'))
                    throw new TypeError('invalid skill content');
                if (typeof body.modelInvocable !== 'boolean' || typeof body.userInvocable !== 'boolean')
                    throw new TypeError('invalid invocation policy');
                const directory = join(root, body.name);
                const target = join(directory, 'SKILL.md');
                if (!within(root, target))
                    throw new TypeError('skill path escapes user root');
                await mkdir(directory, { recursive: true });
                const temporary = join(directory, `.SKILL.${String(process.pid)}.tmp`);
                const text = [
                    '---',
                    `name: ${scalar(body.name)}`,
                    `description: ${scalar(body.description)}`,
                    ...(typeof body.whenToUse === 'string' && body.whenToUse !== '' ? [`whenToUse: ${scalar(body.whenToUse)}`] : []),
                    `user-invocable: ${body.userInvocable ? 'true' : 'false'}`,
                    `disable-model-invocation: ${body.modelInvocable ? 'false' : 'true'}`,
                    '---', '', body.content, '',
                ].join('\n');
                await writeFile(temporary, text, { encoding: 'utf8', mode: 0o600 });
                await rename(temporary, target);
                reconciler.refresh();
                sendJson(res, 200, { name: body.name });
            }
            catch (error) {
                sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
            }
        },
    });
    ctx.webServer.register({
        kind: 'exact', path: '/ant-sword/skills/delete',
        handler: async (req, res) => {
            if (req.method !== 'POST') {
                sendJson(res, 405, { error: 'method-not-allowed' });
                return;
            }
            try {
                const body = await readBody(req);
                if (Object.keys(body).some(key => key !== 'name') || typeof body.name !== 'string' || !isSkillName(body.name))
                    throw new TypeError('invalid skill name');
                const directory = join(root, body.name);
                if (!within(root, directory) || dirname(directory) !== resolve(root))
                    throw new TypeError('skill path escapes user root');
                await rm(directory, { recursive: true, force: true });
                reconciler.refresh();
                sendJson(res, 200, { name: body.name });
            }
            catch (error) {
                sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
            }
        },
    });
}
//# sourceMappingURL=skill-runtime.js.map