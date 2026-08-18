/** Skill disable overlay and safe user-skill persistence. */

import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import type { SkillCandidate, SkillDefinition, SkillProvider, SkillProviderControl } from '@deepseek-ai/dsh-skill'
import { skillProvider } from './skills.ts'
import type { AntSwordRuntimeConfig, RuntimePreparedChange, RuntimeReconciler } from './runtime-config.ts'

const MAX_BODY_BYTES = 128 * 1024
const MAX_SKILL_BODY_BYTES = 96 * 1024

function within(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path))
  return rel === '' || (!rel.startsWith('..') && !rel.includes(':'))
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = []
  let bytes = 0
  for await (const chunk of req) {
    const part: Uint8Array = Buffer.from(chunk as Uint8Array)
    bytes += part.byteLength
    if (bytes > MAX_BODY_BYTES) throw new TypeError('skill request body is too large')
    chunks.push(part)
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new TypeError('skill request must be an object')
  return parsed as Record<string, unknown>
}

function scalar(value: string): string {
  return JSON.stringify(value)
}

export class SkillsReconciler implements RuntimeReconciler {
  readonly name = 'skills'
  private disabled = new Set<string>()
  private invalidate: () => void = () => undefined

  provider(control: SkillProviderControl): SkillProvider {
    this.invalidate = control.invalidate
    return {
      name: skillProvider.name,
      list: async (options) => {
        const listed = await skillProvider.list(options)
        if ('candidates' in listed) {
          return { ...listed, candidates: listed.candidates.filter((candidate: SkillCandidate) => !this.disabled.has(candidate.name)) }
        }
        return listed.filter(candidate => !this.disabled.has(candidate.name))
      },
      get: async (candidate: SkillCandidate, options): Promise<SkillDefinition | undefined> => {
        if (this.disabled.has(candidate.name)) return undefined
        return skillProvider.get(candidate, options)
      },
    }
  }

  prepare(next: AntSwordRuntimeConfig, _previousConfig: AntSwordRuntimeConfig): RuntimePreparedChange {
    const previous = this.disabled
    const desired = new Set(next.disabledSkills)
    return {
      commit: () => {
        this.disabled = desired
        this.invalidate()
      },
      rollback: () => {
        this.disabled = previous
        this.invalidate()
      },
    }
  }

  refresh(): void {
    this.invalidate()
  }
}

export function applySkillApi(ctx: Context, reconciler: SkillsReconciler, root = join(homedir(), '.dsh', 'skills')): void {
  ctx.webServer.register({
    kind: 'exact', path: '/ant-sword/rules/list',
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method-not-allowed' })
        return
      }
      sendJson(res, 200, { rules: ctx.settings.get().rules })
    },
  })

  ctx.webServer.register({
    kind: 'exact', path: '/ant-sword/skills/list',
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method-not-allowed' })
        return
      }
      try {
        const listed = await skillProvider.list({})
        const candidates = 'candidates' in listed ? listed.candidates : listed
        sendJson(res, 200, { skills: candidates.map(candidate => ({ name: candidate.name, description: candidate.description })) })
      } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  ctx.webServer.register({
    kind: 'exact', path: '/ant-sword/skills/upsert',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method-not-allowed' })
        return
      }
      try {
        const body = await readBody(req)
        if (Object.keys(body).some(key => !['name', 'description', 'whenToUse', 'modelInvocable', 'userInvocable', 'content'].includes(key))) throw new TypeError('unsupported skill field')
        if (typeof body.name !== 'string' || !isSkillName(body.name)) throw new TypeError('invalid skill name')
        if (typeof body.description !== 'string' || body.description.length > 1_024) throw new TypeError('invalid skill description')
        if (body.whenToUse !== undefined && (typeof body.whenToUse !== 'string' || body.whenToUse.length > 2_048)) throw new TypeError('invalid skill whenToUse')
        if (typeof body.content !== 'string' || Buffer.byteLength(body.content, 'utf8') > MAX_SKILL_BODY_BYTES || body.content.includes('\0')) throw new TypeError('invalid skill content')
        if (typeof body.modelInvocable !== 'boolean' || typeof body.userInvocable !== 'boolean') throw new TypeError('invalid invocation policy')
        const directory = join(root, body.name)
        const target = join(directory, 'SKILL.md')
        if (!within(root, target)) throw new TypeError('skill path escapes user root')
        await mkdir(directory, { recursive: true })
        const temporary = join(directory, `.SKILL.${String(process.pid)}.tmp`)
        const text = [
          '---',
          `name: ${scalar(body.name)}`,
          `description: ${scalar(body.description)}`,
          ...(typeof body.whenToUse === 'string' && body.whenToUse !== '' ? [`whenToUse: ${scalar(body.whenToUse)}`] : []),
          `user-invocable: ${body.userInvocable ? 'true' : 'false'}`,
          `disable-model-invocation: ${body.modelInvocable ? 'false' : 'true'}`,
          '---', '', body.content, '',
        ].join('\n')
        await writeFile(temporary, text, { encoding: 'utf8', mode: 0o600 })
        await rename(temporary, target)
        reconciler.refresh()
        sendJson(res, 200, { name: body.name })
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  ctx.webServer.register({
    kind: 'exact', path: '/ant-sword/skills/delete',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method-not-allowed' })
        return
      }
      try {
        const body = await readBody(req)
        if (Object.keys(body).some(key => key !== 'name') || typeof body.name !== 'string' || !isSkillName(body.name)) throw new TypeError('invalid skill name')
        const directory = join(root, body.name)
        if (!within(root, directory) || dirname(directory) !== resolve(root)) throw new TypeError('skill path escapes user root')
        await rm(directory, { recursive: true, force: true })
        reconciler.refresh()
        sendJson(res, 200, { name: body.name })
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })
}
