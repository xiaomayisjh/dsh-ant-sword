/**
 * Durable, evidence-gated experience for autonomous investigations.
 * Attempts retain fingerprints and error classes, never raw tool arguments or
 * results. A lesson becomes reusable advice only after independent sessions
 * support it with a completed/abandoned Intent and a linked Fact.
 */
import { Service } from '@deepseek-ai/cordis';
import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
import type { DomainFacility } from '@deepseek-ai/dsh-storage-domain';
import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools';
export interface ExperienceConfig {
    stallThreshold?: number;
}
export type AttemptOutcome = 'success' | 'transient' | 'missing-capability' | 'missing-prerequisite' | 'error';
export type LessonStatus = 'candidate' | 'validated' | 'avoid';
export interface AttemptRecord {
    id: string;
    sessionId: string;
    intentId?: string;
    rootCallId: string;
    toolName: string;
    actionHash: string;
    resultHash: string;
    outcome: AttemptOutcome;
    errorCode?: string;
    time: number;
}
interface LessonEvaluation {
    sessionId: string;
    result: 'worked' | 'failed';
    evidenceNodeId: string;
    time: number;
}
export interface LessonRecord {
    id: string;
    situation: string;
    strategy: string;
    status: LessonStatus;
    evaluations: LessonEvaluation[];
    updatedAt: number;
}
export interface LessonProposal {
    intentId: string;
    evidenceNodeId: string;
    situation: string;
    strategy: string;
    result: 'worked' | 'failed';
}
export interface RecoveryDiagnosis {
    intentId: string;
    attemptsWithoutProgress: number;
    reason: string;
    nextStep: 'retry-with-backoff' | 'switch-capability' | 'resolve-prerequisite' | 'switch-method' | 'replan-branch' | 'capture-evidence';
}
export interface ExperienceReadResult {
    readonly summary: string;
    readonly nextOffset?: number;
}
export declare const experienceDomain: {
    name: string;
    version: number;
    tables: {
        attempts: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, AttemptRecord>;
        lessons: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, LessonRecord>;
    };
};
declare module '@deepseek-ai/cordis' {
    interface Context {
        experience: ExperienceService;
    }
}
/** Keep a transferable method while stripping target-specific data. */
export declare function abstractLessonText(input: string): string;
/** Durable attempt ledger and evidence-gated, cross-session lesson registry. */
export declare class ExperienceService extends Service {
    static inject: string[];
    private readonly domainReady;
    private tail;
    private readonly stallThreshold;
    constructor(ctx: Context, config?: ExperienceConfig, facility?: DomainFacility);
    private serialize;
    observe(exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): Promise<AttemptRecord | undefined>;
    propose(session: Session, proposal: LessonProposal): Promise<LessonRecord>;
    recall(situation: string, limit?: number): Promise<LessonRecord[]>;
    read(id: string, offset?: number, pageChars?: number): Promise<ExperienceReadResult>;
    diagnose(session: Session): Promise<RecoveryDiagnosis | undefined>;
}
/** Register self-evolution tools and observe final tool outcomes. */
export declare function applyExperience(ctx: Context, config?: ExperienceConfig): void;
export {};
//# sourceMappingURL=experience.d.ts.map