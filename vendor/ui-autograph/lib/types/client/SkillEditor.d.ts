interface SkillEntry {
    id: string;
    name: string;
    description?: string;
    whenToUse?: string;
    modelInvocable: boolean;
    userInvocable: boolean;
    content: string;
    userOwned: boolean;
}
interface Props {
    scopeList: readonly SkillEntry[];
    onChange(items: readonly SkillEntry[]): void;
    onSave(): Promise<void>;
}
export declare function SkillEditor({ scopeList, onChange: _onChange, onSave }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=SkillEditor.d.ts.map