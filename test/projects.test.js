'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { PROJECTS } = require('../lib/projects');

test('PROJECTS is a non-empty array', () => {
    assert.ok(Array.isArray(PROJECTS));
    assert.ok(PROJECTS.length > 0);
});

test('every project has the required shape', () => {
    for (const p of PROJECTS) {
        assert.equal(typeof p.name, 'string',    `name on ${JSON.stringify(p)}`);
        assert.equal(typeof p.display, 'string', `display on ${p.name}`);
        assert.equal(typeof p.url, 'string',     `url on ${p.name}`);
        assert.equal(typeof p.reverb, 'boolean', `reverb on ${p.name}`);
        assert.equal(typeof p.queue, 'boolean',  `queue on ${p.name}`);
        assert.match(p.accent, /^#[0-9a-f]{6}$/i, `accent on ${p.name}`);
    }
});

test('project names are unique', () => {
    const names = PROJECTS.map(p => p.name);
    assert.equal(new Set(names).size, names.length);
});

test('project URLs are unique', () => {
    const urls = PROJECTS.map(p => p.url);
    assert.equal(new Set(urls).size, urls.length);
});
