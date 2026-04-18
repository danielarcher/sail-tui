'use strict';

const REQUIRED_STRING_FIELDS = ['name', 'display', 'url'];
const REQUIRED_BOOLEAN_FIELDS = ['reverb', 'queue'];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function formatProjectLabel(project, index) {
    if (project && typeof project.name === 'string') return `"${project.name}" (#${index})`;
    return `#${index}`;
}

/**
 * Throws a descriptive Error when the PROJECTS array does not match the
 * shape the TUI expects. Runs in O(n) at boot — cheap, and turns a silent
 * "undefined.display" blessed crash into a one-line actionable message.
 */
function validateProjects(projects) {
    if (!Array.isArray(projects)) {
        throw new Error('PROJECTS must be an array');
    }
    if (projects.length === 0) {
        throw new Error('PROJECTS must not be empty');
    }

    const seenNames = new Set();
    const seenUrls = new Set();

    projects.forEach((p, i) => {
        const label = formatProjectLabel(p, i);

        if (!p || typeof p !== 'object') {
            throw new Error(`Project ${label} is not an object`);
        }

        for (const field of REQUIRED_STRING_FIELDS) {
            if (typeof p[field] !== 'string' || p[field].length === 0) {
                throw new Error(`Project ${label} is missing required string field "${field}"`);
            }
        }

        for (const field of REQUIRED_BOOLEAN_FIELDS) {
            if (typeof p[field] !== 'boolean') {
                throw new Error(`Project ${label} is missing required boolean field "${field}"`);
            }
        }

        if (typeof p.accent !== 'string' || !HEX_COLOR.test(p.accent)) {
            throw new Error(`Project ${label} has invalid accent color "${p.accent}" (expected #rrggbb)`);
        }

        if (seenNames.has(p.name)) {
            throw new Error(`Project name "${p.name}" is duplicated`);
        }
        seenNames.add(p.name);

        if (seenUrls.has(p.url)) {
            throw new Error(`Project url "${p.url}" is duplicated`);
        }
        seenUrls.add(p.url);
    });

    return projects;
}

module.exports = { validateProjects };
