'use strict';

const DEFAULT_SIGNAL = 'SIGTERM';

/**
 * Attempt to cancel a running child process. Returns true when a kill
 * signal was delivered, false when there was nothing to cancel or the
 * kill call threw. Callers can rely on the close handler already
 * attached to the child for state cleanup.
 */
function cancelChild(child, signal = DEFAULT_SIGNAL) {
    if (!child || typeof child.kill !== 'function') return false;
    if (child.killed) return false;
    try {
        return child.kill(signal) === true;
    } catch {
        return false;
    }
}

module.exports = { cancelChild, DEFAULT_SIGNAL };
