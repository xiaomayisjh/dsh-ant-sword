import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { BUNDLED_SKILL_RANK, isSkillName, type SkillCandidate, type SkillDefinition } from '@deepseek-ai/dsh-skill'
import { skillProvider } from './skills.ts'

export const MAX_SKILL_BODY_BYTES = 96 * 1024
const USER_RANK = BUNDLED_SKILL_RANK - 1

export function isWithin(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return rel === '' || (!rel.startsWith('..') && !rel.includes(':'))
}

function unquote(value: string): string { return value.trim().replace(/^["']|["']$/g, '') }

export function parseSkillDocument(text: string): { frontmatter: Record<string, string>; body: string } {
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  if (!src.startsWith('---')) return { frontmatter: {}, body: text }
  const end = src.indexOf('\n---', 3)
  if (end < 0) return { frontmatter: {}, body: text }
  const frontmatter: Record<string, string> = {}
  for (const line of src.slice(3, end).split('\n')) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (match?.[1] !== undefined && match[2] !== undefined) frontmatter[match[1]] = unquote(match[2])
  }
  return { frontmatter, body: src.slice(end + 4) }
}

function falseValue(value: string | undefined): boolean { return value !== undefined && /^(false|0|no|off)$/i.test(value) }

function candidate(path: string, frontmatter: Record<string, string>): SkillCandidate {
  const name = frontmatter.name ?? ''
  return {
    name,
    description: frontmatter.description ?? '',
    ...(frontmatter.whenToUse ? { whenToUse: frontmatter.whenToUse } : {}),
    invocation: {
      modelInvocable: !frontmatter['disable-model-invocation'] || falseValue(frontmatter['disable-model-invocation']),
      userInvocable: !falseValue(frontmatter['user-invocable']),
    },
    provider: 'ant-sword-user-skills', source: 'user-dsh', rank: USER_RANK,
    resourceBase: { kind: 'directory', path: dirname(path) }, locator: path, path,
  }
}

async function scan(root: string): Promise<SkillCandidate[]> {
  const result: SkillCandidate[] = []
  async function walk(dir: string): Promise<void> {
    let entries
    try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.name === 'SKILL.md') {
        try {
          const parsed = parseSkillDocument(await readFile(path, 'utf8'))
          if (isSkillName(parsed.frontmatter.name ?? '')) result.push(candidate(path, parsed.frontmatter))
        } catch { /* ignore incomplete files during discovery */ }
      }
    }
  }
  await walk(root)
  return result
}

export class SkillCatalog {
  constructor(readonly root: string) {}

  async list(): Promise<SkillCandidate[]> {
    const bundled = await skillProvider.list({})
    const base = 'candidates' in bundled ? [...bundled.candidates] : [...bundled]
    const all = [...base, ...(await scan(this.root))]
    const winners = new Map<string, SkillCandidate>()
    for (const item of all) {
      const previous = winners.get(item.name)
      if (previous === undefined || item.rank < previous.rank) winners.set(item.name, item)
    }
    return [...winners.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  async get(name: string): Promise<SkillDefinition | undefined> {
    const selected = (await this.list()).find(item => item.name === name)
    if (selected === undefined) return undefined
    if (typeof selected.locator !== 'string') return skillProvider.get(selected, {})
    try {
      const parsed = parseSkillDocument(await readFile(selected.locator, 'utf8'))
      return { ...selected, content: parsed.body.trim() }
    } catch { return undefined }
  }

  async write(input: { name: string; description: string; whenToUse?: string; modelInvocable: boolean; userInvocable: boolean; content: string }): Promise<void> {
    if (!isSkillName(input.name)) throw new TypeError('invalid skill name')
    if (!isWithin(this.root, join(this.root, input.name))) throw new TypeError('skill path escapes user root')
    if (Buffer.byteLength(input.content, 'utf8') > MAX_SKILL_BODY_BYTES || input.content.includes('\0')) throw new TypeError('invalid skill content')
    if (input.description.length > 1024 || input.whenToUse !== undefined && input.whenToUse.length > 2048) throw new TypeError('invalid skill metadata')
    const directory = resolve(this.root, input.name)
    const target = join(directory, 'SKILL.md')
    if (!isWithin(this.root, target) || dirname(directory) !== resolve(this.root)) throw new TypeError('skill path escapes user root')
    await mkdir(directory, { recursive: true })
    const temporary = join(directory, `.SKILL.${process.pid}.${Date.now()}.tmp`)
    const text = ['---', `name: ${JSON.stringify(input.name)}`, `description: ${JSON.stringify(input.description)}`, ...(input.whenToUse ? [`whenToUse: ${JSON.stringify(input.whenToUse)}`] : []), `user-invocable: ${input.userInvocable}`, `disable-model-invocation: ${!input.modelInvocable}`, '---', '', input.content, ''].join('\n')
    try { await writeFile(temporary, text, { encoding: 'utf8', mode: 0o600 }); await rename(temporary, target) } catch (error) { await rm(temporary, { force: true }).catch(() => undefined); throw error }
  }

  async delete(name: string): Promise<void> {
    if (!isSkillName(name)) throw new TypeError('invalid skill name')
    const directory = resolve(this.root, name)
    if (!isWithin(this.root, directory) || dirname(directory) !== resolve(this.root)) throw new TypeError('skill path escapes user root')
    await rm(directory, { recursive: true, force: true })
  }
}