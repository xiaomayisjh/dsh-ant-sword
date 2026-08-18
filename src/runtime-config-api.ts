/** Loopback configuration bridge for Ant Sword's private settings namespace. */

import { isDeepStrictEqual } from 'node:util'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import {
  SettingsConflictError, settingsNamespace,
} from '@deepseek-ai/dsh-settings'
import type {
  SettingsDescriptor, SettingsPathOp, SettingsProvider,
} from '@deepseek-ai/dsh-settings'
import {
  ANT_SWORD_SETTINGS_NAMESPACE,
} from './runtime-config.ts'
import type {
  AntSwordRuntimeConfig, RuntimeApplyFailure, RuntimeController,
} from './runtime-config.ts'

const MAX_BODY_BYTES = 512 * 1024
const MUTABLE_FIELDS = new Set<keyof AntSwordRuntimeConfig>(['mcpServers', 'disabledSkills', 'rules', 'thinkingPolicies'])
const NAMESPACE = settingsNamespace(ANT_SWORD_SETTINGS_NAMESPACE)

export interface RuntimeConfigApiView {
  value: AntSwordRuntimeConfig
  desired: AntSwordRuntimeConfig
  applied: AntSwordRuntimeConfig
  base?: Partial<AntSwordRuntimeConfig>
  user?: Partial<AntSwordRuntimeConfig>
  revision: number
  writable: boolean
  generation: number
  desiredGeneration: number
  applying: boolean
  inSync: boolean
  lastFailure?: RuntimeApplyFailure
}

export type RuntimeConfigApiMutation =
  | { op: 'set'; field: keyof AntSwordRuntimeConfig; value: unknown; expectedRevision?: number }
  | { op: 'unset'; field: keyof AntSwordRuntimeConfig; expectedRevision?: number }

type RuntimeSettings = Pick<SettingsProvider, 'describe' | 'mutate' | 'writable'>
type RuntimeControllerView = Pick<RuntimeController, 'snapshot' | 'whenIdle'>

interface RuntimeApiError {
  error: string
  code: string
  message: string
}

export function errorBody(code: string, error: unknown): RuntimeApiError {
  const message = error instanceof Error ? error.message : String(error)
  return { error: message, code, message }
}

export function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of req) {
    const bytes: Uint8Array = Buffer.from(chunk as Uint8Array)
    size += bytes.byteLength
    if (size > MAX_BODY_BYTES) throw new TypeError(`request body exceeds ${String(MAX_BODY_BYTES)} bytes`)
    chunks.push(bytes)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isLoopbackRequest(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress
  return address === '127.0.0.1' || address === '::1' || address?.startsWith('::ffff:127.') === true
}

function optionalRevision(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError('expectedRevision must be a non-negative safe integer')
  }
  return value as number
}

export function parseRuntimeConfigMutation(value: unknown): RuntimeConfigApiMutation {
  if (!isRecord(value)) throw new TypeError('runtime config request must be a JSON object')
  if (value.op !== 'set' && value.op !== 'unset') throw new TypeError('op must be "set" or "unset"')
  if (typeof value.field !== 'string' || !MUTABLE_FIELDS.has(value.field as keyof AntSwordRuntimeConfig)) {
    throw new TypeError('field must be one of mcpServers, disabledSkills, rules, or thinkingPolicies')
  }
  const allowed = value.op === 'set'
    ? new Set(['op', 'field', 'value', 'expectedRevision'])
    : new Set(['op', 'field', 'expectedRevision'])
  if (Object.keys(value).some(key => !allowed.has(key))) throw new TypeError('runtime config request contains unsupported fields')
  const expectedRevision = optionalRevision(value.expectedRevision)
  const field = value.field as keyof AntSwordRuntimeConfig
  if (value.op === 'unset') return { op: 'unset', field, ...(expectedRevision === undefined ? {} : { expectedRevision }) }
  if (!Object.hasOwn(value, 'value')) throw new TypeError('set requires value')
  return { op: 'set', field, value: value.value, ...(expectedRevision === undefined ? {} : { expectedRevision }) }
}

function descriptor(settings: RuntimeSettings): SettingsDescriptor {
  const found = settings.describe({ redactSecrets: true }).find(candidate => candidate.ns === NAMESPACE)
  if (found === undefined) throw new Error(`settings namespace "${ANT_SWORD_SETTINGS_NAMESPACE}" is not registered`)
  return found
}

export function runtimeConfigApiView(
  settings: RuntimeSettings,
  controller: RuntimeControllerView,
): RuntimeConfigApiView {
  const settingsView = descriptor(settings)
  const runtime = controller.snapshot()
  return {
    value: settingsView.value as AntSwordRuntimeConfig,
    desired: runtime.desired,
    applied: runtime.applied,
    ...(settingsView.base === undefined ? {} : { base: settingsView.base as Partial<AntSwordRuntimeConfig> }),
    ...(settingsView.user === undefined ? {} : { user: settingsView.user as Partial<AntSwordRuntimeConfig> }),
    revision: settingsView.revision,
    writable: settings.writable,
    generation: runtime.generation,
    desiredGeneration: runtime.desiredGeneration,
    applying: runtime.applying,
    inSync: isDeepStrictEqual(runtime.desired, runtime.applied),
    ...(runtime.lastFailure === undefined ? {} : { lastFailure: runtime.lastFailure }),
  }
}

export async function mutateRuntimeConfig(
  settings: RuntimeSettings,
  controller: RuntimeControllerView,
  mutation: RuntimeConfigApiMutation,
): Promise<RuntimeConfigApiView> {
  const op: SettingsPathOp = mutation.op === 'set'
    ? { op: 'set', path: [mutation.field], value: mutation.value }
    : { op: 'unset', path: [mutation.field] }
  await settings.mutate(NAMESPACE, [op], mutation.expectedRevision)
  // Settings commits enqueue owner watchers on their per-listener microtask
  // chain. Yield once so RuntimeController observes the generation before its
  // quiescence promise is sampled.
  await Promise.resolve()
  await controller.whenIdle()
  return runtimeConfigApiView(settings, controller)
}

export function applyRuntimeConfigApi(ctx: Context, controller: RuntimeController): void {
  ctx.webServer.register({
    kind: 'exact',
    path: '/ant-sword/runtime-config',
    handler: async (req, res) => {
      if (!isLoopbackRequest(req)) {
        sendJson(res, 403, errorBody('loopback-only', 'loopback-only'))
        return
      }
      if (req.method === 'GET') {
        try {
          sendJson(res, 200, runtimeConfigApiView(ctx.settings, controller))
        } catch (error) {
          sendJson(res, 503, errorBody('settings-unavailable', error))
        }
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, errorBody('method-not-allowed', 'method-not-allowed'))
        return
      }
      try {
        const mutation = parseRuntimeConfigMutation(await readJson(req))
        sendJson(res, 200, await mutateRuntimeConfig(ctx.settings, controller, mutation))
      } catch (error) {
        const conflict = error instanceof SettingsConflictError
        const status = conflict ? 409 : error instanceof TypeError ? 400 : 500
        const code = conflict ? 'revision-conflict' : error instanceof TypeError ? 'invalid-request' : 'internal-error'
        sendJson(res, status, errorBody(code, error))
      }
    },
  })
}