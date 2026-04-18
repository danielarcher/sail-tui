'use strict';

const HELP_KEYS = [
    { key: 'j / k / ↑ ↓',        action: 'Navigate the project list' },
    { key: 'u',                   action: 'Start the selected project (containers only)' },
    { key: 'd',                   action: 'Dev mode (containers + Vite + Reverb + Queue)' },
    { key: 's',                   action: 'Stop the selected project' },
    { key: 'r',                   action: 'Restart the selected project' },
    { key: 'h',                   action: 'Heal the selected project' },
    { key: 'c',                   action: 'Clear caches (cache:clear + view:clear)' },
    { key: 't',                   action: 'Run the project test suite (php artisan test)' },
    { key: 'o',                   action: 'Open the project URL in the browser' },
    { key: 'Shift + U/D/S/R/H',   action: 'Same actions, but applied to every project' },
    { key: 'l',                   action: 'Cycle log tabs (Vite → Reverb → Queue)' },
    { key: 'G / End',             action: 'Jump to the end of the log and resume follow mode' },
    { key: 'a',                   action: 'Toggle the activity log overlay' },
    { key: 'Esc',                 action: 'Close overlay or cancel the in-flight action' },
    { key: 'f',                   action: 'Force a status refresh' },
    { key: '?',                   action: 'Toggle this help overlay' },
    { key: 'q / Ctrl+C',          action: 'Quit' },
];

function formatHelpLines(keymap = HELP_KEYS, keyWidth = 22) {
    return keymap.map(e => `  ${e.key.padEnd(keyWidth)}  ${e.action}`);
}

module.exports = { HELP_KEYS, formatHelpLines };
