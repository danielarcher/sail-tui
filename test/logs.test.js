'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { readLogTail, sanitizeLogLine } = require('../lib/logs');

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sail-tui-logs-'));
}

function writeLog(dir, project, service, content) {
    const p = path.join(dir, `${project}-${service}.log`);
    fs.writeFileSync(p, content);
    return p;
}

test('sanitizeLogLine strips ANSI escape sequences', () => {
    const input = '\x1b[32mgreen\x1b[0m \x1b[1;31mbold-red\x1b[0m tail';
    assert.equal(sanitizeLogLine(input), 'green bold-red tail');
});

test('sanitizeLogLine escapes blessed curly braces', () => {
    assert.equal(sanitizeLogLine('a{b}c'), 'a\\{b}c');
});

test('readLogTail returns missing when the file does not exist', () => {
    const dir = makeTempDir();
    const result = readLogTail(dir, 'ghost', 'vite', 10);
    assert.equal(result.kind, 'missing');
});

test('readLogTail returns empty for a zero-byte file', () => {
    const dir = makeTempDir();
    writeLog(dir, 'foo', 'vite', '');
    const result = readLogTail(dir, 'foo', 'vite', 10);
    assert.equal(result.kind, 'empty');
});

test('readLogTail returns the last N lines', () => {
    const dir = makeTempDir();
    const content = Array.from({ length: 20 }, (_, i) => `line-${i + 1}`).join('\n') + '\n';
    writeLog(dir, 'foo', 'vite', content);

    const result = readLogTail(dir, 'foo', 'vite', 5);
    assert.equal(result.kind, 'ok');
    assert.deepEqual(result.lines, ['line-16', 'line-17', 'line-18', 'line-19', 'line-20']);
});

test('readLogTail sanitizes ANSI + curly braces in returned lines', () => {
    const dir = makeTempDir();
    writeLog(dir, 'foo', 'vite', '\x1b[32mready\x1b[0m in {651}ms\n');

    const result = readLogTail(dir, 'foo', 'vite', 10);
    assert.equal(result.kind, 'ok');
    assert.deepEqual(result.lines, ['ready in \\{651}ms']);
});

test('readLogTail skips blank lines', () => {
    const dir = makeTempDir();
    writeLog(dir, 'foo', 'vite', 'a\n\n\nb\nc\n');

    const result = readLogTail(dir, 'foo', 'vite', 10);
    assert.deepEqual(result.lines, ['a', 'b', 'c']);
});

test('readLogTail reads only the tail of files larger than maxBytes', () => {
    const dir = makeTempDir();
    // Each line is ~30 bytes; 2000 lines ≈ 60KB > 16KB default
    const huge = Array.from({ length: 2000 }, (_, i) => `log-entry-number-${String(i).padStart(5, '0')}`).join('\n') + '\n';
    writeLog(dir, 'foo', 'vite', huge);

    const result = readLogTail(dir, 'foo', 'vite', 5);
    assert.equal(result.kind, 'ok');
    assert.equal(result.lines.length, 5);
    assert.equal(result.lines[4], 'log-entry-number-01999');
});

test('readLogTail respects a custom maxBytes', () => {
    const dir = makeTempDir();
    writeLog(dir, 'foo', 'vite', 'aaaa\nbbbb\ncccc\ndddd\neeee\n');
    // 5 bytes tail → we should only see partial final lines
    const result = readLogTail(dir, 'foo', 'vite', 10, 5);
    assert.equal(result.kind, 'ok');
    // Last 5 bytes are "eeee\n"; filter(Boolean) keeps "eeee"
    assert.deepEqual(result.lines, ['eeee']);
});
