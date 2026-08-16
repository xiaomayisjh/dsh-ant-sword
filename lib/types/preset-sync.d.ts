/**
 * Sync the bundled red-team agent preset into the harness's writable preset
 * root so the roster discovers it. The bundle's patch cannot register a preset
 * root (the launcher overlays `roots` to the shipped root only), so the preset
 * is materialized under `$DSH_HOME/.agent-presets/red-team/`, which the roster
 * appends as a `user` root via `includeUserRoot`. The sync is idempotent: it
 * rewrites only files whose content differs.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/preset-sync
 */
/** The red-team preset id; also its directory name under the user preset root. */
export declare const RED_TEAM_PRESET_ID = "red-team";
/** The autonomous red-team preset id. */
export declare const RED_TEAM_AUTO_PRESET_ID = "red-team-auto";
/** Sync the manual red-team preset. */
export declare function syncRedTeamPreset(): Promise<string>;
/** Sync the autonomous red-team-auto preset. */
export declare function syncRedTeamAutoPreset(): Promise<string>;
//# sourceMappingURL=preset-sync.d.ts.map