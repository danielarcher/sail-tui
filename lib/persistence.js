'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_PATH = path.join(os.homedir(), '.sail-tui-state.json');
const SCHEMA_VERSION = 1;

function defaultState() {
    return { version: SCHEMA_VERSION };
}

function loadState(statePath = DEFAULT_PATH) {
    try {
        const raw = fs.readFileSync(statePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return defaultState();
        return parsed;
    } catch {
        return defaultState();
    }
}

function saveState(stateToSave, statePath = DEFAULT_PATH) {
    const payload = { version: SCHEMA_VERSION, ...stateToSave };
    try {
        fs.mkdirSync(path.dirname(statePath), { recursive: true });
        // Atomic-ish write: write to tmp then rename, so a crash mid-write
        // can't leave a half-written JSON file that breaks the next boot.
        const tmp = `${statePath}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
        fs.renameSync(tmp, statePath);
        return true;
    } catch {
        return false;
    }
}

function resolveSelectedIndex(projects, savedName) {
    if (!Array.isArray(projects) || projects.length === 0) return 0;
    if (typeof savedName !== 'string') return 0;
    const idx = projects.findIndex(p => p && p.name === savedName);
    return idx >= 0 ? idx : 0;
}

function resolveLogTab(project, savedTab) {
    const available = ['vite', 'tests', 'laravel'];
    if (project && project.reverb) available.push('reverb');
    if (project && project.queue)  available.push('queue');
    return available.includes(savedTab) ? savedTab : 'vite';
}

module.exports = {
    DEFAULT_PATH,
    SCHEMA_VERSION,
    loadState,
    saveState,
    resolveSelectedIndex,
    resolveLogTab,
};
