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

test('buildStatusScript probes containers via sail ps for every project', () => {
    const script = buildStatusScript(SAMPLE, '/srv');
    assert.match(script, /C0=\$\(cd "\/srv\/alpha" && \.\/vendor\/bin\/sail ps -q/);
    assert.match(script, /C1=\$\(cd "\/srv\/beta" && \.\/vendor\/bin\/sail ps -q/);
    assert.match(script, /C2=\$\(cd "\/srv\/gamma" && \.\/vendor\/bin\/sail ps -q/);
});

test('buildStatusScript echoes the container count as the first check per project', () => {
    const script = buildStatusScript(SAMPLE, '/srv');
    assert.ok(script.includes('echo "CHECK:0:$C0"'));
    assert.ok(script.includes('echo "CHECK:1:$C1"'));
    assert.ok(script.includes('echo "CHECK:2:$C2"'));
});

test('buildStatusScript probes vite inside docker when containers are up', () => {
    const script = buildStatusScript(SAMPLE, '/srv');
    assert.match(script, /docker exec alpha-laravel\.test-1 pgrep -c -f 'node\.\*vite'/);
    assert.match(script, /docker exec beta-laravel\.test-1 pgrep -c -f 'node\.\*vite'/);
    assert.match(script, /docker exec gamma-laravel\.test-1 pgrep -c -f 'node\.\*vite'/);
});

test('buildStatusScript gates docker exec behind an if-containers-up check', () => {
    const script = buildStatusScript(SAMPLE, '/srv');
    // There must be at least one per-project guard wrapping docker exec calls.
    assert.match(script, /if \[ "\$C0" -gt 0 \]; then/);
    assert.match(script, /if \[ "\$C1" -gt 0 \]; then/);
    assert.match(script, /if \[ "\$C2" -gt 0 \]; then/);
});

test('buildStatusScript emits zero fallbacks in the else branch', () => {
    // For a project with reverb+queue (gamma) the else branch must emit
    // three zero CHECK lines so the parser sees a full slate.
    const script = buildStatusScript(SAMPLE, '/srv');
    const gammaBlock = script.split('C2=')[1] || '';
    const elseBranch = gammaBlock.split('else')[1] || '';
    const zeros = (elseBranch.match(/echo "CHECK:2:0"/g) || []).length;
    assert.equal(zeros, 3, 'gamma should emit 3 zero checks (vite + reverb + queue)');
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
