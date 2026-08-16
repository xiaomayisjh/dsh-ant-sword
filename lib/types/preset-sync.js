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
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
/** The bundled preset source directories (one level above the built `lib/`). */
const PRESET_SOURCE = fileURLToPath(new URL('../preset/red-team', import.meta.url));
const AUTO_PRESET_SOURCE = fileURLToPath(new URL('../preset/red-team-auto', import.meta.url));
/** The red-team preset id; also its directory name under the user preset root. */
export const RED_TEAM_PRESET_ID = 'red-team';
/** The autonomous red-team preset id. */
export const RED_TEAM_AUTO_PRESET_ID = 'red-team-auto';
/** The harness-home user preset directory the roster scans. */
const USER_PRESET_DIR = '.agent-presets';
async function readPresetFiles(dir, prefix = '') {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    }
    catch {
        return [];
    }
    const out = [];
    for (const entry of entries) {
        const path = join(dir, entry.name);
        const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
        if (entry.isDirectory())
            out.push(...await readPresetFiles(path, rel));
        else if (entry.isFile())
            out.push({ rel, content: await readFile(path) });
    }
    return out;
}
/**
 * Copy one bundled preset into the user preset root, overwriting only files
 * whose content changed. Never deletes files the user added beside it.
 * @returns the absolute target directory the preset was synced into.
 */
async function syncPreset(source, id) {
    const target = join(dshHomePath(USER_PRESET_DIR), id);
    const files = await readPresetFiles(source);
    for (const file of files) {
        const dest = join(target, file.rel);
        let existing;
        try {
            existing = await readFile(dest);
        }
        catch {
            existing = undefined;
        }
        if (existing !== undefined && existing.equals(file.content))
            continue;
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, file.content);
    }
    return target;
}
/** Sync the manual red-team preset. */
export async function syncRedTeamPreset() {
    return syncPreset(PRESET_SOURCE, RED_TEAM_PRESET_ID);
}
/** Sync the autonomous red-team-auto preset. */
export async function syncRedTeamAutoPreset() {
    return syncPreset(AUTO_PRESET_SOURCE, RED_TEAM_AUTO_PRESET_ID);
}
//# sourceMappingURL=preset-sync.js.map