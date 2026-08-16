/**
 * Validate the bundled reverse/CTF skill pack under `skills/`.
 *
 * Asserts, for every `SKILL.md`:
 *  - frontmatter carries only keys the dsh skill layer accepts, and the
 *    required `name` / `description` are non-empty;
 *  - the skill `name` matches the dsh kebab-case grammar (the same grammar
 *    `validateCandidate` enforces at registration time);
 *  - names are unique across the whole pack;
 *  - files are UTF-8 without a BOM and use LF line endings.
 *
 * Run: `node scripts/verify-skills.mjs`. Exits non-zero on the first
 * category of violation, listing every offender.
 */

import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILLS_ROOT = fileURLToPath(new URL('../skills', import.meta.url))

/** Keys the dsh skill frontmatter contract understands (metadata passes through). */
const ALLOWED_KEYS = new Set([
  'name',
  'description',
  'whenToUse',
  'disable-model-invocation',
  'user-invocable',
  'license',
  'metadata',
])

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

async function* walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else if (entry.name === 'SKILL.md') yield path
  }
}

function splitFrontmatter(text) {
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  if (!src.startsWith('---')) return null
  const end = src.indexOf('\n---', 3)
  if (end === -1) return null
  return { fm: src.slice(3, end), body: src.slice(end + 4) }
}

function topLevelKeys(fm) {
  const keys = []
  for (const line of fm.split('\n')) {
    const m = /^([A-Za-z0-9_-]+):/.exec(line)
    if (m) keys.push(m[1])
  }
  return keys
}

function scalar(fm, key) {
  const m = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(fm)
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined
}

const errors = []
const seen = new Map()
let count = 0

for await (const path of walk(SKILLS_ROOT)) {
  count++
  const rel = relative(SKILLS_ROOT, path)
  const raw = await readFile(path, 'utf8')
  if (raw.charCodeAt(0) === 0xfeff) errors.push(`${rel}: UTF-8 BOM present`)
  if (/\r\n/.test(raw)) errors.push(`${rel}: CRLF line endings present`)
  const parts = splitFrontmatter(raw)
  if (!parts) {
    errors.push(`${rel}: missing frontmatter block`)
    continue
  }
  for (const key of topLevelKeys(parts.fm)) {
    if (!ALLOWED_KEYS.has(key)) errors.push(`${rel}: unsupported frontmatter key "${key}"`)
  }
  const name = scalar(parts.fm, 'name')
  const description = scalar(parts.fm, 'description')
  if (!name) errors.push(`${rel}: missing or empty "name"`)
  else if (!KEBAB.test(name)) errors.push(`${rel}: name "${name}" is not kebab-case`)
  else if (seen.has(name)) errors.push(`${rel}: duplicate skill name "${name}" also at ${seen.get(name)}`)
  else seen.set(name, rel)
  if (!description) errors.push(`${rel}: missing or empty "description"`)
}

if (errors.length > 0) {
  console.error(`skill pack invalid (${errors.length} problem${errors.length === 1 ? '' : 's'}):`)
  for (const error of errors) console.error(`  ${error}`)
  process.exitCode = 1
} else {
  console.log(`skill pack ok: ${count} SKILL.md files, ${seen.size} unique kebab-case names`)
}