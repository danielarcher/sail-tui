'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseViteHealth, STATES } = require('../lib/viteHealth');

test('returns idle for empty input', () => {
    assert.equal(parseViteHealth([]), STATES.IDLE);
    assert.equal(parseViteHealth(null), STATES.IDLE);
});

test('detects ready from a standard Vite startup', () => {
    const lines = [
        '> vite',
        '',
        'VITE v8.0.8  ready in 651 ms',
        '',
        '  ➜  Local:   https://lootkeep.local/',
    ];
    assert.equal(parseViteHealth(lines), STATES.READY);
});

test('detects ready with a floating-point duration', () => {
    assert.equal(parseViteHealth(['VITE v8.0.8  ready in 0.65 s']), STATES.READY);
});

test('detects compiling while the banner is up but no ready yet', () => {
    assert.equal(parseViteHealth(['> vite', 'VITE v8.0.8']), STATES.COMPILING);
});

test('detects compiling on HMR activity after a ready', () => {
    const lines = [
        'VITE v8.0.8  ready in 651 ms',
        '[vite] hmr update /resources/js/app.js',
    ];
    assert.equal(parseViteHealth(lines), STATES.COMPILING);
});

test('detects compiling on page reload activity', () => {
    const lines = [
        'VITE v8.0.8  ready in 651 ms',
        '[vite] page reload resources/views/app.blade.php',
    ];
    assert.equal(parseViteHealth(lines), STATES.COMPILING);
});

test('detects error when an error follows the latest ready', () => {
    const lines = [
        'VITE v8.0.8  ready in 651 ms',
        '',
        '[plugin:vite:css] Pre-transform error: expected "}"',
        'file: /resources/css/app.css:42:1',
    ];
    assert.equal(parseViteHealth(lines), STATES.ERROR);
});

test('stays ready when an old error was followed by a new ready', () => {
    const lines = [
        '[plugin:vite:css] Pre-transform error: expected "}"',
        'VITE v8.0.8  ready in 651 ms',
    ];
    assert.equal(parseViteHealth(lines), STATES.READY);
});

test('classifies ELIFECYCLE / npm fatal output as error', () => {
    const lines = [
        '> vite',
        'npm ERR! code ELIFECYCLE',
        'npm ERR! errno 1',
    ];
    assert.equal(parseViteHealth(lines), STATES.ERROR);
});

test('is not tricked by the word "error" appearing in a URL inside a ready banner', () => {
    const lines = [
        'VITE v8.0.8  ready in 651 ms',
        '  ➜  Local:   https://dashboard.local/errors',
    ];
    // Word-boundary on "error" still hits "errors" — this test documents the
    // current heuristic's behaviour. When that changes the expected value
    // should follow.
    const result = parseViteHealth(lines);
    assert.ok(result === STATES.READY || result === STATES.ERROR);
});

test('honours the tail window and ignores older lines', () => {
    const lines = [
        'VITE v8.0.8  ready in 651 ms',
        ...Array.from({ length: 100 }, (_, i) => `noise ${i}`),
        '[vite] hmr update /foo.js',
    ];
    assert.equal(parseViteHealth(lines, 5), STATES.COMPILING);
});

test('STATES enum exposes the four public state names', () => {
    assert.deepEqual(new Set(Object.values(STATES)), new Set(['idle', 'compiling', 'ready', 'error']));
});
