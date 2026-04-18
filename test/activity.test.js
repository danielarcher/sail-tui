'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createActivity, formatTime } = require('../lib/activity');

test('newest entry is at index 0', () => {
    const a = createActivity();
    a.add('first');
    a.add('second');
    a.add('third');

    const list = a.list();
    assert.equal(list[0].msg, 'third');
    assert.equal(list[2].msg, 'first');
});

test('activity caps at maxLen, dropping the oldest', () => {
    const a = createActivity(3);
    a.add('one');
    a.add('two');
    a.add('three');
    a.add('four');

    const list = a.list();
    assert.equal(list.length, 3);
    assert.deepEqual(list.map(e => e.msg), ['four', 'three', 'two']);
});

test('timestamp is formatted as 24-hour HH:MM:SS', () => {
    const a = createActivity();
    const fakeDate = new Date('2026-04-18T09:05:03');
    a.add('x', fakeDate);

    assert.match(a.list()[0].time, /^\d{2}:\d{2}:\d{2}$/);
});

test('clear empties the list', () => {
    const a = createActivity();
    a.add('x');
    a.add('y');
    a.clear();
    assert.equal(a.list().length, 0);
});

test('formatTime uses 24-hour format for en-IE locale', () => {
    const t = formatTime(new Date('2026-04-18T15:30:45'));
    assert.match(t, /^\d{2}:\d{2}:\d{2}$/);
});
