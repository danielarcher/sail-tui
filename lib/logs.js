'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_BYTES = 16384;
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function sanitizeLogLine(line) {
    return line.replace(/\{/g, '\\{').replace(ANSI_RE, '');
}

/**
 * Read the tail of a log file.
 *
 * @returns {{kind: 'missing'} | {kind: 'empty'} | {kind: 'error', error: Error}
 *   | {kind: 'ok', lines: string[]}}
 */
function readLogTail(logsDir, projectName, service, maxLines, maxBytes = DEFAULT_MAX_BYTES) {
    const logPath = path.join(logsDir, `${projectName}-${service}.log`);

    if (!fs.existsSync(logPath)) return { kind: 'missing' };

    try {
        const stat = fs.statSync(logPath);
        if (stat.size === 0) return { kind: 'empty' };

        const bufSize = Math.min(stat.size, maxBytes);
        const buf = Buffer.alloc(bufSize);
        const fd = fs.openSync(logPath, 'r');
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

module.exports = { readLogTail, sanitizeLogLine, DEFAULT_MAX_BYTES };
