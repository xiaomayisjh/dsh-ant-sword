/**
 * Git snapshot provider: side-effect-free unreferenced objects via
 * `git stash create` / `git commit-tree`, restored worktree-only with explicit
 * paths. Never `reset --hard`, never `clean`, never touch the index or history.
 *
 * @module @deepseek-ai/dsh-ant-sword-harness/rewind/providers/git
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);
const HEX = /^[0-9a-f]{40,64}$/i;
/** Assert a value is a bare hex git object id before it is passed to git. */
function assertHexRef(ref) {
    if (!HEX.test(ref)) {
        throw new Error(`refusing to use a non-hex git ref: ${JSON.stringify(ref)}`);
    }
}
/** Run a whitelisted git verb; rejects on non-zero exit. */
async function git(gitBin, cwd, args, signal) {
    const { stdout } = await execFileP(gitBin, ['-C', cwd, ...args], {
        signal,
        maxBuffer: 64 * 1024 * 1024,
    });
    return stdout;
}
/** Whether `cwd` is inside a git work tree with a born HEAD. */
async function probe(gitBin, cwd, signal) {
    try {
        const inside = await git(gitBin, cwd, ['rev-parse', '--is-inside-work-tree'], signal);
        if (inside.trim() !== 'true')
            return false;
        // Unborn HEAD: snapshot primitives require HEAD, so degrade until the first commit.
        await git(gitBin, cwd, ['rev-parse', '--verify', 'HEAD'], signal);
        return true;
    }
    catch {
        return false;
    }
}
/** Capture the working tree as an unreferenced commit object. */
async function capture(gitBin, cwd, signal) {
    // `stash create` produces a commit of the dirty tree (or empty output when clean).
    const created = (await git(gitBin, cwd, ['stash', 'create'], signal)).trim();
    let ref;
    if (created !== '' && HEX.test(created)) {
        ref = created;
    }
    else {
        // Clean tree: snapshot HEAD's tree as an unreferenced commit with HEAD as parent.
        const tree = (await git(gitBin, cwd, ['rev-parse', 'HEAD^{tree}'], signal)).trim();
        assertHexRef(tree);
        const head = (await git(gitBin, cwd, ['rev-parse', 'HEAD'], signal)).trim();
        assertHexRef(head);
        ref = (await git(gitBin, cwd, ['commit-tree', tree, '-p', head, '-m', 'ant-sword checkpoint'], signal)).trim();
    }
    assertHexRef(ref);
    // Count tracked files covered by the snapshot for reporting.
    const listing = await git(gitBin, cwd, ['ls-tree', '-r', '--name-only', ref], signal);
    const fileCount = listing === '' ? 0 : listing.split('\n').filter(line => line !== '').length;
    const numstat = await git(gitBin, cwd, ['diff-tree', '-r', '--numstat', 'HEAD', ref], signal).catch(() => '');
    let byteSize = 0;
    for (const line of numstat.split('\n')) {
        const added = line.split('\t')[0];
        if (added !== undefined && added !== '' && added !== '-') {
            const n = Number.parseInt(added, 10);
            if (Number.isFinite(n))
                byteSize += n;
        }
    }
    return { ref, fileCount, byteSize };
}
/** List the paths a snapshot would touch (tracked files present in the ref). */
async function trackedPaths(gitBin, cwd, ref, signal) {
    assertHexRef(ref);
    const listing = await git(gitBin, cwd, ['ls-tree', '-r', '--name-only', ref], signal);
    return listing.split('\n').map(line => line.trim()).filter(line => line !== '');
}
/** Create the git provider bound to a `gitBin`. */
export function makeGitProvider(gitBin) {
    return {
        kind: 'git',
        available: cwd => probe(gitBin, cwd),
        capture: (cwd, signal) => capture(gitBin, cwd, signal),
        async restore(cwd, ref, signal) {
            assertHexRef(ref);
            const paths = await trackedPaths(gitBin, cwd, ref, signal);
            if (paths.length === 0)
                return { restored: 0 };
            // Worktree-only, path-explicit: never `-- .`, which would delete files
            // staged after the checkpoint. Files created after the checkpoint stay.
            await git(gitBin, cwd, ['restore', '--worktree', `--source=${ref}`, '--', ...paths], signal);
            return { restored: paths.length };
        },
        async preview(cwd, ref) {
            const paths = await trackedPaths(gitBin, cwd, ref);
            const status = await git(gitBin, cwd, ['status', '--porcelain', '--', ...paths]).catch(() => '');
            const changed = new Set(status.split('\n')
                .map(line => line.slice(3))
                .map(line => line.trim())
                .filter(line => line !== ''));
            const overwritten = paths.filter(path => changed.has(path));
            const kept = paths.filter(path => !changed.has(path));
            return { overwritten, kept };
        },
    };
}
//# sourceMappingURL=git.js.map