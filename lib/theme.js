'use strict';

const C = {
    dim:     '#888888',
    mid:     '#aaaaaa',
    text:    '#dddddd',
    bright:  '#ffffff',
    green:   '#4ade80',
    red:     '#f43f5e',
    yellow:  '#fbbf24',
    cyan:    '#22d3ee',
    magenta: '#c084fc',
    orange:  '#fb923c',
    border:  '#888888',
};

function fg(color, text) {
    return `{${color}-fg}${text}{/${color}-fg}`;
}

function bold(text) {
    return `{bold}${text}{/bold}`;
}

module.exports = { C, fg, bold };
