'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { cancelChild, DEFAULT_SIGNAL } = require('../lib/cancel');

function makeChild({ killed = false, killReturns = true, killThrows = false } = {}) {
    const calls = [];
    return {
        killed,
        kill(signal) {
            calls.push(signal);
            if (killThrows) throw new Error('kill failed');
            return killReturns;
        },
        get calls() { return calls; },
    };
}

test('cancelChild returns false when child is missing', () => {
    assert.equal(cancelChild(null), false);
    assert.equal(cancelChild(undefined), false);
});

test('cancelChild returns false when child has no kill method', () => {
    assert.equal(cancelChild({}), false);
});

test('cancelChild returns false when child is already killed', () => {
    const child = makeChild({ killed: true });
    assert.equal(cancelChild(child), false);
    assert.equal(child.calls.length, 0, 'kill should not be called on already-killed child');
});

test('cancelChild sends SIGTERM by default', () => {
    const child = makeChild();
    const ok = cancelChild(child);
    assert.equal(ok, true);
    assert.deepEqual(child.calls, [DEFAULT_SIGNAL]);
});

test('cancelChild passes through a custom signal', () => {
    const child = makeChild();
    cancelChild(child, 'SIGINT');
    assert.deepEqual(child.calls, ['SIGINT']);
});

test('cancelChild returns false when kill returns false (process already gone)', () => {
    const child = makeChild({ killReturns: false });
    assert.equal(cancelChild(child), false);
});

test('cancelChild swallows kill exceptions and returns false', () => {
    const child = makeChild({ killThrows: true });
    assert.equal(cancelChild(child), false);
});
