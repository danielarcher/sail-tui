'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { sliceRenderedChars, hasBlessedTags } = require('../lib/hscroll');

test('sliceRenderedChars returns the full line at offset 0', () => {
    assert.equal(sliceRenderedChars('hello world', 0), 'hello world');
});

test('sliceRenderedChars handles null / undefined safely', () => {
    assert.equal(sliceRenderedChars(null, 4), '');
    assert.equal(sliceRenderedChars(undefined, 4), '');
    assert.equal(sliceRenderedChars('', 4), '');
});

test('sliceRenderedChars trims N characters off the front', () => {
    assert.equal(sliceRenderedChars('abcdefghij', 3), 'defghij');
    assert.equal(sliceRenderedChars('abcdefghij', 10), '');
});

test('sliceRenderedChars beyond length returns empty', () => {
    assert.equal(sliceRenderedChars('short', 20), '');
});

test('sliceRenderedChars counts escaped \\{ as a single rendered column', () => {
    // "a\{b\}c" renders on screen as "a{b}c" — 5 visible columns.
    // Slicing off 2 columns should give us "b\}c" (which renders as "b}c").
    assert.equal(sliceRenderedChars('a\\{b\\}c', 2), 'b\\}c');
});

test('sliceRenderedChars preserves escape sequences when cut lands at column boundary', () => {
    // Cut exactly after "a" (1 rendered col) — the escape sequence "\{" stays intact.
    assert.equal(sliceRenderedChars('a\\{b', 1), '\\{b');
});

test('hasBlessedTags returns false for plain content', () => {
    assert.equal(hasBlessedTags('2026-04-22 hello world'), false);
    assert.equal(hasBlessedTags(''), false);
    assert.equal(hasBlessedTags(null), false);
});

test('hasBlessedTags returns false when every { is escaped', () => {
    assert.equal(hasBlessedTags('ready in \\{651}ms'), false);
    assert.equal(hasBlessedTags('many \\{escaped} \\{pairs}'), false);
});

test('hasBlessedTags returns true for real tag sequences', () => {
    assert.equal(hasBlessedTags('{red-fg}error{/}'), true);
    assert.equal(hasBlessedTags('prefix {bold}x{/bold}'), true);
});

test('hasBlessedTags handles mixed escaped and real tags', () => {
    // An escaped { followed later by a real tag should still detect the tag.
    assert.equal(hasBlessedTags('\\{literal} then {cyan-fg}tag{/}'), true);
});
