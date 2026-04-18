'use strict';

const DEFAULT_MAX = 50;

function formatTime(date) {
    return date.toLocaleTimeString('en-IE', { hour12: false });
}

function createActivity(maxLen = DEFAULT_MAX) {
    const entries = [];

    return {
        add(msg, now = new Date()) {
            entries.unshift({ time: formatTime(now), msg });
            if (entries.length > maxLen) entries.pop();
        },
        list() {
            return entries;
        },
        clear() {
            entries.length = 0;
        },
    };
}

module.exports = { createActivity, formatTime, DEFAULT_MAX };
