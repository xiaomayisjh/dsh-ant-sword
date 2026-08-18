/** Loopback capability discovery for exact provider/model reasoning routes. */

import type { Context } from '@deepseek-ai/cordis'
import { errorBody, isLoopbackRequest, sendJson } from './runtime-config-api.ts'
import type { ThinkingPolicyRuntime } from './thinking-policy.ts'

export function applyThinkingPolicyApi(ctx: Context, runtime: ThinkingPolicyRuntime): void {
  ctx.webServer.register({
    kind: 'exact',
    path: '/ant-sword/thinking/catalog',
    handler: async (req, res) => {
      if (!isLoopbackRequest(req)) {
        sendJson(res, 403, errorBody('loopback-only', 'loopback-only'))
        return
      }
      if (req.method !== 'GET') {
        sendJson(res, 405, errorBody('method-not-allowed', 'method-not-allowed'))
        return
      }
      try {
        const providers = ctx.llm.listProviders()
        const entries = await Promise.all(providers.map(async provider => ({
          ...provider,
          models: await ctx.llm.listModels(provider.id),
        })))
        sendJson(res, 200, { providers: entries })
      } catch (error) {
        sendJson(res, 503, errorBody('catalog-unavailable', error))
      }
    },
  })
  ctx.webServer.register({
    kind: 'exact',
    path: '/ant-sword/thinking/capability',
    handler: async (req, res) => {
      if (!isLoopbackRequest(req)) {
        sendJson(res, 403, errorBody('loopback-only', 'loopback-only'))
        return
      }
      if (req.method !== 'GET') {
        sendJson(res, 405, errorBody('method-not-allowed', 'method-not-allowed'))
        return
      }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const providerId = url.searchParams.get('provider')?.trim() ?? ''
      const modelId = url.searchParams.get('model')?.trim() ?? ''
      if (providerId === '' || modelId === '') {
        sendJson(res, 400, errorBody('invalid-request', 'provider and model query parameters are required'))
        return
      }
      try {
        sendJson(res, 200, await runtime.capability(providerId, modelId))
      } catch (error) {
        sendJson(res, 404, errorBody('model-not-found', error))
      }
    },
  })
}