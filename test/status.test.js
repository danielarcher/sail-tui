'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildStatusScript, parseStatusOutput } = require('../lib/status');

const SAMPLE = [
    { name: 'alpha', reverb: false, queue: false },
    { name: 'beta',  reverb: true,  queue: false },
    { name: 'gamma', reverb: true,  queue: true  },
];

test('buildStatusScript starts with a bash shebang', () => {
    const script = buildStatusScript(SAMPLE, '/srv');
    assert.ok(script.startsWith('#!/bin/bash\n'));
});

test('buildStatusScript emits containers + vite for every project', () => {
    const script = buildStatusScript(SAMPLE, '/srv');
    assert.match(script, /CHECK:0:\$\(cd "\/srv\/alpha" && \.\/vendor\/bin\/sail ps -q/);
    assert.match(script, /CHECK:0:\$\(docker exec alpha-laravel\.test-1 pgrep -c -f 'node\.\*vite'/);
    assert.match(script, /CHECK:1:\$\(cd "\/srv\/beta" && \.\/vendor\/bin\/sail ps -q/);
});

test('buildStatusScript emits reverb only for projects that have it', () => {
    const script = buildStatusScript(SAMPLE, '/srv');
    assert.ok(!script.includes("docker exec alpha-laravel.test-1 pgrep -c -f 'reverb:start'"), 'alpha should not have reverb');
    assert.ok(script.includes("docker exec beta-laravel.test-1 pgrep -c -f 'reverb:start'"),   'beta should have reverb');
    assert.ok(script.includes("docker exec gamma-laravel.test-1 pgrep -c -f 'reverb:start'"),  'gamma should have reverb');
});

test('buildStatusScript emits queue only for projects that have it', () => {
    const script = buildStatusScript(SAMPLE, '/srv');
    assert.ok(!script.includes("docker exec alpha-laravel.test-1 pgrep -c -f 'queue:work'"), 'alpha no queue');
    assert.ok(!script.includes("docker exec beta-laravel.test-1 pgrep -c -f 'queue:work'"),  'beta no queue');
    assert.ok(script.includes("docker exec gamma-laravel.test-1 pgrep -c -f 'queue:work'"),   'gamma has queue');
});

test('parseStatusOutput maps checks to fields in order', () => {
    const output = [
        'CHECK:0:1',  // alpha containers
        'CHECK:0:1',  // alpha vite
        'CHECK:1:1',  // beta containers
        'CHECK:1:0',  // beta vite
        'CHECK:1:1',  // beta reverb
        'CHECK:2:1',  // gamma containers
        'CHECK:2:1',  // gamma vite
        'CHECK:2:0',  // gamma reverb
        'CHECK:2:1',  // gamma queue
    ].join('\n');

    const statuses = parseStatusOutput(output, SAMPLE);
    assert.deepEqual(statuses[0], { containers: true,  vite: true,  reverb: false, queue: false });
    assert.deepEqual(statuses[1], { containers: true,  vite: false, reverb: true,  queue: false });
    assert.deepEqual(statuses[2], { containers: true,  vite: true,  reverb: false, queue: true  });
});

test('parseStatusOutput defaults missing fields to false', () => {
    const statuses = parseStatusOutput('', SAMPLE);
    for (const s of statuses) {
        assert.deepEqual(s, { containers: false, vite: false, reverb: false, queue: false });
    }
});

test('parseStatusOutput treats count 0 as false', () => {
    const output = 'CHECK:0:0\nCHECK:0:0';
    const statuses = parseStatusOutput(output, SAMPLE);
    assert.equal(statuses[0].containers, false);
    assert.equal(statuses[0].vite, false);
});

test('parseStatusOutput ignores malformed lines', () => {
    const output = [
        'garbage',
        'CHECK:',
        'CHECK:abc:1',
        'CHECK:99:1',    // out of range
        'CHECK:0:1',     // valid — alpha containers
    ].join('\n');

    const statuses = parseStatusOutput(output, SAMPLE);
    assert.equal(statuses[0].containers, true);
    assert.equal(statuses[0].vite, false);
});

test('parseStatusOutput is tolerant of extra CHECK lines for a project', () => {
    // Five lines for a two-probe project — extras should be ignored, no throw
    const two = [{ name: 'only', reverb: false, queue: false }];
    const output = 'CHECK:0:1\nCHECK:0:1\nCHECK:0:1\nCHECK:0:1\nCHECK:0:1';
    const statuses = parseStatusOutput(output, two);
    assert.deepEqual(statuses[0], { containers: true, vite: true, reverb: false, queue: false });
});
