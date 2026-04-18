'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { isGitRepo, readGitBranch, readGitDirty, readGitState } = require('../lib/git');

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
