'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync: defaultExec } = require('child_process');

const DEFAULT_TIMEOUT_MS = 1500;

function runGit(exec, dir, args, timeout) {
    try {
        const out = exec('git', ['-C', dir, ...args], {
            encoding: 'utf8',
            timeout,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        return typeof out === 'string' ? out : out.toString('utf8');
    } catch {
        return null;
    }
}

function isGitRepo(dir) {
    if (typeof dir !== 'string' || dir.length === 0) return false;
    // Handles both real repos and worktrees (.git as a file pointing at gitdir).
    return fs.existsSync(path.join(dir, '.git'));
}

function readGitBranch(dir, opts = {}) {
    const exec = opts.exec || defaultExec;
    const timeout = opts.timeout || DEFAULT_TIMEOUT_MS;
    const out = runGit(exec, dir, ['rev-parse', '--abbrev-ref', 'HEAD'], timeout);
    if (out === null) return null;
    const branch = out.trim();
    return branch.length > 0 ? branch : null;
}

function readGitDirty(dir, opts = {}) {
    const exec = opts.exec || defaultExec;
    const timeout = opts.timeout || DEFAULT_TIMEOUT_MS;
    const out = runGit(exec, dir, ['status', '--porcelain'], timeout);
    if (out === null) return false;
    return out.trim().length > 0;
}

function readGitState(dir, opts = {}) {
    if (!isGitRepo(dir)) return null;
    const branch = readGitBranch(dir, opts);
    if (!branch) return null;
    return { branch, dirty: readGitDirty(dir, opts) };
}

module.exports = {
    isGitRepo,
    readGitBranch,
    readGitDirty,
    readGitState,
    DEFAULT_TIMEOUT_MS,
};
