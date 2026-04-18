'use strict';

// Parses the tail of a `sail test` / `php artisan test` run.
//
// Supports both Pest and PHPUnit default reporters. Returns a normalized
// result shape so the TUI can render a single compact summary regardless
// of which runner the project uses.

const PEST_LINE_RE = /Tests:\s+([^\n]+)/i;
const PHPUNIT_SUMMARY_RE = /Tests:\s*(\d+),\s*Assertions:\s*(\d+)(?:,\s*Failures:\s*(\d+))?(?:,\s*Errors:\s*(\d+))?(?:,\s*Skipped:\s*(\d+))?/i;

const PEST_DURATION_RE = /Duration:\s*([\d.]+)\s*s/i;
const PHPUNIT_TIME_RE = /Time:\s*(?:(\d+):)?(\d+)[:.]([\d.]+)/i;

function extractCount(phrase, word) {
    const re = new RegExp(`(\\d+)\\s+${word}`, 'i');
    const m = phrase.match(re);
    return m ? Number.parseInt(m[1], 10) : 0;
}

function parsePestSummaryLine(phrase) {
    return {
        passed: extractCount(phrase, 'passed'),
        failed: extractCount(phrase, 'failed'),
        skipped: extractCount(phrase, 'skipped'),
        pending: extractCount(phrase, 'pending'),
    };
}

function parseDuration(text) {
    const pest = text.match(PEST_DURATION_RE);
    if (pest) {
        const n = Number.parseFloat(pest[1]);
        return Number.isFinite(n) ? n : null;
    }
    const phpunit = text.match(PHPUNIT_TIME_RE);
    if (phpunit) {
        const mm = Number.parseInt(phpunit[1] || '0', 10);
        const ss = Number.parseInt(phpunit[2], 10);
        const frac = Number.parseFloat('0.' + (phpunit[3].replace(/\D/g, '') || '0'));
        return mm * 60 + ss + (Number.isFinite(frac) ? frac : 0);
    }
    return null;
}

function parseTestOutput(text, opts = {}) {
    const exitCode = typeof opts.exitCode === 'number' ? opts.exitCode : null;
    const raw = typeof text === 'string' ? text : '';
    const duration = parseDuration(raw);

    let passed = 0, failed = 0, skipped = 0, pending = 0;
    let parsed = false;

    // Prefer Pest's summary line since it is what `sail test` emits by default.
    const pestMatch = raw.match(PEST_LINE_RE);
    if (pestMatch) {
        const counts = parsePestSummaryLine(pestMatch[1]);
        // Only accept as Pest if at least one count was found
        if (counts.passed + counts.failed + counts.skipped + counts.pending > 0) {
            passed = counts.passed;
            failed = counts.failed;
            skipped = counts.skipped;
            pending = counts.pending;
            parsed = true;
        }
    }

    if (!parsed) {
        const phpMatch = raw.match(PHPUNIT_SUMMARY_RE);
        if (phpMatch) {
            const total = Number.parseInt(phpMatch[1], 10) || 0;
            failed = Number.parseInt(phpMatch[3] || '0', 10) || 0;
            const errors = Number.parseInt(phpMatch[4] || '0', 10) || 0;
            skipped = Number.parseInt(phpMatch[5] || '0', 10) || 0;
            failed += errors;
            passed = Math.max(total - failed - skipped, 0);
            parsed = true;
        }
    }

    let status;
    if (parsed) {
        if (failed > 0) status = 'fail';
        else if (passed + skipped + pending === 0) status = 'unknown';
        else status = 'pass';
    } else if (exitCode === null) {
        status = 'unknown';
    } else if (exitCode === 0) {
        status = 'unknown';
    } else {
        status = 'error';
    }

    const summary = buildSummary({ status, passed, failed, skipped, pending, duration });

    return { status, passed, failed, skipped, pending, duration, summary, parsed };
}

function buildSummary({ status, passed, failed, skipped, pending, duration }) {
    const d = duration !== null ? ` · ${duration.toFixed(2)}s` : '';
    switch (status) {
        case 'pass': {
            const skip = skipped > 0 ? `, ${skipped} skipped` : '';
            const pend = pending > 0 ? `, ${pending} pending` : '';
            return `${passed} passed${skip}${pend}${d}`;
        }
        case 'fail': {
            const tot = passed + failed + skipped + pending;
            return `${failed} failed of ${tot}${d}`;
        }
        case 'error':
            return 'runner failed to start';
        case 'unknown':
        default:
            return 'no test summary found';
    }
}

module.exports = {
    parseTestOutput,
    parseDuration,
    parsePestSummaryLine,
    buildSummary,
    PEST_LINE_RE,
    PHPUNIT_SUMMARY_RE,
};
