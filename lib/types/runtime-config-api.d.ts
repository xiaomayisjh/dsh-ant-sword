/** Loopback configuration bridge for Ant Sword's private settings namespace. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import type { SettingsProvider } from '@deepseek-ai/dsh-settings';
import type { AntSwordRuntimeConfig, RuntimeApplyFailure, RuntimeController } from './runtime-config.ts';
export interface RuntimeConfigApiView {
    value: AntSwordRuntimeConfig;
    desired: AntSwordRuntimeConfig;
    applied: AntSwordRuntimeConfig;
    base?: Partial<AntSwordRuntimeConfig>;
    user?: Partial<AntSwordRuntimeConfig>;
    revision: number;
    writable: boolean;
    generation: number;
    desiredGeneration: number;
    applying: boolean;
    inSync: boolean;
    lastFailure?: RuntimeApplyFailure;
}
export type RuntimeConfigApiMutation = {
    op: 'set';
    field: keyof AntSwordRuntimeConfig;
    value: unknown;
    expectedRevision?: number;
} | {
    op: 'unset';
    field: keyof AntSwordRuntimeConfig;
    expectedRevision?: number;
};
type RuntimeSettings = Pick<SettingsProvider, 'describe' | 'mutate' | 'writable'>;
type RuntimeControllerView = Pick<RuntimeController, 'snapshot' | 'whenIdle'>;
interface RuntimeApiError {
    error: string;
    code: string;
    message: string;
}
export declare function errorBody(code: string, error: unknown): RuntimeApiError;
export declare function sendJson(res: ServerResponse, status: number, value: unknown): void;
export declare function isLoopbackRequest(req: IncomingMessage): boolean;
export declare function parseRuntimeConfigMutation(value: unknown): RuntimeConfigApiMutation;
export declare function runtimeConfigApiView(settings: RuntimeSettings, controller: RuntimeControllerView): RuntimeConfigApiView;
export declare function mutateRuntimeConfig(settings: RuntimeSettings, controller: RuntimeControllerView, mutation: RuntimeConfigApiMutation): Promise<RuntimeConfigApiView>;
export declare function applyRuntimeConfigApi(ctx: Context, controller: RuntimeController): void;
export {};
//# sourceMappingURL=runtime-config-api.d.ts.map