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

function readGitUpstream(dir, opts = {}) {
    const exec = opts.exec || defaultExec;
    const timeout = opts.timeout || DEFAULT_TIMEOUT_MS;
    const out = runGit(exec, dir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], timeout);
    if (out === null) return null;
    const name = out.trim();
    return name.length > 0 ? name : null;
}

function readGitAheadBehind(dir, opts = {}) {
    const exec = opts.exec || defaultExec;
    const timeout = opts.timeout || DEFAULT_TIMEOUT_MS;
    const out = runGit(exec, dir, ['rev-list', '--left-right', '--count', '@{u}...HEAD'], timeout);
    if (out === null) return null;
    const parts = out.trim().split(/\s+/);
    if (parts.length !== 2) return null;
    const behind = Number.parseInt(parts[0], 10);
    const ahead = Number.parseInt(parts[1], 10);
    if (!Number.isFinite(behind) || !Number.isFinite(ahead)) return null;
    return { ahead, behind };
}

function parseStatusCounts(porcelain) {
    const counts = { staged: 0, modified: 0, untracked: 0, conflicted: 0 };
    if (!porcelain) return counts;
    const lines = porcelain.split('\n').filter(l => l.length > 0);
    for (const line of lines) {
        // Porcelain v1: "XY path" where X=index, Y=worktree. Need at least 2 chars.
        if (line.length < 2) continue;
        const x = line[0];
        const y = line[1];
        if (x === '?' && y === '?') { counts.untracked += 1; continue; }
        if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
            counts.conflicted += 1;
            continue;
        }
        if (x !== ' ' && x !== '?') counts.staged += 1;
        if (y !== ' ' && y !== '?') counts.modified += 1;
    }
    return counts;
}

function readGitStatusCounts(dir, opts = {}) {
    const exec = opts.exec || defaultExec;
    const timeout = opts.timeout || DEFAULT_TIMEOUT_MS;
    const out = runGit(exec, dir, ['status', '--porcelain'], timeout);
    if (out === null) return null;
    return parseStatusCounts(out);
}

const LOG_SEP = '\x1f';

function parseLogOutput(raw) {
    if (!raw) return [];
    return raw.split('\n')
        .filter(l => l.length > 0)
        .map(line => {
            const parts = line.split(LOG_SEP);
            return {
                hash: parts[0] || '',
                rel: parts[1] || '',
                subject: parts[2] || '',
                author: parts[3] || '',
            };
        });
}

function readGitLog(dir, limit = 5, opts = {}) {
    const exec = opts.exec || defaultExec;
    const timeout = opts.timeout || DEFAULT_TIMEOUT_MS;
    const n = Math.max(1, Math.min(limit | 0, 50));
    const format = ['%h', '%cr', '%s', '%an'].join(LOG_SEP);
    const out = runGit(exec, dir, ['log', `-n${n}`, `--pretty=format:${format}`], timeout);
    if (out === null) return null;
    return parseLogOutput(out);
}

function readGitStashCount(dir, opts = {}) {
    const exec = opts.exec || defaultExec;
    const timeout = opts.timeout || DEFAULT_TIMEOUT_MS;
    const out = runGit(exec, dir, ['stash', 'list'], timeout);
    if (out === null) return 0;
    return out.split('\n').filter(l => l.length > 0).length;
}

function readGitDetails(dir, opts = {}) {
    if (!isGitRepo(dir)) return null;
    const branch = readGitBranch(dir, opts);
    if (!branch) return null;
    const counts = readGitStatusCounts(dir, opts) || { staged: 0, modified: 0, untracked: 0, conflicted: 0 };
    const dirty = counts.staged + counts.modified + counts.untracked + counts.conflicted > 0;
    const upstream = readGitUpstream(dir, opts);
    const aheadBehind = upstream ? readGitAheadBehind(dir, opts) : null;
    const log = readGitLog(dir, opts.logLimit || 5, opts) || [];
    const stash = readGitStashCount(dir, opts);
    return {
        branch,
        dirty,
        upstream,
        ahead: aheadBehind ? aheadBehind.ahead : null,
        behind: aheadBehind ? aheadBehind.behind : null,
        counts,
        log,
        stash,
    };
}

module.exports = {
    isGitRepo,
    readGitBranch,
    readGitDirty,
    readGitState,
    readGitUpstream,
    readGitAheadBehind,
    readGitStatusCounts,
    readGitLog,
    readGitStashCount,
    readGitDetails,
    parseStatusCounts,
    parseLogOutput,
    DEFAULT_TIMEOUT_MS,
};
