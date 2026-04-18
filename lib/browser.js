'use strict';

const { spawn: defaultSpawn } = require('child_process');

function launcherForPlatform(platform) {
    if (platform === 'darwin') return 'open';
    if (platform === 'win32')  return 'start';
    return 'xdg-open';
}

/**
 * Open a URL in the user's default browser without blocking the TUI.
 * The child is detached and unref'd so it survives independently.
 *
 * @param {string} url
 * @param {{
 *   launcher?: string,
 *   platform?: NodeJS.Platform,
 *   spawn?: typeof defaultSpawn,
 * }} [opts]
 */
function openUrl(url, opts = {}) {
    if (typeof url !== 'string' || url.length === 0) {
        throw new Error('openUrl requires a non-empty url string');
    }

    const spawner = opts.spawn || defaultSpawn;
    const launcher = opts.launcher || launcherForPlatform(opts.platform || process.platform);

    const child = spawner(launcher, [url], { stdio: 'ignore', detached: true });
    if (child && typeof child.unref === 'function') child.unref();
    return child;
}

module.exports = { openUrl, launcherForPlatform };
