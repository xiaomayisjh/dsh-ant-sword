/**
 * Dictionaries for the autonomous-loop graph surface (zh default, en mirror).
 * @module @deepseek-ai/dsh-client-ui-autograph/locales
 */
declare const en: {
    readonly 'panel.title': "Autonomous run";
    readonly 'panel.cycle': "cycle {{cycle}}";
    readonly 'panel.paused': "paused";
    readonly 'panel.complete': "complete";
    readonly 'panel.running': "running";
    readonly 'panel.empty': "No blackboard yet — start a red-team-auto session to watch the agent decide.";
    readonly 'control.pause': "Pause";
    readonly 'control.resume': "Resume";
    readonly 'control.hint': "Inject hint";
    readonly 'control.hintPlaceholder': "Steer the agent (e.g. \"try the web path instead\")…";
    readonly 'node.goal': "Goal";
    readonly 'node.fact': "Fact";
    readonly 'node.intent': "Intent";
    readonly 'node.hint': "Hint";
};
export type AutographKey = keyof typeof en;
declare const zh: Record<AutographKey, string>;
export { en, zh };
//# sourceMappingURL=locales.d.ts.map