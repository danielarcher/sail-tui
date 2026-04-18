'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { C, fg, bold } = require('../lib/theme');

test('fg wraps text in blessed color tags', () => {
    assert.equal(fg('green', 'hello'), '{green-fg}hello{/green-fg}');
});

test('bold wraps text in blessed bold tags', () => {
    assert.equal(bold('SAIL'), '{bold}SAIL{/bold}');
});

test('palette exposes the expected semantic keys', () => {
    for (const key of ['dim', 'mid', 'text', 'bright', 'green', 'red', 'yellow', 'cyan', 'magenta', 'orange', 'border']) {
        assert.match(C[key], /^#[0-9a-f]{6}$/i, `${key} should be a hex color`);
    }
});
