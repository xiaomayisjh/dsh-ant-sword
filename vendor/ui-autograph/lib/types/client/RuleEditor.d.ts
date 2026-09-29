import type { RuntimeRuleConfig as RuleConfig } from './runtime-config-types.ts';
interface Props {
    rules: readonly RuleConfig[];
    saving: boolean;
    onChange(rules: readonly RuleConfig[]): void;
    onSave(): Promise<void>;
}
export declare function RuleEditor({ rules, saving, onChange, onSave }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=RuleEditor.d.ts.map