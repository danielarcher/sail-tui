'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { formatError, writeErrorLog, install } = require('../lib/errorBoundary');

function tempPath(name = 'sail-tui-error.log') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-tui-errb-'));
    return path.join(dir, name);
}

test('formatError includes an ISO timestamp and the stack trace', () => {
    const err = new Error('boom');
    const now = new Date('2026-04-18T12:00:00Z');
    const text = formatError(err, now);

    assert.ok(text.startsWith('[2026-04-18T12:00:00.000Z]\n'));
    assert.ok(text.includes('boom'));
    assert.ok(text.includes('Error: boom'));
    assert.ok(text.endsWith('\n\n'));
});

test('formatError falls back to String(err) when there is no stack', () => {
    const text = formatError('plain-string-failure', new Date('2026-04-18T12:00:00Z'));
    assert.ok(text.includes('plain-string-failure'));
});

test('writeErrorLog creates the file if missing and writes the formatted error', () => {
    const logPath = tempPath();
    const ok = writeErrorLog(logPath, new Error('first'));

    assert.equal(ok, true);
    assert.ok(fs.existsSync(logPath));
    assert.match(fs.readFileSync(logPath, 'utf8'), /Error: first/);
});

test('writeErrorLog appends instead of overwriting', () => {
    const logPath = tempPath();
    writeErrorLog(logPath, new Error('one'));
    writeErrorLog(logPath, new Error('two'));

    const content = fs.readFileSync(logPath, 'utf8');
    assert.ok(content.includes('Error: one'));
    assert.ok(content.includes('Error: two'));
});

test('writeErrorLog creates missing parent directories', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-tui-errb-'));
    const logPath = path.join(root, 'does', 'not', 'exist', 'error.log');
    const ok = writeErrorLog(logPath, new Error('nested'));

    assert.equal(ok, true);
    assert.ok(fs.existsSync(logPath));
});

function installAndCleanup(opts) {
    const prevUncaught = process.listeners('uncaughtException');
    const prevRejection = process.listeners('unhandledRejection');
    const handler = install(opts);
    // Restore previous listeners so the returned handler is the only one
    // reachable via process.emit, and so the test runner's own listeners
    // are not disturbed by our synthetic errors.
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    prevUncaught.forEach(l => process.on('uncaughtException', l));
    prevRejection.forEach(l => process.on('unhandledRejection', l));
    return handler;
}

test('install returns a handler that restores the terminal and writes the log', () => {
    const logPath = tempPath();
    const destroyCalls = [];
    const stderrChunks = [];
    const exitCodes = [];

    const fakeScreen = { destroy: () => destroyCalls.push(true) };

    const handler = installAndCleanup({
        screen: fakeScreen,
        logPath,
        writeStderr: (msg) => stderrChunks.push(msg),
        onExit: (code) => exitCodes.push(code),
    });

    handler(new Error('synthetic'));

    assert.equal(destroyCalls.length, 1, 'screen.destroy should be called once');
    assert.equal(exitCodes[0], 1);
    assert.ok(stderrChunks.join('').includes('synthetic'));
    assert.ok(fs.readFileSync(logPath, 'utf8').includes('Error: synthetic'));
});

test('install handler is safe when screen is absent', () => {
    const logPath = tempPath();
    const exitCodes = [];

    const handler = installAndCleanup({
        logPath,
        writeStderr: () => {},
        onExit: (code) => exitCodes.push(code),
    });

    handler(new Error('no-screen'));

    assert.equal(exitCodes[0], 1);
});

test('install registers process listeners on uncaughtException and unhandledRejection', () => {
    const logPath = tempPath();
    const before = {
        uncaught: process.listenerCount('uncaughtException'),
        rejected: process.listenerCount('unhandledRejection'),
    };

    install({ logPath, writeStderr: () => {}, onExit: () => {} });

    assert.equal(process.listenerCount('uncaughtException'), before.uncaught + 1);
    assert.equal(process.listenerCount('unhandledRejection'), before.rejected + 1);

    // Clean up: the last listener is ours
    const uncaughtListeners = process.listeners('uncaughtException');
    process.removeListener('uncaughtException', uncaughtListeners[uncaughtListeners.length - 1]);
    const rejectListeners = process.listeners('unhandledRejection');
    process.removeListener('unhandledRejection', rejectListeners[rejectListeners.length - 1]);
});
