'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    loadTestCache,
    saveTestCache,
    getResult,
    setResult,
    emptyCache,
} = require('../lib/testCache');

function tempCachePath() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-tui-tests-'));
    return path.join(dir, 'tests.json');
}

test('loadTestCache returns an empty cache for a missing file', () => {
    const cache = loadTestCache('/nonexistent/path/does-not-exist.json');
    assert.deepEqual(cache, emptyCache());
});

test('loadTestCache returns an empty cache for malformed JSON', () => {
    const p = tempCachePath();
    fs.writeFileSync(p, 'not json');
    assert.deepEqual(loadTestCache(p), emptyCache());
});

test('saveTestCache + loadTestCache roundtrip a result', () => {
    const p = tempCachePath();
    const cache = setResult(emptyCache(), 'proj', {
        status: 'pass',
        passed: 10,
        failed: 0,
        skipped: 1,
        duration: 1.2,
    });
    assert.ok(saveTestCache(cache, p));

    const loaded = loadTestCache(p);
    const result = getResult(loaded, 'proj');
    assert.equal(result.status, 'pass');
    assert.equal(result.passed, 10);
    assert.equal(result.skipped, 1);
    assert.ok(result.ranAt, 'ranAt should be populated automatically');
});

test('setResult overwrites a previous result for the same project', () => {
    let cache = emptyCache();
    cache = setResult(cache, 'proj', { status: 'pass', passed: 5, failed: 0 });
    cache = setResult(cache, 'proj', { status: 'fail', passed: 3, failed: 1 });
    const r = getResult(cache, 'proj');
    assert.equal(r.status, 'fail');
    assert.equal(r.failed, 1);
});

test('setResult keeps other projects intact', () => {
    let cache = emptyCache();
    cache = setResult(cache, 'a', { status: 'pass' });
    cache = setResult(cache, 'b', { status: 'fail' });
    assert.equal(getResult(cache, 'a').status, 'pass');
    assert.equal(getResult(cache, 'b').status, 'fail');
});

test('getResult returns null when no entry exists', () => {
    assert.equal(getResult(emptyCache(), 'missing'), null);
});

test('saveTestCache writes atomically (tmp file is removed after rename)', () => {
    const p = tempCachePath();
    saveTestCache(setResult(emptyCache(), 'x', { status: 'pass' }), p);
    assert.equal(fs.existsSync(p), true);
    assert.equal(fs.existsSync(`${p}.tmp`), false);
});
