'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseTestOutput, parseDuration, parsePestSummaryLine } = require('../lib/tests');

// ── Pest output ─────────────────────────────────────────────────────────────

const PEST_PASS = `
PASS  Tests\\Feature\\AuthTest
✓ user can login
✓ user cannot login with wrong password

Tests:    95 passed (252 assertions)
Duration: 1.40s
`;

const PEST_FAIL = `
PASS  Tests\\Feature\\AuthTest
✓ user can login

FAIL  Tests\\Feature\\ProductTest
✗ can create product — Expected 200 but got 500

Tests:    1 failed, 3 passed (8 assertions)
Duration: 0.85s
`;

const PEST_MIXED = `
Tests:    2 failed, 10 passed, 1 skipped, 1 pending (30 assertions)
Duration: 2.30s
`;

test('parseTestOutput classifies a clean Pest run as pass', () => {
    const r = parseTestOutput(PEST_PASS, { exitCode: 0 });
    assert.equal(r.status, 'pass');
    assert.equal(r.passed, 95);
    assert.equal(r.failed, 0);
    assert.equal(r.duration, 1.40);
    assert.ok(/95 passed/.test(r.summary));
});

test('parseTestOutput classifies a Pest run with failures as fail', () => {
    const r = parseTestOutput(PEST_FAIL, { exitCode: 1 });
    assert.equal(r.status, 'fail');
    assert.equal(r.passed, 3);
    assert.equal(r.failed, 1);
    assert.equal(r.duration, 0.85);
});

test('parseTestOutput reads Pest skipped + pending counts', () => {
    const r = parseTestOutput(PEST_MIXED, { exitCode: 1 });
    assert.equal(r.status, 'fail');
    assert.equal(r.passed, 10);
    assert.equal(r.failed, 2);
    assert.equal(r.skipped, 1);
    assert.equal(r.pending, 1);
});

// ── PHPUnit output ─────────────────────────────────────────────────────────

const PHPUNIT_PASS = `
PHPUnit 10.4.1 by Sebastian Bergmann and contributors.

......                                                              6 / 6 (100%)

Time: 00:00.234, Memory: 24.00 MB

OK (6 tests, 12 assertions)

Tests: 6, Assertions: 12.
`;

const PHPUNIT_FAIL = `
PHPUnit 10.4.1 by Sebastian Bergmann and contributors.

.....F                                                              6 / 6 (100%)

Time: 00:01.234, Memory: 24.00 MB

There was 1 failure:

1) Tests\\Unit\\FooTest::testBar
Failed asserting that 1 matches expected 2.

Tests: 6, Assertions: 6, Failures: 1.
`;

test('parseTestOutput handles a passing PHPUnit run', () => {
    const r = parseTestOutput(PHPUNIT_PASS, { exitCode: 0 });
    assert.equal(r.status, 'pass');
    assert.equal(r.passed, 6);
    assert.equal(r.failed, 0);
    // 00:00.234 -> 0.234s
    assert.ok(r.duration > 0.2 && r.duration < 0.3);
});

test('parseTestOutput handles a failing PHPUnit run', () => {
    const r = parseTestOutput(PHPUNIT_FAIL, { exitCode: 1 });
    assert.equal(r.status, 'fail');
    assert.equal(r.failed, 1);
    assert.equal(r.passed, 5);     // 6 total - 1 failed
    assert.ok(r.duration > 1.2 && r.duration < 1.3);
});

test('parseTestOutput folds PHPUnit errors into failed count', () => {
    const text = 'Tests: 10, Assertions: 20, Failures: 1, Errors: 2.';
    const r = parseTestOutput(text, { exitCode: 1 });
    assert.equal(r.failed, 3);
    assert.equal(r.passed, 7);
});

// ── Edge cases ──────────────────────────────────────────────────────────────

test('parseTestOutput returns error status for non-zero exit with no summary', () => {
    const r = parseTestOutput('Command failed: sail not running', { exitCode: 1 });
    assert.equal(r.status, 'error');
    assert.equal(r.passed, 0);
    assert.equal(r.failed, 0);
});

test('parseTestOutput returns unknown for empty / clean output with zero exit', () => {
    const r = parseTestOutput('', { exitCode: 0 });
    assert.equal(r.status, 'unknown');
    assert.equal(r.parsed, false);
});

test('parseTestOutput tolerates non-string input', () => {
    const r = parseTestOutput(undefined, { exitCode: 1 });
    assert.equal(r.status, 'error');
});

test('parseTestOutput without exitCode still parses Pest output as pass', () => {
    const r = parseTestOutput('Tests:    2 passed');
    assert.equal(r.status, 'pass');
    assert.equal(r.passed, 2);
});

// ── Sub-parsers ─────────────────────────────────────────────────────────────

test('parseDuration reads Pest "Duration: 1.40s"', () => {
    assert.equal(parseDuration('Duration: 1.40s'), 1.40);
});

test('parseDuration reads PHPUnit "Time: 00:01.234"', () => {
    const d = parseDuration('Time: 00:01.234, Memory: 24.00 MB');
    assert.ok(d > 1.2 && d < 1.3);
});

test('parseDuration returns null when the text has no duration', () => {
    assert.equal(parseDuration('no duration here'), null);
});

test('parsePestSummaryLine extracts counts from a summary phrase', () => {
    const c = parsePestSummaryLine('1 failed, 3 passed, 2 skipped, 1 pending (8 assertions)');
    assert.deepEqual(c, { passed: 3, failed: 1, skipped: 2, pending: 1 });
});

test('buildSummary via parseTestOutput shows pass + skipped + duration', () => {
    const r = parseTestOutput('Tests:    10 passed, 2 skipped\nDuration: 0.50s', { exitCode: 0 });
    assert.match(r.summary, /10 passed/);
    assert.match(r.summary, /2 skipped/);
    assert.match(r.summary, /0\.50s/);
});
