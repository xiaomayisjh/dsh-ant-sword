import { type SkillCandidate, type SkillDefinition } from '@deepseek-ai/dsh-skill';
export declare const MAX_SKILL_BODY_BYTES: number;
export declare function isWithin(root: string, target: string): boolean;
export declare function parseSkillDocument(text: string): {
    frontmatter: Record<string, string>;
    body: string;
};
export declare class SkillCatalog {
    readonly root: string;
    constructor(root: string);
    list(): Promise<SkillCandidate[]>;
    get(name: string): Promise<SkillDefinition | undefined>;
    write(input: {
        name: string;
        description: string;
        whenToUse?: string;
        modelInvocable: boolean;
        userInvocable: boolean;
        content: string;
    }): Promise<void>;
    delete(name: string): Promise<void>;
}
//# sourceMappingURL=skill-catalog.d.ts.map