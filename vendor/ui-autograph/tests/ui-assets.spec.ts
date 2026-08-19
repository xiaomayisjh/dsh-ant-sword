import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { en, zh } from '../src/client/locales.ts'

const ROOT = resolve(import.meta.dirname, '..')

function sourceFiles(root = join(ROOT, 'src')): string[] {
  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(path))
    else if (['.css', '.ts', '.tsx'].includes(extname(entry.name))) files.push(path)
  }
  return files
}

function format(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match)
}

describe('UI assets', () => {
  it('uses the host locale placeholder syntax', () => {
    expect(format(en['panel.cycle'], { cycle: 7 })).toBe('cycle 7')
    expect(format(zh['panel.cycle'], { cycle: 7 })).toBe('循环 7')
  })

  it('keeps Chinese UI sources free of encoding corruption', () => {
    const source = sourceFiles().map(path => readFileSync(path, 'utf8')).join('\n')
    expect(source).toContain('Red Team 环境')
    expect(source).not.toMatch(/\uFEFF|\uFFFD|[\uE000-\uF8FF]|\u9225\?/u)
  })

  it('ships and installs the complete React Flow stylesheet', () => {
    const bundle = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8')
    expect(bundle).toContain('data-plugin-css=')
    expect(bundle).toContain('.react-flow__container')
    expect(bundle).not.toContain('sourceMappingURL=client.css.map')
  })

  it('uses valid React Flow and host theme variables', () => {
    const css = readFileSync(join(ROOT, 'src', 'client', 'AutoGraphView.module.css'), 'utf8')
    const view = readFileSync(join(ROOT, 'src', 'client', 'AutoGraphView.tsx'), 'utf8')
    expect(css).toContain('--xy-background-pattern-dots-color-default')
    expect(css).not.toContain('--xy-background-pattern-dot-color-default')
    expect(`${css}\n${view}`).toContain('var(--dsw-alias-brand-primary)')
    expect(`${css}\n${view}`).not.toContain('colorprimary-new-color')
  })
})
