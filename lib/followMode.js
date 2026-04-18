'use strict';

// Scroll must land within this percentage of the bottom for the log view to
// be considered "following". A small tolerance avoids flipping out of follow
// mode when the final line wraps or the height is an odd number of rows.
const FOLLOW_THRESHOLD = 99;

function isAtBottom(scrollPerc, threshold = FOLLOW_THRESHOLD) {
    if (typeof scrollPerc !== 'number' || !Number.isFinite(scrollPerc)) return false;
    return scrollPerc >= threshold;
}

module.exports = { isAtBottom, FOLLOW_THRESHOLD };
