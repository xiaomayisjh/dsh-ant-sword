/** Ordered system-prompt sections backed by runtime rules. */
const PLACEMENT_ORDER = {
    'before-persona': -50,
    'after-persona': 50,
    'before-tools': 90,
    'after-tools': 200,
};
function sectionName(rule) {
    return `ant-sword:rule:${rule.id}`;
}
function sectionOrder(rule) {
    return PLACEMENT_ORDER[rule.placement] + Math.max(-9, Math.min(9, rule.order / 1_000_000));
}
export function escapeRuleContent(content) {
    return content.replace(/<\/(system|assistant|user|tool)(?=[\s>])/gi, '<\\/$1');
}
export class RulesReconciler {
    ctx;
    name = 'rules';
    disposers = [];
    rules = [];
    constructor(ctx) {
        this.ctx = ctx;
    }
    prepare(next, _previousConfig) {
        const desired = next.rules
            .filter(rule => rule.enabled)
            .toSorted((left, right) => left.placement.localeCompare(right.placement)
            || left.order - right.order
            || left.id.localeCompare(right.id));
        const previous = this.rules;
        return {
            commit: () => {
                const oldDisposers = this.disposers;
                oldDisposers.forEach((dispose) => { dispose(); });
                const nextDisposers = [];
                try {
                    for (const rule of desired) {
                        nextDisposers.push(this.ctx.systemPrompt.section({
                            name: sectionName(rule),
                            order: sectionOrder(rule),
                            text: escapeRuleContent(rule.content),
                        }));
                    }
                    this.disposers = nextDisposers;
                    this.rules = desired;
                }
                catch (error) {
                    nextDisposers.forEach((dispose) => { dispose(); });
                    this.disposers = previous.map(rule => this.ctx.systemPrompt.section({
                        name: sectionName(rule), order: sectionOrder(rule), text: escapeRuleContent(rule.content),
                    }));
                    this.rules = previous;
                    throw error;
                }
            },
            rollback: () => {
                this.disposers.forEach((dispose) => { dispose(); });
                this.disposers = previous.map(rule => this.ctx.systemPrompt.section({
                    name: sectionName(rule), order: sectionOrder(rule), text: escapeRuleContent(rule.content),
                }));
                this.rules = previous;
            },
        };
    }
}
//# sourceMappingURL=rules-reconciler.js.map