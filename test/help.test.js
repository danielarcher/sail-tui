'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { HELP_KEYS, formatHelpLines } = require('../lib/help');

test('HELP_KEYS is a non-empty list of {key, action} entries', () => {
    assert.ok(Array.isArray(HELP_KEYS));
    assert.ok(HELP_KEYS.length > 0);
    for (const entry of HELP_KEYS) {
        assert.equal(typeof entry.key, 'string');
        assert.equal(typeof entry.action, 'string');
        assert.ok(entry.key.length > 0);
        assert.ok(entry.action.length > 0);
    }
});

test('HELP_KEYS covers the core keymap', () => {
    const keys = HELP_KEYS.map(e => e.key).join(' ');
    for (const token of ['j', 'u', 'd', 's', 'r', 'h', 'c', 'o', 'l', 'G', 'a', 'Esc', 'f', '?', 'q']) {
        assert.ok(keys.includes(token), `keymap should document "${token}"`);
    }
});

test('formatHelpLines returns one line per keymap entry', () => {
    const lines = formatHelpLines();
    assert.equal(lines.length, HELP_KEYS.length);
});

test('formatHelpLines pads the key column to the requested width', () => {
    const lines = formatHelpLines([{ key: 'x', action: 'do thing' }], 10);
    assert.equal(lines[0], '  x           do thing');
});

test('formatHelpLines accepts a custom keymap', () => {
    const lines = formatHelpLines([{ key: 'a', action: 'alpha' }, { key: 'b', action: 'beta' }]);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /alpha/);
    assert.match(lines[1], /beta/);
});
