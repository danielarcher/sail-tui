'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
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
} = require('../lib/git');

function makeExec(responses) {
    // responses: array of { match: (args) => boolean, returns: string | Error }
    return (cmd, args) => {
        for (const r of responses) {
            if (r.match(args)) {
                if (r.returns instanceof Error) throw r.returns;
                return r.returns;
            }
        }
        throw new Error(`unexpected git invocation: ${args.join(' ')}`);
    };
}

function tempDirWithDotGit() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-tui-git-'));
    fs.mkdirSync(path.join(dir, '.git'));
    return dir;
}

test('isGitRepo returns false for missing dir or missing .git', () => {
    assert.equal(isGitRepo(null), false);
    assert.equal(isGitRepo(''), false);
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-tui-git-'));
    assert.equal(isGitRepo(plain), false);
});

test('isGitRepo returns true when .git exists', () => {
    const dir = tempDirWithDotGit();
    assert.equal(isGitRepo(dir), true);
});

test('readGitBranch strips trailing whitespace from the git output', () => {
    const exec = makeExec([
        { match: (a) => a.includes('rev-parse'), returns: 'main\n' },
    ]);
    assert.equal(readGitBranch('/repo', { exec }), 'main');
});

test('readGitBranch returns null when git throws', () => {
    const exec = makeExec([
        { match: (a) => a.includes('rev-parse'), returns: new Error('not a repo') },
    ]);
    assert.equal(readGitBranch('/repo', { exec }), null);
});

test('readGitBranch returns null when output is empty after trim', () => {
    const exec = makeExec([
        { match: (a) => a.includes('rev-parse'), returns: '   \n' },
    ]);
    assert.equal(readGitBranch('/repo', { exec }), null);
});

test('readGitDirty is true when porcelain output is non-empty', () => {
    const exec = makeExec([
        { match: (a) => a.includes('status'), returns: ' M file.js\n' },
    ]);
    assert.equal(readGitDirty('/repo', { exec }), true);
});

test('readGitDirty is false when porcelain output is empty', () => {
    const exec = makeExec([
        { match: (a) => a.includes('status'), returns: '' },
    ]);
    assert.equal(readGitDirty('/repo', { exec }), false);
});

test('readGitDirty is false when git throws', () => {
    const exec = makeExec([
        { match: (a) => a.includes('status'), returns: new Error('ow') },
    ]);
    assert.equal(readGitDirty('/repo', { exec }), false);
});

test('readGitState returns null for non-repositories', () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-tui-git-'));
    assert.equal(readGitState(plain), null);
});

test('readGitState combines branch and dirty flag', () => {
    const dir = tempDirWithDotGit();
    const exec = makeExec([
        { match: (a) => a.includes('rev-parse'), returns: 'dev\n' },
        { match: (a) => a.includes('status'),    returns: ' M foo.js\n' },
    ]);
    assert.deepEqual(readGitState(dir, { exec }), { branch: 'dev', dirty: true });
});

test('readGitState returns null when branch cannot be read', () => {
    const dir = tempDirWithDotGit();
    const exec = makeExec([
        { match: (a) => a.includes('rev-parse'), returns: new Error('no head') },
    ]);
    assert.equal(readGitState(dir, { exec }), null);
});

test('readGitState is clean when porcelain output is empty', () => {
    const dir = tempDirWithDotGit();
    const exec = makeExec([
        { match: (a) => a.includes('rev-parse'), returns: 'main\n' },
        { match: (a) => a.includes('status'),    returns: '' },
    ]);
    assert.deepEqual(readGitState(dir, { exec }), { branch: 'main', dirty: false });
});

// ── Upstream ────────────────────────────────────────────────────────────────

test('readGitUpstream returns the upstream ref name', () => {
    const exec = makeExec([
        { match: (a) => a.includes('@{u}'), returns: 'origin/main\n' },
    ]);
    assert.equal(readGitUpstream('/repo', { exec }), 'origin/main');
});

test('readGitUpstream returns null when no upstream is configured', () => {
    const exec = makeExec([
        { match: (a) => a.includes('@{u}'), returns: new Error('no upstream') },
    ]);
    assert.equal(readGitUpstream('/repo', { exec }), null);
});

test('readGitUpstream returns null on empty output', () => {
    const exec = makeExec([
        { match: (a) => a.includes('@{u}'), returns: '\n' },
    ]);
    assert.equal(readGitUpstream('/repo', { exec }), null);
});

// ── Ahead / behind ─────────────────────────────────────────────────────────

test('readGitAheadBehind parses tab-separated counts as behind then ahead', () => {
    const exec = makeExec([
        { match: (a) => a.includes('rev-list'), returns: '2\t5\n' },
    ]);
    assert.deepEqual(readGitAheadBehind('/repo', { exec }), { ahead: 5, behind: 2 });
});

test('readGitAheadBehind parses space-separated counts', () => {
    const exec = makeExec([
        { match: (a) => a.includes('rev-list'), returns: '0 0\n' },
    ]);
    assert.deepEqual(readGitAheadBehind('/repo', { exec }), { ahead: 0, behind: 0 });
});

test('readGitAheadBehind returns null when git throws', () => {
    const exec = makeExec([
        { match: (a) => a.includes('rev-list'), returns: new Error('no upstream') },
    ]);
    assert.equal(readGitAheadBehind('/repo', { exec }), null);
});

test('readGitAheadBehind returns null for malformed output', () => {
    const exec = makeExec([
        { match: (a) => a.includes('rev-list'), returns: 'garbage\n' },
    ]);
    assert.equal(readGitAheadBehind('/repo', { exec }), null);
});

// ── Status counts ───────────────────────────────────────────────────────────

test('parseStatusCounts returns zeroes for empty input', () => {
    assert.deepEqual(parseStatusCounts(''), { staged: 0, modified: 0, untracked: 0, conflicted: 0 });
});

test('parseStatusCounts counts modified/staged/untracked correctly', () => {
    const out = [
        ' M file1.js',         // modified (worktree)
        'M  file2.js',         // staged
        'MM file3.js',         // staged + modified
        '?? new.js',           // untracked
        'A  added.js',         // staged add
        ' D gone.js',          // worktree delete
    ].join('\n');
    const counts = parseStatusCounts(out);
    assert.equal(counts.untracked, 1);
    assert.equal(counts.staged, 3);       // M_, MM, A_
    assert.equal(counts.modified, 3);     // _M, MM, _D
    assert.equal(counts.conflicted, 0);
});

test('parseStatusCounts flags conflict markers', () => {
    const out = [
        'UU conflict.js',
        'AA bothAdded.js',
        'DD bothDeleted.js',
        'AU us-added.js',
    ].join('\n');
    const counts = parseStatusCounts(out);
    assert.equal(counts.conflicted, 4);
    assert.equal(counts.staged, 0);
    assert.equal(counts.modified, 0);
});

test('readGitStatusCounts returns null when git throws', () => {
    const exec = makeExec([
        { match: (a) => a.includes('status'), returns: new Error('nope') },
    ]);
    assert.equal(readGitStatusCounts('/repo', { exec }), null);
});

test('readGitStatusCounts returns parsed counts when git succeeds', () => {
    const exec = makeExec([
        { match: (a) => a.includes('status'), returns: ' M a.js\n?? b.js\n' },
    ]);
    assert.deepEqual(
        readGitStatusCounts('/repo', { exec }),
        { staged: 0, modified: 1, untracked: 1, conflicted: 0 }
    );
});

// ── Log ─────────────────────────────────────────────────────────────────────

test('parseLogOutput splits on unit separator and handles empty input', () => {
    assert.deepEqual(parseLogOutput(''), []);
    assert.deepEqual(parseLogOutput(null), []);
});

test('parseLogOutput parses hash/rel/subject/author fields', () => {
    const SEP = '\x1f';
    const raw = [
        `abc1234${SEP}2 hours ago${SEP}Fix bug${SEP}Alice`,
        `def5678${SEP}1 day ago${SEP}Add feature | with pipe${SEP}Bob`,
    ].join('\n');
    const entries = parseLogOutput(raw);
    assert.equal(entries.length, 2);
    assert.deepEqual(entries[0], { hash: 'abc1234', rel: '2 hours ago', subject: 'Fix bug', author: 'Alice' });
    assert.deepEqual(entries[1], { hash: 'def5678', rel: '1 day ago', subject: 'Add feature | with pipe', author: 'Bob' });
});

test('readGitLog honours the limit argument and clamps it', () => {
    let capturedArgs = null;
    const exec = (cmd, args) => {
        capturedArgs = args;
        return '';
    };
    readGitLog('/repo', 3, { exec });
    assert.ok(capturedArgs.includes('-n3'));

    capturedArgs = null;
    readGitLog('/repo', 0, { exec });
    assert.ok(capturedArgs.includes('-n1'), 'limit 0 should clamp to 1');

    capturedArgs = null;
    readGitLog('/repo', 9999, { exec });
    assert.ok(capturedArgs.includes('-n50'), 'huge limit should clamp to 50');
});

test('readGitLog returns null when git throws', () => {
    const exec = makeExec([
        { match: (a) => a.includes('log'), returns: new Error('no history') },
    ]);
    assert.equal(readGitLog('/repo', 5, { exec }), null);
});

test('readGitLog returns parsed entries on success', () => {
    const SEP = '\x1f';
    const exec = makeExec([
        { match: (a) => a.includes('log'), returns: `abc${SEP}now${SEP}hi${SEP}me\n` },
    ]);
    const log = readGitLog('/repo', 5, { exec });
    assert.equal(log.length, 1);
    assert.equal(log[0].hash, 'abc');
    assert.equal(log[0].subject, 'hi');
});

// ── Stash ───────────────────────────────────────────────────────────────────

test('readGitStashCount returns 0 when git throws', () => {
    const exec = makeExec([
        { match: (a) => a.includes('stash'), returns: new Error('no stash') },
    ]);
    assert.equal(readGitStashCount('/repo', { exec }), 0);
});

test('readGitStashCount returns 0 for empty output', () => {
    const exec = makeExec([
        { match: (a) => a.includes('stash'), returns: '' },
    ]);
    assert.equal(readGitStashCount('/repo', { exec }), 0);
});

test('readGitStashCount counts one entry per line', () => {
    const exec = makeExec([
        { match: (a) => a.includes('stash'), returns: 'stash@{0}: WIP\nstash@{1}: more\n' },
    ]);
    assert.equal(readGitStashCount('/repo', { exec }), 2);
});

// ── readGitDetails (combiner) ───────────────────────────────────────────────

test('readGitDetails returns null when dir is not a git repo', () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-tui-git-'));
    assert.equal(readGitDetails(plain), null);
});

test('readGitDetails combines branch, counts, upstream, ahead/behind, log, stash', () => {
    const dir = tempDirWithDotGit();
    const SEP = '\x1f';
    const exec = (cmd, args) => {
        if (args.includes('rev-parse') && args.includes('@{u}')) return 'origin/main\n';
        if (args.includes('rev-parse') && args.includes('HEAD')) return 'main\n';
        if (args.includes('status')) return ' M a.js\n?? b.js\n';
        if (args.includes('rev-list')) return '1\t2\n';
        if (args.includes('log')) return `abc${SEP}now${SEP}commit${SEP}me\n`;
        if (args.includes('stash')) return 'stash@{0}: WIP\n';
        throw new Error(`unexpected: ${args.join(' ')}`);
    };
    const details = readGitDetails(dir, { exec });
    assert.equal(details.branch, 'main');
    assert.equal(details.dirty, true);
    assert.equal(details.upstream, 'origin/main');
    assert.equal(details.ahead, 2);
    assert.equal(details.behind, 1);
    assert.deepEqual(details.counts, { staged: 0, modified: 1, untracked: 1, conflicted: 0 });
    assert.equal(details.log.length, 1);
    assert.equal(details.stash, 1);
});

test('readGitDetails reports clean tree and skips ahead/behind without upstream', () => {
    const dir = tempDirWithDotGit();
    const exec = (cmd, args) => {
        if (args.includes('rev-parse') && args.includes('@{u}')) throw new Error('no upstream');
        if (args.includes('rev-parse') && args.includes('HEAD')) return 'feature-x\n';
        if (args.includes('status')) return '';
        if (args.includes('log')) return '';
        if (args.includes('stash')) return '';
        if (args.includes('rev-list')) throw new Error('should not run without upstream');
        throw new Error(`unexpected: ${args.join(' ')}`);
    };
    const details = readGitDetails(dir, { exec });
    assert.equal(details.branch, 'feature-x');
    assert.equal(details.dirty, false);
    assert.equal(details.upstream, null);
    assert.equal(details.ahead, null);
    assert.equal(details.behind, null);
    assert.deepEqual(details.counts, { staged: 0, modified: 0, untracked: 0, conflicted: 0 });
    assert.equal(details.log.length, 0);
    assert.equal(details.stash, 0);
});
