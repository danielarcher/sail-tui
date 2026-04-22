'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_BYTES = 16384;
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function sanitizeLogLine(line) {
    return line.replace(/\{/g, '\\{').replace(ANSI_RE, '');
}

function readTailFromPath(absPath, maxLines, maxBytes) {
    if (!fs.existsSync(absPath)) return { kind: 'missing' };

    try {
        const stat = fs.statSync(absPath);
        if (stat.size === 0) return { kind: 'empty' };

        const bufSize = Math.min(stat.size, maxBytes);
        const buf = Buffer.alloc(bufSize);
        const fd = fs.openSync(absPath, 'r');
        fs.readSync(fd, buf, 0, bufSize, stat.size - bufSize);
        fs.closeSync(fd);

        const lines = buf.toString('utf8')
            .split('\n')
            .filter(Boolean)
            .slice(-maxLines)
            .map(sanitizeLogLine);

        return { kind: 'ok', lines };
    } catch (error) {
        return { kind: 'error', error };
    }
}

/**
 * Read the tail of a log file under the sail-tui managed logs dir.
 * File shape: `{logsDir}/{projectName}-{service}.log`
 *
 * @returns {{kind: 'missing'} | {kind: 'empty'} | {kind: 'error', error: Error}
 *   | {kind: 'ok', lines: string[]}}
 */
function readLogTail(logsDir, projectName, service, maxLines, maxBytes = DEFAULT_MAX_BYTES) {
    const logPath = path.join(logsDir, `${projectName}-${service}.log`);
    return readTailFromPath(logPath, maxLines, maxBytes);
}

/**
 * Read the tail of a log file living inside a project's own directory (e.g.
 * Laravel's `storage/logs/laravel.log`).
 *
 * @returns Same shape as readLogTail.
 */
function readProjectLogTail(webserverDir, projectName, relPath, maxLines, maxBytes = DEFAULT_MAX_BYTES) {
    const logPath = path.join(webserverDir, projectName, relPath);
    return readTailFromPath(logPath, maxLines, maxBytes);
}

// Obfuscated function names used by stale compiled Blade views look like
// `_1fb406fc1002f58fc1a05deff6ef0181` — 32 hex digits prefixed with `_`.
const STALE_VIEW_RE = /Call to undefined function _[a-f0-9]{32}\(\)/;
const LOCAL_ERROR_RE = /local\.ERROR:/;

/**
 * Inspect recent Laravel log lines for known, auto-fixable issues.
 *
 * Returns a descriptor:
 *   { kind: 'none' }                          — no issues detected
 *   { kind: 'stale_views', hint: '...' }      — stale compiled Blade views; Fix will clear them
 *   { kind: 'error',      hint: '...' }       — generic local.ERROR tail, not known-auto-fixable
 */
function detectLaravelIssue(lines) {
    if (!Array.isArray(lines) || lines.length === 0) return { kind: 'none' };

    for (const line of lines) {
        if (STALE_VIEW_RE.test(line)) {
            return {
                kind: 'stale_views',
                hint: 'stale compiled views — press F to clear',
            };
        }
    }

    for (const line of lines) {
        if (LOCAL_ERROR_RE.test(line)) {
            return {
                kind: 'error',
                hint: 'errors in log — press F to clear caches',
            };
        }
    }

    return { kind: 'none' };
}

module.exports = {
    readLogTail,
    readProjectLogTail,
    sanitizeLogLine,
    detectLaravelIssue,
    DEFAULT_MAX_BYTES,
};
