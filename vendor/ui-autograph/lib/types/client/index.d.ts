/**
 * Autonomous-loop graph plugin, browser half: contributes one entry to the
 * conversation view slot — a React Flow view of the red-team-auto blackboard
 * (the `board` session projection) with Pause / Resume / Inject-hint controls
 * driven through the `/auto` command Remote. The tab reads its live graph via
 * the session-standard `useProjection`; it mounts like any view and renders
 * the empty state when the session has no blackboard.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type AutographKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The autonomous graph view's copy. */
        autograph: AutographKey;
    }
}
/** Required services: view slot, sessions binding, command Remote, locale. */
export declare const inject: string[];
/**
 * Client plugin body: register the autonomous graph view tab. The
 * registration rides the slot service's effect wrapper, so plugin unload
 * removes the tab.
 * @param ctx - client root context.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map