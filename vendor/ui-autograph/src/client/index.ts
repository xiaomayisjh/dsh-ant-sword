/**
 * Autonomous-loop graph plugin, browser half: contributes one entry to the
 * conversation view slot — a React Flow view of the red-team-auto blackboard
 * (the `board` session projection) with Pause / Resume / Inject-hint controls
 * driven through the `/auto` command Remote. The tab reads its live graph via
 * the session-standard `useProjection`; it mounts like any view and renders
 * the empty state when the session has no blackboard.
 */
import '@xyflow/react/dist/style.css'
import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'conversation.view' SlotMap row, declared by the owning package.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: the settings shell's SlotMap merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the generated command Remote (ctx.remote.commands).
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { AutoGraphView, type AutoGraphActions } from './AutoGraphView.tsx'
import { INITIAL_RUNTIME_STATUS, RuntimeStatus, type RedTeamRuntimeStatus } from './RuntimeStatus.tsx'
import { RuntimeConfigScope } from './runtime-config-scope.ts'
import type { RuntimeConfigValue } from './runtime-config-types.ts'
import { en, zh, type AutographKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The autonomous graph view's copy. */
    autograph: AutographKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'autograph'

/** Required services: view slot, sessions binding, command Remote, locale. */
export const inject = ['slots', 'sessions', 'remote', 'remote.commands', 'locale', 'settingsScope', 'connection']

/**
 * Client plugin body: register the autonomous graph view tab. The
 * registration rides the slot service's effect wrapper, so plugin unload
 * removes the tab.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-autograph: dictionaries')
  const t = ctx.locale.bind(NS)
  const runtimeStatus = createSnapshotStore<RedTeamRuntimeStatus>(INITIAL_RUNTIME_STATUS)
  const nativeConfigScope = ctx.settingsScope.bind<RuntimeConfigValue>({ namespace: 'ant-sword-runtime' })
  const configScope = new RuntimeConfigScope(nativeConfigScope)
  ctx.effect(() => () => configScope.dispose(), 'ui-autograph: runtime config scope')

  const refreshRuntimeStatus = async (): Promise<void> => {
    const response = await fetch('/ant-sword/runtime-status', { cache: 'no-store' })
    if (!response.ok) throw new Error(`runtime status request failed: ${response.status}`)
    runtimeStatus.set(await response.json() as RedTeamRuntimeStatus)
  }
  ctx.effect(() => {
    let disposed = false
    const refresh = (): void => {
      void refreshRuntimeStatus().catch((error: unknown) => {
        if (!disposed) ctx.logger.warn(error)
      })
    }
    refresh()
    const timer = setInterval(refresh, 5_000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, 'ui-autograph: runtime status polling')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'red-team-runtime',
    order: 18,
    label: () => 'Red Team 环境',
    inject: () => ({ runtimeStatus, configScope }),
  }, RuntimeStatus))

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'autograph',
    order: 20,
    locale: NS,
    label: () => t('panel.title'),
    inject: (sessionId: SessionId): AutoGraphActions => {
      const run = async (input: string): Promise<string | null> => {
        const result = await ctx.remote.commands.execute(sessionId, input)
        if (!result.ok) return `${result.error.message} (${result.error.code})`
        return null
      }
      return {
        isAutoMode: ctx.sessions.list.getSnapshot().byId[sessionId]?.agentPreset === 'red-team-auto',
        runtimeStatus,
        onPause: () => run('/auto pause'),
        onResume: () => run('/auto resume'),
        onHint: text => run(`/auto hint ${text}`),
      }
    },
  }, AutoGraphView))
}
