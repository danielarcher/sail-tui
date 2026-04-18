'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { openUrl, launcherForPlatform } = require('../lib/browser');

function makeSpawnSpy() {
    const calls = [];
    const child = { unref: () => { child.unrefCalls = (child.unrefCalls || 0) + 1; } };
    const spawn = (cmd, args, opts) => {
        calls.push({ cmd, args, opts });
        return child;
    };
    return { spawn, calls, child };
}

test('launcherForPlatform returns the expected binary per platform', () => {
    assert.equal(launcherForPlatform('linux'),  'xdg-open');
    assert.equal(launcherForPlatform('darwin'), 'open');
    assert.equal(launcherForPlatform('win32'),  'start');
    assert.equal(launcherForPlatform('freebsd'),'xdg-open');
});

test('openUrl spawns the URL with the platform default launcher', () => {
    const { spawn, calls } = makeSpawnSpy();
    openUrl('https://lootkeep.local', { spawn, platform: 'linux' });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].cmd, 'xdg-open');
    assert.deepEqual(calls[0].args, ['https://lootkeep.local']);
});

test('openUrl respects an explicit launcher override', () => {
    const { spawn, calls } = makeSpawnSpy();
    openUrl('https://lootkeep.local', { spawn, launcher: 'firefox' });

    assert.equal(calls[0].cmd, 'firefox');
});

test('openUrl spawns the child detached so it outlives the TUI', () => {
    const { spawn, calls } = makeSpawnSpy();
    openUrl('https://x.local', { spawn });

    assert.equal(calls[0].opts.detached, true);
    assert.equal(calls[0].opts.stdio, 'ignore');
});

test('openUrl calls unref so the parent can exit cleanly', () => {
    const { spawn, child } = makeSpawnSpy();
    openUrl('https://x.local', { spawn });
    assert.equal(child.unrefCalls, 1);
});

test('openUrl throws on non-string / empty URL', () => {
    assert.throws(() => openUrl(''),         /non-empty url/);
    assert.throws(() => openUrl(undefined),  /non-empty url/);
    assert.throws(() => openUrl(null),       /non-empty url/);
    assert.throws(() => openUrl(42),         /non-empty url/);
});
