'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    loadState,
    saveState,
    resolveSelectedIndex,
    resolveLogTab,
    SCHEMA_VERSION,
} = require('../lib/persistence');

function tempFile(name = 'state.json') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-tui-persist-'));
    return path.join(dir, name);
}

const SAMPLE_PROJECTS = [
    { name: 'alpha', reverb: false, queue: false },
    { name: 'beta',  reverb: true,  queue: false },
    { name: 'gamma', reverb: true,  queue: true  },
];

test('loadState returns a default object when the file is missing', () => {
    const p = tempFile('missing.json');
    const state = loadState(p);
    assert.equal(state.version, SCHEMA_VERSION);
});

test('loadState returns a default object when the file is malformed JSON', () => {
    const p = tempFile();
    fs.writeFileSync(p, '{not json');
    const state = loadState(p);
    assert.equal(state.version, SCHEMA_VERSION);
});

test('loadState returns the parsed object when the file is valid', () => {
    const p = tempFile();
    fs.writeFileSync(p, JSON.stringify({ version: 1, selectedProject: 'lootkeep', logTab: 'reverb' }));
    const state = loadState(p);
    assert.equal(state.selectedProject, 'lootkeep');
    assert.equal(state.logTab, 'reverb');
});

test('saveState writes a JSON payload including the schema version', () => {
    const p = tempFile();
    const ok = saveState({ selectedProject: 'alpha', logTab: 'vite' }, p);
    assert.equal(ok, true);

    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.equal(parsed.version, SCHEMA_VERSION);
    assert.equal(parsed.selectedProject, 'alpha');
    assert.equal(parsed.logTab, 'vite');
});

test('saveState overwrites any previous contents', () => {
    const p = tempFile();
    saveState({ selectedProject: 'alpha' }, p);
    saveState({ selectedProject: 'beta' }, p);
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.equal(parsed.selectedProject, 'beta');
});

test('saveState creates missing parent directories', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-tui-persist-'));
    const p = path.join(root, 'nested', 'dir', 'state.json');
    const ok = saveState({ selectedProject: 'x' }, p);
    assert.equal(ok, true);
    assert.ok(fs.existsSync(p));
});

test('resolveSelectedIndex returns the index matching the saved name', () => {
    assert.equal(resolveSelectedIndex(SAMPLE_PROJECTS, 'beta'), 1);
    assert.equal(resolveSelectedIndex(SAMPLE_PROJECTS, 'gamma'), 2);
});

test('resolveSelectedIndex falls back to 0 when the saved name is missing', () => {
    assert.equal(resolveSelectedIndex(SAMPLE_PROJECTS, 'unknown'), 0);
    assert.equal(resolveSelectedIndex(SAMPLE_PROJECTS, undefined), 0);
    assert.equal(resolveSelectedIndex(SAMPLE_PROJECTS, null), 0);
    assert.equal(resolveSelectedIndex(SAMPLE_PROJECTS, 42), 0);
});

test('resolveSelectedIndex is safe on malformed project lists', () => {
    assert.equal(resolveSelectedIndex(null, 'alpha'), 0);
    assert.equal(resolveSelectedIndex([], 'alpha'), 0);
});

test('resolveLogTab returns the saved tab when available for the project', () => {
    assert.equal(resolveLogTab(SAMPLE_PROJECTS[2], 'queue'),   'queue');
    assert.equal(resolveLogTab(SAMPLE_PROJECTS[1], 'reverb'),  'reverb');
    assert.equal(resolveLogTab(SAMPLE_PROJECTS[0], 'vite'),    'vite');
    assert.equal(resolveLogTab(SAMPLE_PROJECTS[0], 'laravel'), 'laravel', 'laravel is always available');
    assert.equal(resolveLogTab(SAMPLE_PROJECTS[0], 'tests'),   'tests',   'tests is always available');
});

test('resolveLogTab falls back to vite when the saved tab is unavailable', () => {
    assert.equal(resolveLogTab(SAMPLE_PROJECTS[0], 'reverb'), 'vite', 'alpha has no reverb');
    assert.equal(resolveLogTab(SAMPLE_PROJECTS[0], 'queue'),  'vite', 'alpha has no queue');
    assert.equal(resolveLogTab(SAMPLE_PROJECTS[1], 'queue'),  'vite', 'beta has no queue');
});

test('resolveLogTab falls back to vite for unknown tabs or missing projects', () => {
    assert.equal(resolveLogTab(SAMPLE_PROJECTS[2], 'unknown'), 'vite');
    assert.equal(resolveLogTab(null, 'vite'), 'vite');
});
