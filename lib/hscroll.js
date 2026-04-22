'use strict';

/**
 * Slice `line` by `offset` rendered characters — i.e. how many columns the
 * user sees, not bytes/code units. Used for horizontal log scrolling.
 *
 * The only subtlety: our sanitized log lines represent an escaped literal `{`
 * as the 2-char sequence `\{` so that blessed won't parse it as a tag. That
 * sequence renders as a single character on screen, so it should count as 1
 * toward the offset.
 */
function sliceRenderedChars(line, offset) {
    if (offset <= 0 || !line) return line || '';
    let i = 0;
    let rendered = 0;
    while (i < line.length && rendered < offset) {
        if (line[i] === '\\' && line[i + 1] === '{') i += 2;
        else i += 1;
        rendered += 1;
    }
    return line.substring(i);
}

/**
 * Does `line` contain real blessed tags (e.g. `{red-fg}...{/}`)?
 *
 * We use this to skip horizontal slicing on lines that contain formatting —
 * the status/banner lines rendered via `fg()`. Cutting inside a tag breaks
 * rendering, and those lines are narrow enough to fit without scrolling.
 *
 * Sanitized log content always escapes `{` to `\{`, so an unescaped `{` is a
 * reliable signal that the string was built from blessed tag helpers.
 */
function hasBlessedTags(line) {
    if (!line) return false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] !== '{') continue;
        if (i > 0 && line[i - 1] === '\\') continue;
        return true;
    }
    return false;
}

module.exports = { sliceRenderedChars, hasBlessedTags };
