'use strict';

const STATES = Object.freeze({
    IDLE:      'idle',
    COMPILING: 'compiling',
    READY:     'ready',
    ERROR:     'error',
});

// Match patterns are anchored to whole words where possible to avoid false
// positives from user code paths that happen to contain "error" in a URL.
const ERROR_RE     = /\b(error|failed to|ELIFECYCLE|\[plugin:)/i;
const READY_RE     = /ready in (?:\d+(?:\.\d+)?)\s*(?:ms|s)\b/i;
const COMPILING_RE = /\b(building|hmr update|page reload|rebuilding|restart)/i;
const STARTING_RE  = /\bVITE v\d/i;

/**
 * Derive a Vite health signal from a tail of log lines. The function looks
 * for the strongest signal in the recent history — an error after the
 * latest "ready" beats the ready, HMR activity beats idle, a ready line
 * beats a startup banner.
 */
function parseViteHealth(logLines, window = 80) {
    if (!Array.isArray(logLines) || logLines.length === 0) return STATES.IDLE;

    const recent = logLines.slice(-window);

    let lastReadyIdx     = -1;
    let lastCompilingIdx = -1;
    let lastErrorIdx     = -1;
    let sawStarting      = false;

    recent.forEach((line, i) => {
        if (typeof line !== 'string') return;
        if (READY_RE.test(line))     lastReadyIdx     = i;
        if (COMPILING_RE.test(line)) lastCompilingIdx = i;
        if (ERROR_RE.test(line))     lastErrorIdx     = i;
        if (STARTING_RE.test(line))  sawStarting      = true;
    });

    if (lastErrorIdx > lastReadyIdx && lastErrorIdx > lastCompilingIdx) return STATES.ERROR;
    if (lastCompilingIdx > lastReadyIdx) return STATES.COMPILING;
    if (lastReadyIdx >= 0)               return STATES.READY;
    if (sawStarting)                     return STATES.COMPILING;

    return STATES.IDLE;
}

module.exports = { parseViteHealth, STATES };
