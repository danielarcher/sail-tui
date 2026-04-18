'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_PATH = path.join(os.homedir(), '.sail-tui-tests.json');
const SCHEMA_VERSION = 1;

function emptyCache() {
    return { version: SCHEMA_VERSION, results: {} };
}

function loadTestCache(cachePath = DEFAULT_PATH) {
    try {
        const raw = fs.readFileSync(cachePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.results || typeof parsed.results !== 'object') {
            return emptyCache();
        }
        return parsed;
    } catch {
        return emptyCache();
    }
}

function saveTestCache(cache, cachePath = DEFAULT_PATH) {
    const payload = { version: SCHEMA_VERSION, results: (cache && cache.results) || {} };
    try {
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        const tmp = `${cachePath}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
        fs.renameSync(tmp, cachePath);
        return true;
    } catch {
        return false;
    }
}

function getResult(cache, projectName) {
    if (!cache || !cache.results || typeof projectName !== 'string') return null;
    return cache.results[projectName] || null;
}

function setResult(cache, projectName, result) {
    const copy = cache && cache.results ? { ...cache.results } : {};
    copy[projectName] = { ...result, ranAt: result.ranAt || new Date().toISOString() };
    return { version: SCHEMA_VERSION, results: copy };
}

module.exports = {
    DEFAULT_PATH,
    SCHEMA_VERSION,
    loadTestCache,
    saveTestCache,
    getResult,
    setResult,
    emptyCache,
};
