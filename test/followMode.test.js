'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { isAtBottom, FOLLOW_THRESHOLD } = require('../lib/followMode');

test('FOLLOW_THRESHOLD is a sensible default just below 100', () => {
    assert.ok(FOLLOW_THRESHOLD > 90 && FOLLOW_THRESHOLD < 100);
});

test('isAtBottom returns true at 100%', () => {
    assert.equal(isAtBottom(100), true);
});

test('isAtBottom returns true at the default threshold', () => {
    assert.equal(isAtBottom(FOLLOW_THRESHOLD), true);
});

test('isAtBottom returns false below the threshold', () => {
    assert.equal(isAtBottom(FOLLOW_THRESHOLD - 1), false);
    assert.equal(isAtBottom(0), false);
    assert.equal(isAtBottom(50), false);
});

test('isAtBottom rejects non-finite and non-numeric values', () => {
    assert.equal(isAtBottom(NaN),       false);
    assert.equal(isAtBottom(Infinity),  false);
    assert.equal(isAtBottom(-Infinity), false);
    assert.equal(isAtBottom(undefined), false);
    assert.equal(isAtBottom(null),      false);
    assert.equal(isAtBottom('100'),     false);
});

test('isAtBottom accepts a custom threshold', () => {
    assert.equal(isAtBottom(50, 50), true);
    assert.equal(isAtBottom(49, 50), false);
});
