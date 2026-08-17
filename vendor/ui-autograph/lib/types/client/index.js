import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import { AutoGraphView } from "./AutoGraphView.js";
import { INITIAL_RUNTIME_STATUS, RuntimeStatus } from "./RuntimeStatus.js";
import { en, zh } from "./locales.js";
/** Dictionary namespace owned by this plugin. */
const NS = 'autograph';
/** Required services: view slot, sessions binding, command Remote, locale. */
export const inject = ['slots', 'sessions', 'remote', 'remote.commands', 'locale', 'settingsScope', 'connection'];
/**
 * Client plugin body: register the autonomous graph view tab. The
 * registration rides the slot service's effect wrapper, so plugin unload
 * removes the tab.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-autograph: dictionaries');
    const t = ctx.locale.bind(NS);
    const runtimeStatus = createSnapshotStore(INITIAL_RUNTIME_STATUS);
    const configScope = ctx.settingsScope.bind({ namespace: 'ant-sword-runtime' });
    const refreshRuntimeStatus = async () => {
        const response = await fetch('/ant-sword/runtime-status', { cache: 'no-store' });
        if (!response.ok)
            throw new Error(`runtime status request failed: ${response.status}`);
        runtimeStatus.set(await response.json());
    };
    ctx.effect(() => {
        let disposed = false;
        const refresh = () => {
            void refreshRuntimeStatus().catch((error) => {
                if (!disposed)
                    ctx.logger.warn(error);
            });
        };
        refresh();
        const timer = setInterval(refresh, 5_000);
        return () => {
            disposed = true;
            clearInterval(timer);
        };
    }, 'ui-autograph: runtime status polling');
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'red-team-runtime',
        order: 18,
        label: () => 'Red Team 环境',
        inject: () => ({ runtimeStatus, configScope }),
    }, RuntimeStatus));
    ctx.slots.inject('conversation.view', () => ctx.slots.register({
        name: 'conversation.view',
        id: 'autograph',
        order: 20,
        locale: NS,
        label: () => t('panel.title'),
        inject: (sessionId) => {
            const run = async (input) => {
                const result = await ctx.remote.commands.execute(sessionId, input);
                if (!result.ok)
                    return `${result.error.message} (${result.error.code})`;
                return null;
            };
            return {
                isAutoMode: ctx.sessions.list.getSnapshot().byId[sessionId]?.agentPreset === 'red-team-auto',
                runtimeStatus,
                onPause: () => run('/auto pause'),
                onResume: () => run('/auto resume'),
                onHint: text => run(`/auto hint ${text}`),
            };
        },
    }, AutoGraphView));
}
//# sourceMappingURL=index.js.map