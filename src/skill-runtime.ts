/** Skill catalog, disable overlay, and safe user-skill persistence. */
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { isSkillName, type SkillCandidate, type SkillProvider, type SkillProviderControl } from '@deepseek-ai/dsh-skill'
import { skillProvider } from './skills.ts'
import { SkillCatalog } from './skill-catalog.ts'
import type { AntSwordRuntimeConfig, RuntimePreparedChange, RuntimeReconciler } from './runtime-config.ts'

const MAX_BODY_BYTES = 128 * 1024
function sendJson(res: ServerResponse, status: number, value: unknown): void { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)) }
async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = []; let bytes = 0
  for await (const chunk of req) { const part = Buffer.from(chunk as Uint8Array); bytes += part.byteLength; if (bytes > MAX_BODY_BYTES) throw new TypeError('skill request body is too large'); chunks.push(part) }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new TypeError('skill request must be an object')
  return parsed as Record<string, unknown>
}

export class SkillsReconciler implements RuntimeReconciler {
  readonly name = 'skills'; private disabled = new Set<string>(); private invalidate: () => void = () => undefined; private readonly catalog: SkillCatalog
  constructor(root = join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh', 'skills')) { this.catalog = new SkillCatalog(root) }
  provider(control: SkillProviderControl): SkillProvider {
    this.invalidate = control.invalidate
    return { name: skillProvider.name, list: async () => ({ candidates: (await this.catalog.list()).filter(candidate => !this.disabled.has(candidate.name)), complete: true }), get: async (candidate: SkillCandidate, options) => { if (this.disabled.has(candidate.name)) return undefined; const loaded = await this.catalog.get(candidate.name); return loaded ?? await skillProvider.get(candidate, options) } }
  }
  prepare(next: AntSwordRuntimeConfig, _previousConfig: AntSwordRuntimeConfig): RuntimePreparedChange {
    const previous = this.disabled; const desired = new Set(next.disabledSkills)
    return { commit: () => { this.disabled = desired; this.invalidate() }, rollback: () => { this.disabled = previous; this.invalidate() } }
  }
  refresh(): void { this.invalidate() }
}

export function applySkillApi(ctx: Context, reconciler: SkillsReconciler, root = join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh', 'skills')): void {
  const catalog = new SkillCatalog(root)
  ctx.webServer.register({ kind: 'exact', path: '/ant-sword/skills/list', handler: async (req, res) => {
    if (req.method !== 'GET') { sendJson(res, 405, { error: 'method-not-allowed' }); return }
    try { const skills = await catalog.list(); sendJson(res, 200, { skills: skills.map(skill => ({ ...skill, userOwned: skill.source === 'user-dsh' })) }) } catch (error) { sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) }) }
  } })
  ctx.webServer.register({ kind: 'exact', path: '/ant-sword/skills/detail', handler: async (req, res) => {
    if (req.method !== 'GET') { sendJson(res, 405, { error: 'method-not-allowed' }); return }
    try { const name = new URL(req.url ?? '', 'http://localhost').searchParams.get('name'); if (name === null || !isSkillName(name)) throw new TypeError('invalid skill name'); const skill = await catalog.get(name); if (skill === undefined) { sendJson(res, 404, { error: 'skill-not-found' }); return }; sendJson(res, 200, { skill }) } catch (error) { sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) }) }
  } })
  ctx.webServer.register({ kind: 'exact', path: '/ant-sword/skills/upsert', handler: async (req, res) => {
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'method-not-allowed' }); return }
    try { const body = await readBody(req); const allowed = ['name', 'description', 'whenToUse', 'modelInvocable', 'userInvocable', 'content']; if (Object.keys(body).some(key => !allowed.includes(key))) throw new TypeError('unsupported skill field'); if (typeof body.name !== 'string' || !isSkillName(body.name) || typeof body.description !== 'string' || typeof body.modelInvocable !== 'boolean' || typeof body.userInvocable !== 'boolean' || typeof body.content !== 'string') throw new TypeError('invalid skill payload'); if (body.whenToUse !== undefined && typeof body.whenToUse !== 'string') throw new TypeError('invalid skill whenToUse'); await catalog.write({ name: body.name, description: body.description, ...(typeof body.whenToUse === 'string' ? { whenToUse: body.whenToUse } : {}), modelInvocable: body.modelInvocable, userInvocable: body.userInvocable, content: body.content }); reconciler.refresh(); sendJson(res, 200, { name: body.name }) } catch (error) { sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) }) }
  } })
  ctx.webServer.register({ kind: 'exact', path: '/ant-sword/skills/delete', handler: async (req, res) => {
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'method-not-allowed' }); return }
    try { const body = await readBody(req); if (Object.keys(body).some(key => key !== 'name') || typeof body.name !== 'string' || !isSkillName(body.name)) throw new TypeError('invalid skill name'); await catalog.delete(body.name); reconciler.refresh(); sendJson(res, 200, { name: body.name, fallback: (await catalog.get(body.name)) !== undefined }) } catch (error) { sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) }) }
  } })
}