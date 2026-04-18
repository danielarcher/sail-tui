'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSailAllArgs, isValidAction, labelForAction, VALID_ACTIONS } = require('../lib/actions');

test('buildSailAllArgs returns [action] with no project', () => {
    assert.deepEqual(buildSailAllArgs('up'), ['up']);
});

test('buildSailAllArgs appends project name', () => {
    assert.deepEqual(buildSailAllArgs('dev', 'lootkeep'), ['dev', 'lootkeep']);
});

test('buildSailAllArgs rejects unknown actions', () => {
    assert.throws(() => buildSailAllArgs('nuke'), /Unknown action/);
});

test('all documented actions are valid', () => {
    for (const action of ['up', 'down', 'dev', 'restart', 'heal']) {
        assert.equal(isValidAction(action), true, action);
    }
});

test('labelForAction renames down to stop', () => {
    assert.equal(labelForAction('down'), 'stop');
});

test('labelForAction passes other actions through unchanged', () => {
    assert.equal(labelForAction('up'), 'up');
    assert.equal(labelForAction('dev'), 'dev');
    assert.equal(labelForAction('restart'), 'restart');
    assert.equal(labelForAction('heal'), 'heal');
});

test('VALID_ACTIONS exposes the canonical action set', () => {
    assert.ok(VALID_ACTIONS instanceof Set);
    assert.equal(VALID_ACTIONS.size, 5);
});
