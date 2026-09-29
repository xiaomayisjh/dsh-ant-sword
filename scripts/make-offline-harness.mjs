#!/usr/bin/env node

/** Rewrite a packed harness tarball without extracting skill files to disk. */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { makeOfflineTarball } from './release-github.mjs'

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const source = resolve(process.argv[2] ?? `deepseek-ai-dsh-ant-sword-harness-${version}.tgz`)
const output = resolve(process.argv[3] ?? `deepseek-ai-dsh-ant-sword-harness-${version}-offline.tgz`)

if (!existsSync(source)) throw new Error(`source tarball not found: ${source}`)
mkdirSync(dirname(output), { recursive: true })
if (source !== output) copyFileSync(source, output)
makeOfflineTarball(output, dirname(output), { clearDependencies: true })
console.log(`offline tarball written: ${output}`)