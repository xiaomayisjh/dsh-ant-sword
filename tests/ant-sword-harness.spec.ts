/**
 * REAL-composition coverage for the ant-sword-harness bundle: the patch file
 * must parse and mount its capability rows, and the bundled skill provider must
 * register the whole 93-skill pack on a live `ctx.skills` registry and dispose
 * cleanly.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { skillProvider, resetSkillCatalogCache } from '../src/skills.ts'

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

describe('dsh-ant-sword-harness bundle patch', () => {
  it('declares the rc2 web client half on the root package', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf8'),
    ) as {
      exports?: Record<string, unknown>
      dsh?: { client?: { platform?: string; inject?: string[] } }
    }
    const clientExport = manifest.exports?.['./client'] as { default?: string; types?: string } | undefined
    expect(clientExport?.default).toBe('./vendor/ui-autograph/lib/client.js')
    expect(clientExport?.types).toBe('./vendor/ui-autograph/lib/types/client/index.d.ts')
    expect(manifest.dsh?.client?.platform).toBe('web')
    expect(manifest.dsh?.client?.inject).toEqual([
      '@deepseek-ai/dsh-api-remotes',
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-conversation',
      '@deepseek-ai/dsh-client-ui-layout',
      '@deepseek-ai/dsh-client-ui-settings',
      '@deepseek-ai/dsh-client-ui-renderer',
      '@deepseek-ai/dsh-client-ui-session',
    ])
  })

  it('declares a parseable patch list mounting its capability rows', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf8'),
    ) as { dsh?: { bundle?: { patch?: string[] } } }
    const patchFiles = manifest.dsh?.bundle?.patch
    expect(patchFiles).toEqual([
      './cordis.patch.yml',
      './preset/red-team.patch.yml',
      './preset/red-team-auto.patch.yml',
    ])
    if (!Array.isArray(patchFiles)) throw new Error('bundle patch list is missing')
    const rows = patchFiles.flatMap(path => {
      const parsed = yaml.load(readFileSync(resolve(root, path), 'utf8'), { schema: entryListSchema })
      if (!Array.isArray(parsed)) throw new Error(`bundle patch is not a list: ${path}`)
      return (parsed as { insert?: { id?: string; name?: string }[] }[]).flatMap(patch => patch.insert ?? [])
    })
    const byId = new Map(rows.map(row => [row.id, row.name]))
    expect(byId.get('ant-sword-harness')).toBe('@deepseek-ai/dsh-ant-sword-harness')
    expect(byId.get('ant-sword-rewind')).toBe('@deepseek-ai/dsh-ant-sword-harness/rewind')
    expect(byId.has('ui-autograph')).toBe(false)
    expect(byId.get('dsh-market')).toBe('dshmarket')
    expect(byId.get('preset-red-team')).toBe('@deepseek-ai/dsh-agent-preset')
    expect(byId.get('preset-red-team-auto')).toBe('@deepseek-ai/dsh-agent-preset')
    expect(rows.length).toBe(5)
  })
})

describe('dsh-ant-sword-harness skill provider', () => {
  it('registers the full bundled pack and disposes it with the registration', async () => {
    resetSkillCatalogCache()
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const dispose = ctx.skills.registerProvider(() => skillProvider)

    const listed = await ctx.skills.list()
    expect(listed.length).toBe(93)
    for (const summary of listed) {
      expect(summary.name).toMatch(SKILL_NAME)
      expect(summary.provider).toBe('ant-sword-skills')
      expect(summary.source).toBe('bundled')
      expect(summary.description.length).toBeGreaterThan(0)
    }
    const names = listed.map(summary => summary.name)
    expect(new Set(names).size).toBe(93)
    expect(names).toContain('reverse-engineering')
    expect(names).toContain('ctf-sandbox-orchestrator')
    expect(names).toContain('protocol-reverse-engineering')
    expect(names).toContain('reverse-engineering-api')
    expect(names).toContain('leila-identity')

    const loaded = await ctx.skills.get('reverse-engineering')
    expect(loaded).toBeDefined()
    expect(loaded?.content.length).toBeGreaterThan(0)
    expect(loaded?.resourceBase?.kind).toBe('directory')

    dispose()
    expect(await ctx.skills.list()).toEqual([])
  })
})
