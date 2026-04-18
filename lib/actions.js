'use strict';

const VALID_ACTIONS = new Set(['up', 'down', 'dev', 'restart', 'heal']);

function isValidAction(action) {
    return VALID_ACTIONS.has(action);
}

function buildSailAllArgs(action, projectName) {
    if (!isValidAction(action)) {
        throw new Error(`Unknown action: ${action}`);
    }
    const args = [action];
    if (projectName) args.push(projectName);
    return args;
}

function labelForAction(action) {
    return action === 'down' ? 'stop' : action;
}

module.exports = { buildSailAllArgs, isValidAction, labelForAction, VALID_ACTIONS };
