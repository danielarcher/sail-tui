'use strict';

const fs = require('fs');
const path = require('path');

function formatError(err, now = new Date()) {
    const stack = err && err.stack ? err.stack : String(err);
    return `[${now.toISOString()}]\n${stack}\n\n`;
}

function writeErrorLog(logPath, err, now = new Date()) {
    try {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.appendFileSync(logPath, formatError(err, now));
        return true;
    } catch {
        return false;
    }
}

/**
 * Install global handlers that restore the terminal and persist a crash
 * report before exiting. Without this a blessed crash leaves the TTY in a
 * broken state (no cursor, no echo, alt-screen active).
 *
 * @param {{
 *   screen?: { destroy?: () => void },
 *   logPath: string,
 *   exitCode?: number,
 *   writeStderr?: (msg: string) => void,
 *   onExit?: (code: number) => void,
 * }} opts
 */
function install(opts) {
    const {
        screen,
        logPath,
        exitCode = 1,
        writeStderr = (msg) => process.stderr.write(msg),
        onExit = (code) => process.exit(code),
    } = opts;

    const handler = (err) => {
        try { if (screen && typeof screen.destroy === 'function') screen.destroy(); } catch {}
        writeErrorLog(logPath, err);
        try {
            const summary = err && err.message ? err.message : String(err);
            writeStderr(`\nsail-tui crashed: ${summary}\nSee ${logPath}\n`);
        } catch {}
        onExit(exitCode);
    };

    process.on('uncaughtException', handler);
    process.on('unhandledRejection', handler);

    return handler;
}

module.exports = { install, formatError, writeErrorLog };
