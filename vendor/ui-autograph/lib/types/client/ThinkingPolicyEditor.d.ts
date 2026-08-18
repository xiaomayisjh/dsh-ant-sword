import type { ChannelThinkingPolicy } from './runtime-config-types.ts';
interface Props {
    policies: ChannelThinkingPolicy[];
    saving: boolean;
    onChange(policies: ChannelThinkingPolicy[]): void;
    onSave(): Promise<void>;
}
export declare function ThinkingPolicyEditor({ policies, saving, onChange, onSave }: Props): any;
export {};
//# sourceMappingURL=ThinkingPolicyEditor.d.ts.map