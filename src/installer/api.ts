/** Loopback Host routes for controlled installation operations. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { INSTALL_CATALOG } from './catalog.ts'
import type { SourcePolicy } from './catalog.ts'
import { createSubprocessInstallRunner, InstallManager, InstallerError } from './transaction.ts'

const MAX_BODY_BYTES = 16 * 1024
const SOURCE_POLICIES = new Set<SourcePolicy>(['auto', 'domestic-first', 'official-first'])

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

async function readJsonObject(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.byteLength
    if (size > MAX_BODY_BYTES) throw new InstallerError(`request body exceeds ${String(MAX_BODY_BYTES)} bytes`, false)
    chunks.push(bytes)
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new InstallerError('request body must be a JSON object', false)
  return value as Record<string, unknown>
}

function requirePost(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === 'POST') return true
  sendJson(res, 405, { error: 'method-not-allowed' })
  return false
}

function architecture(): 'x64' | 'arm64' {
  if (process.arch === 'x64' || process.arch === 'arm64') return process.arch
  throw new InstallerError(`unsupported architecture ${process.arch}`, false)
}

export function applyInstallApi(ctx: Context): InstallManager {
  const platform = process.platform === 'win32' ? 'win32' : process.platform === 'linux' ? 'linux' : undefined
  if (platform === undefined) throw new InstallerError(`unsupported platform ${process.platform}`, false)
  const manager = new InstallManager(createSubprocessInstallRunner(ctx.subprocess), platform, architecture())

  ctx.webServer.register({
    kind: 'exact',
    path: '/ant-sword/install/catalog',
    handler: (_req, res) => sendJson(res, 200, {
      components: INSTALL_CATALOG.map(component => ({
        id: component.id,
        label: component.label,
        version: component.version,
        dependencies: component.dependencies,
        restartRequired: component.restartRequired ?? false,
        supported: component.variants.some(variant => variant.platform === platform && variant.architectures.includes(architecture())),
      })),
      operations: manager.list(),
    }),
  })

  ctx.webServer.register({
    kind: 'exact',
    path: '/ant-sword/install/start',
    handler: async (req, res) => {
      if (!requirePost(req, res)) return
      try {
        const body = await readJsonObject(req)
        if (Object.keys(body).some(key => key !== 'componentId' && key !== 'sourcePolicy')) throw new InstallerError('request contains unsupported fields', false)
        if (typeof body.componentId !== 'string' || body.componentId.length > 64) throw new InstallerError('componentId must be a string of at most 64 characters', false)
        if (typeof body.sourcePolicy !== 'string' || !SOURCE_POLICIES.has(body.sourcePolicy as SourcePolicy)) throw new InstallerError('invalid sourcePolicy', false)
        sendJson(res, 202, manager.start(body.componentId, body.sourcePolicy as SourcePolicy))
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  ctx.webServer.register({
    kind: 'exact',
    path: '/ant-sword/install/cancel',
    handler: async (req, res) => {
      if (!requirePost(req, res)) return
      try {
        const body = await readJsonObject(req)
        if (Object.keys(body).some(key => key !== 'operationId')) throw new InstallerError('request contains unsupported fields', false)
        if (typeof body.operationId !== 'string' || body.operationId.length > 64) throw new InstallerError('operationId must be a string of at most 64 characters', false)
        const cancelled = manager.cancel(body.operationId)
        sendJson(res, cancelled ? 200 : 404, { cancelled })
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  ctx.webServer.register({
    kind: 'exact',
    path: '/ant-sword/install/status',
    handler: (req, res) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method-not-allowed' })
        return
      }
      sendJson(res, 200, { operations: manager.list() })
    },
  })

  return manager
}