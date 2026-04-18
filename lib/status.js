'use strict';

const path = require('path');

/**
 * Build the bash script that collects status for all projects.
 * Writes one `CHECK:{idx}:{count}` line per probe, in a fixed order:
 *   0: containers, 1: vite, 2: reverb (if enabled), 3: queue (if enabled)
 */
function buildStatusScript(projects, webserverDir) {
    const lines = ['#!/bin/bash'];

    projects.forEach((p, i) => {
        const dir = path.join(webserverDir, p.name);
        const container = `${p.name}-laravel.test-1`;
        const countVar = `C${i}`;

        // Probe containers first; skip the docker exec calls entirely when
        // they are down so stopped projects don't pay the exec round-trip.
        lines.push(`${countVar}=$(cd "${dir}" && ./vendor/bin/sail ps -q 2>/dev/null | wc -l)`);
        lines.push(`echo "CHECK:${i}:$${countVar}"`);
        lines.push(`if [ "$${countVar}" -gt 0 ]; then`);
        lines.push(`  echo "CHECK:${i}:$(docker exec ${container} pgrep -c -f 'node.*vite' 2>/dev/null || echo 0)"`);
        if (p.reverb) {
            lines.push(`  echo "CHECK:${i}:$(docker exec ${container} pgrep -c -f 'reverb:start' 2>/dev/null || echo 0)"`);
        }
        if (p.queue) {
            lines.push(`  echo "CHECK:${i}:$(docker exec ${container} pgrep -c -f 'queue:work' 2>/dev/null || echo 0)"`);
        }
        lines.push(`else`);
        lines.push(`  echo "CHECK:${i}:0"`);
        if (p.reverb) lines.push(`  echo "CHECK:${i}:0"`);
        if (p.queue)  lines.push(`  echo "CHECK:${i}:0"`);
        lines.push(`fi`);
    });

    return lines.join('\n') + '\n';
}

/**
 * Parse the output of the status script into per-project status objects.
 * Tolerates malformed lines, out-of-range indices, and partial output.
 */
function fieldsFor(project) {
    const fields = ['containers', 'vite'];
    if (project.reverb) fields.push('reverb');
    if (project.queue)  fields.push('queue');
    return fields;
}

function parseStatusOutput(output, projects) {
    const statuses = projects.map(() => ({
        containers: false,
        vite: false,
        reverb: false,
        queue: false,
    }));
    const counters = projects.map(() => 0);
    const fieldMap = projects.map(fieldsFor);

    for (const line of output.split('\n')) {
        if (!line.startsWith('CHECK:')) continue;
        const parts = line.split(':');
        if (parts.length < 3) continue;

        const idx = parseInt(parts[1], 10);
        const count = parseInt(parts[2], 10);
        if (!Number.isFinite(idx) || !statuses[idx]) continue;

        const field = fieldMap[idx][counters[idx]++];
        if (!field) continue;
        statuses[idx][field] = Number.isFinite(count) && count > 0;
    }

    return statuses;
}

module.exports = { buildStatusScript, parseStatusOutput };
