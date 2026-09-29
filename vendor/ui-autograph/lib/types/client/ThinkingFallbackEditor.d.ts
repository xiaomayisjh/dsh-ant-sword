import type { ThinkingFallbackPolicy } from './runtime-config-types.ts';
interface Props {
    fallbacks: ThinkingFallbackPolicy[];
    saving: boolean;
    onChange(fallbacks: ThinkingFallbackPolicy[]): void;
    onSave(): Promise<void>;
}
export declare function ThinkingFallbackEditor({ fallbacks, saving, onChange, onSave }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=ThinkingFallbackEditor.d.ts.map