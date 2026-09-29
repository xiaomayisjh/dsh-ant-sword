/**
 * Provider-neutral presentation budgets for the autonomous preset. The DSH
 * request header is the route that actually produced the current tool call;
 * adapter metadata and usage only tune how much board context to show. This
 * service never changes the selected model, effort, or call configuration.
 */
import { Service } from '@deepseek-ai/cordis';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
export type ContextTier = 'compact' | 'standard' | 'wide';
export type ReasoningMode = 'guided' | 'balanced' | 'deep';
/** Deliberately contains no provider or model identity for model-facing use. */
export interface ModelAdaptationProfile {
    contextTier: ContextTier;
    reasoningMode: ReasoningMode;
    boardChars: number;
    evidenceChars: number;
    lessonCount: number;
    contextWindow?: number;
    /** Exact selected adapter effort; informational only, never rewritten. */
    effort?: string;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        modelAdaptation: ModelAdaptationService;
    }
}
/** Read-only adaptation over DSH's selected route and observed input size. */
export declare class ModelAdaptationService extends Service {
    static inject: string[];
    private readonly metadata;
    private readonly observedInput;
    private generation;
    constructor(ctx: Context);
    private resolve;
    profile(agent: Agent): Promise<ModelAdaptationProfile>;
    /** Resolve the route captured by prompt assembly before a header exists. */
    forRoute(provider: string, model: string, effort?: ReasoningEffortId, contextWindowHint?: number): Promise<ModelAdaptationProfile>;
    private profileFor;
}
/** Mount the optional model-profile service under the Host plugin fiber. */
export declare function applyModelAdaptation(ctx: Context): void;
//# sourceMappingURL=model-adaptation.d.ts.map