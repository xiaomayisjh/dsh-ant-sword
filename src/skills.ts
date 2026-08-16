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

import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
} from '@deepseek-ai/dsh-skill'

/**
 * The `skills/` directory sits at the package root, one level above `lib/`.
 * The URL already resolves to the directory itself; wrapping it in `dirname()`
 * would strip back to the package root and double-count every `SKILL.md` under
 * `node_modules`.
 */
const SKILLS_ROOT = fileURLToPath(new URL('../skills', import.meta.url))

/** Provider name in the `ctx.skills` registry. */
const SKILL_PROVIDER_NAME = 'ant-sword-skills'

interface ParsedSkill {
  readonly path: string
  readonly frontmatter: Record<string, string>
  readonly body: string
}

/**
 * Minimal YAML-frontmatter reader covering the keys this pack uses. Only the
 * top-level scalar keys `name` / `description` / `whenToUse` /
 * `user-invocable` / `disable-model-invocation` are read; a `metadata:` block
 * is passed through untouched by the caller (the pack ships none that matter
 * to routing). Values have one layer of surrounding quotes stripped.
 */
function parseFrontmatter(text: string): { frontmatter: Record<string, string>; body: string } {
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  if (!src.startsWith('---')) return { frontmatter: {}, body: text }
  const end = src.indexOf('\n---', 3)
  if (end === -1) return { frontmatter: {}, body: text }
  const frontmatter: Record<string, string> = {}
  let metadataUserInvocable: string | undefined
  const lines = src.slice(3, end).split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue
    if (line.trim() === 'metadata:') {
      let j = i + 1
      while (j < lines.length) {
        const nested = lines[j]
        if (nested === undefined || !/^\s/.test(nested)) break
        const m = /user-invocable:\s*"?([^"\n]+)"?/.exec(nested)
        if (m?.[1] !== undefined) metadataUserInvocable = m[1].trim()
        j++
      }
      i = j - 1
      continue
    }
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (m?.[1] !== undefined && m[2] !== undefined) {
      frontmatter[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
  if (metadataUserInvocable !== undefined) frontmatter['user-invocable'] = metadataUserInvocable
  return { frontmatter, body: src.slice(end + 4) }
}

async function collect(root: string): Promise<ParsedSkill[]> {
  const out: ParsedSkill[] = []
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.name === 'SKILL.md') {
        const text = await readFile(path, 'utf8')
        const { frontmatter, body } = parseFrontmatter(text)
        if (frontmatter['name'] !== undefined && frontmatter['name'] !== '') {
          out.push({ path, frontmatter, body })
        }
      }
    }
  }
  await walk(root)
  return out
}

/** Truthy parsing aligned with the dsh skill filesystem provider. */
function isFalse(value: string | undefined): boolean {
  return value !== undefined && /^(false|0|no|off)$/i.test(value)
}

function toCandidate(skill: ParsedSkill): SkillCandidate {
  const { frontmatter, path } = skill
  const disableModel = ! isFalse(frontmatter['disable-model-invocation'])
    && frontmatter['disable-model-invocation'] !== undefined
  const candidate: SkillCandidate = {
    name: frontmatter['name'] ?? '',
    description: frontmatter['description'] ?? '',
    ...frontmatter['whenToUse'] !== undefined && frontmatter['whenToUse'] !== ''
      ? { whenToUse: frontmatter['whenToUse'] }
      : {},
    invocation: {
      modelInvocable: !disableModel,
      userInvocable: !isFalse(frontmatter['user-invocable']),
    },
    provider: SKILL_PROVIDER_NAME,
    source: 'bundled',
    resourceBase: { kind: 'directory', path: dirname(path) },
    rank: BUNDLED_SKILL_RANK,
    locator: pathToFileURL(path),
    path,
  }
  return candidate
}

let cache: readonly SkillCandidate[] | undefined

async function candidates(): Promise<readonly SkillCandidate[]> {
  if (cache !== undefined) return cache
  const collected = await collect(SKILLS_ROOT)
  const built = collected.map(toCandidate)
  cache = built
  return built
}

/** The bundled skill provider exposed on the `ctx.skills` seam. */
export const skillProvider: SkillProvider = {
  name: SKILL_PROVIDER_NAME,
  list: () => candidates(),
  async get(candidate): Promise<SkillDefinition | undefined> {
    const locator = candidate.locator
    if (!(locator instanceof URL)) return undefined
    let text: string
    try {
      text = await readFile(locator, 'utf8')
    } catch {
      return undefined
    }
    const { body } = parseFrontmatter(text)
    return {
      name: candidate.name,
      description: candidate.description,
      ...candidate.whenToUse !== undefined ? { whenToUse: candidate.whenToUse } : {},
      invocation: candidate.invocation,
      provider: candidate.provider,
      source: candidate.source,
      ...candidate.resourceBase !== undefined ? { resourceBase: candidate.resourceBase } : {},
      content: body.trim(),
      ...candidate.path !== undefined ? { path: candidate.path } : {},
    }
  },
}

/** Test hook: drop the memoized catalog so a re-scan observes new files. */
export function resetSkillCatalogCache(): void {
  cache = undefined
}
