import type { ChannelThinkingPolicy } from './runtime-config-types.ts';
interface Props {
    policies: ChannelThinkingPolicy[];
    saving: boolean;
    onChange(policies: ChannelThinkingPolicy[]): void;
    onSave(): Promise<void>;
}
export declare function ThinkingPolicyEditor({ policies, saving, onChange, onSave }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=ThinkingPolicyEditor.d.ts.map