'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validateProjects } = require('../lib/validateProjects');
const { PROJECTS } = require('../lib/projects');

const OK = Object.freeze({
    name: 'alpha',
    display: 'Alpha',
    url: 'alpha.local',
    reverb: false,
    queue: false,
    accent: '#aabbcc',
});

test('validateProjects returns the array on success', () => {
    const input = [OK];
    assert.equal(validateProjects(input), input);
});

test('validateProjects accepts the real PROJECTS list', () => {
    assert.doesNotThrow(() => validateProjects(PROJECTS));
});

test('validateProjects rejects non-arrays', () => {
    assert.throws(() => validateProjects(null),  /must be an array/);
    assert.throws(() => validateProjects({}),    /must be an array/);
    assert.throws(() => validateProjects('nope'),/must be an array/);
});

test('validateProjects rejects empty arrays', () => {
    assert.throws(() => validateProjects([]), /must not be empty/);
});

test('validateProjects flags missing string fields', () => {
    for (const field of ['name', 'display', 'url']) {
        const bad = { ...OK, [field]: undefined };
        assert.throws(
            () => validateProjects([bad]),
            new RegExp(`missing required string field "${field}"`),
            `should reject missing ${field}`,
        );
    }
});

test('validateProjects flags non-boolean reverb/queue', () => {
    for (const field of ['reverb', 'queue']) {
        const bad = { ...OK, [field]: 'yes' };
        assert.throws(
            () => validateProjects([bad]),
            new RegExp(`missing required boolean field "${field}"`),
        );
    }
});

test('validateProjects flags invalid hex colors', () => {
    const cases = ['', 'red', '#abc', '#1234567', 'aabbcc'];
    for (const accent of cases) {
        const bad = { ...OK, accent };
        assert.throws(() => validateProjects([bad]), /invalid accent color/);
    }
});

test('validateProjects rejects duplicate names', () => {
    const a = { ...OK, name: 'same', url: 'a.local' };
    const b = { ...OK, name: 'same', url: 'b.local' };
    assert.throws(() => validateProjects([a, b]), /name "same" is duplicated/);
});

test('validateProjects rejects duplicate urls', () => {
    const a = { ...OK, name: 'a', url: 'dup.local' };
    const b = { ...OK, name: 'b', url: 'dup.local' };
    assert.throws(() => validateProjects([a, b]), /url "dup\.local" is duplicated/);
});

test('validateProjects error messages include the project label', () => {
    const bad = { ...OK };
    delete bad.display;
    assert.throws(() => validateProjects([bad]), /"alpha" \(#0\)/);
});

test('validateProjects labels a malformed entry by index when name is missing', () => {
    assert.throws(() => validateProjects([{}]), /#0/);
});
