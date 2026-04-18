#!/usr/bin/env node
'use strict';

const blessed = require('neo-blessed');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const { PROJECTS } = require('./lib/projects');
const { C, fg, bold } = require('./lib/theme');
const { readLogTail } = require('./lib/logs');
const { buildStatusScript, parseStatusOutput } = require('./lib/status');
const { createActivity } = require('./lib/activity');
const { buildSailAllArgs, labelForAction } = require('./lib/actions');
const errorBoundary = require('./lib/errorBoundary');

// ── Config ──────────────────────────────────────────────────────────────────

const WEBSERVER_DIR = process.env.SAIL_TUI_DIR || path.resolve(__dirname, '..');
const LOGS_DIR = path.join(WEBSERVER_DIR, '.sail-logs');
const SAIL_ALL = path.join(WEBSERVER_DIR, 'sail-all');

// ── State ───────────────────────────────────────────────────────────────────

const activity = createActivity();

const state = {
    selected: 0,
    statuses: PROJECTS.map(() => ({ containers: false, vite: false, reverb: false, queue: false })),
    refreshing: false,
    actionRunning: null,
    logTab: 'vite',
    spinFrame: 0,
    firstLoad: true,
};

const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function addActivity(msg) {
    activity.add(msg);
}

// ── Status detection ────────────────────────────────────────────────────────

function refreshAllStatuses() {
    if (state.refreshing) return;
    state.refreshing = true;

    // Write check script to a temp file so the bash -c command doesn't
    // contain all project paths (which causes pgrep false positives)
    const scriptPath = path.join(LOGS_DIR, '.status-check.sh');
    try { fs.mkdirSync(LOGS_DIR, { recursive: true }); } catch {}
    fs.writeFileSync(scriptPath, buildStatusScript(PROJECTS, WEBSERVER_DIR));

    const child = spawn('bash', [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', d => output += d.toString());
    child.on('close', () => {
        state.statuses = parseStatusOutput(output, PROJECTS);
        state.refreshing = false;
        state.firstLoad = false;
        renderAll();
        screen.render();
    });

    setTimeout(() => {
        if (state.refreshing) {
            try { child.kill(); } catch {}
            state.refreshing = false;
        }
    }, 15000);
}

// ── Actions ─────────────────────────────────────────────────────────────────

function runAction(action, projectName) {
    if (state.actionRunning) return;
    const label = projectName || 'all';
    const actionLabel = labelForAction(action);
    state.actionRunning = `${actionLabel} ${label}`;
    addActivity(`${fg(C.yellow, SPIN[0])} ${actionLabel} ${bold(label)}...`);
    renderAll();
    screen.render();

    const args = buildSailAllArgs(action, projectName);

    const child = spawn(SAIL_ALL, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: WEBSERVER_DIR,
    });

    child.on('close', (code) => {
        const prev = state.actionRunning;
        state.actionRunning = null;
        if (code === 0) {
            addActivity(`${fg(C.green, '✓')} ${prev} ${fg(C.dim, 'done')}`);
        } else {
            addActivity(`${fg(C.red, '✗')} ${prev} ${fg(C.red, 'failed')}`);
        }
        setTimeout(() => refreshAllStatuses(), 500);
        renderAll();
        screen.render();
    });
}

// ── Artisan commands (run directly inside a project's Sail container) ───────

function runArtisan(projectName, commands) {
    if (state.actionRunning) return;
    const label = commands.join(' + ');
    state.actionRunning = `${label} ${projectName}`;
    addActivity(`${fg(C.yellow, SPIN[0])} ${label} ${bold(projectName)}...`);
    renderAll();
    screen.render();

    const dir = path.join(WEBSERVER_DIR, projectName);
    const cmds = commands.map(c => `cd "${dir}" && ./vendor/bin/sail artisan ${c}`).join(' && ');

    const child = spawn('bash', ['-c', cmds], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: dir,
    });

    child.on('close', (code) => {
        const prev = state.actionRunning;
        state.actionRunning = null;
        if (code === 0) {
            addActivity(`${fg(C.green, '✓')} ${prev} ${fg(C.dim, 'done')}`);
        } else {
            addActivity(`${fg(C.red, '✗')} ${prev} ${fg(C.red, 'failed')}`);
        }
        renderAll();
        screen.render();
    });
}

// ── Log tailing ─────────────────────────────────────────────────────────────

function tailLog(projectName, service, maxLines) {
    const result = readLogTail(LOGS_DIR, projectName, service, maxLines);
    switch (result.kind) {
        case 'missing': return [fg(C.dim, `  No ${service} log file`)];
        case 'empty':   return [fg(C.dim, `  ${service} log is empty`)];
        case 'error':   return [fg(C.dim, `  Error reading ${service} log`)];
        case 'ok':      return result.lines.map(l => '  ' + l);
    }
}

// ── Screen ──────────────────────────────────────────────────────────────────

const screen = blessed.screen({
    smartCSR: true,
    title: 'Sail Dashboard',
    fullUnicode: true,
});

errorBoundary.install({
    screen,
    logPath: path.join(LOGS_DIR, '.sail-tui-error.log'),
});

// ── Header ──────────────────────────────────────────────────────────────────

const headerBox = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    tags: true,
    style: {},
});

function renderHeader() {
    const spin = state.refreshing ? fg(C.yellow, ` ${SPIN[state.spinFrame]}`) : '';
    const actionStr = state.actionRunning
        ? `  ${fg(C.orange, '⟳')} ${fg(C.yellow, state.actionRunning)}`
        : '';

    const line1 = ` ${fg(C.green, bold('SAIL'))} ${fg(C.dim, 'DASHBOARD')}${spin}${actionStr}`;

    // Separator using box-drawing
    const w = screen.width || 80;
    const sep = fg(C.dim, '─'.repeat(Math.max(w - 2, 10)));

    headerBox.setContent(`${line1}\n ${sep}`);
}

// ── Global buttons ──────────────────────────────────────────────────────────

const globalButtons = [];

function makeGlobalBtn(label, right, bgColor, fgColor, action) {
    const padded = ` ${label} `;
    const btn = blessed.button({
        parent: screen,
        top: 0,
        right: right,
        width: padded.length,
        height: 1,
        content: padded,
        tags: true,
        mouse: true,
        style: {
            fg: fgColor, bg: bgColor,
            hover: { bold: true },
        },
    });
    btn.on('press', action);
    globalButtons.push(btn);
    return btn;
}

makeGlobalBtn('Stop All', 1,  C.red,    '#ffffff', () => runAction('down'));
makeGlobalBtn('Up All',   12, C.green,  '#000000', () => runAction('up'));
makeGlobalBtn('Dev All',  21, C.yellow, '#000000', () => runAction('dev'));
makeGlobalBtn('Heal All', 31, C.magenta,'#000000', () => runAction('heal'));

// ── Left pane: Project list ─────────────────────────────────────────────────

const projectBox = blessed.box({
    parent: screen,
    top: 3,
    left: 0,
    width: '50%',
    height: '100%-5',
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: C.border } },
    label: ` ${fg(C.mid, bold('PROJECTS'))} `,
    padding: { left: 1, right: 1 },
});

function renderProjectList() {
    const listWidth = (projectBox.width || 40) - 4;  // padding + borders
    const nameWidth = 22;

    const lines = PROJECTS.map((p, i) => {
        const s = state.statuses[i];
        const sel = i === state.selected;

        // Accent bar for selected row
        const bar = sel ? fg(p.accent, '▌') : ' ';

        // Status dot
        let dot;
        if (state.firstLoad) {
            dot = fg(C.dim, '○');
        } else {
            dot = s.containers ? fg(C.green, '●') : fg(C.dim, '○');
        }

        // Project name — highlighted if selected
        const name = sel
            ? fg(p.accent, bold(p.display.padEnd(nameWidth)))
            : fg(C.text, p.display.padEnd(nameWidth));

        // Status label
        let statusLabel;
        if (state.firstLoad) {
            statusLabel = fg(C.dim, '··');
        } else if (s.containers) {
            statusLabel = fg(C.green, 'UP');
        } else {
            statusLabel = fg(C.dim, '──');
        }

        // Service badges (only when running)
        const badges = [];
        if (s.vite)   badges.push(fg(C.yellow, 'vite'));
        if (s.reverb) badges.push(fg(C.cyan, 'reverb'));
        if (s.queue)  badges.push(fg(C.magenta, 'queue'));
        const badgeStr = badges.length ? ' ' + badges.join(fg(C.dim, '·')) : '';

        return `${bar} ${dot} ${name} ${statusLabel}${badgeStr}`;
    });

    projectBox.setContent(lines.join('\n'));
}

// Click handling
projectBox.on('click', function(mouse) {
    if (mouse && typeof mouse.y === 'number') {
        const boxTop = typeof projectBox.atop === 'number' ? projectBox.atop : projectBox.top;
        const idx = mouse.y - boxTop - 1;
        if (idx >= 0 && idx < PROJECTS.length) {
            state.selected = idx;
            renderAll();
            screen.render();
        }
    }
});

// ── Right pane: Detail + Buttons + Logs ─────────────────────────────────────

const detailBox = blessed.box({
    parent: screen,
    top: 3,
    left: '50%',
    width: '50%',
    height: 11,
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: C.border } },
    padding: { left: 1, right: 1 },
});

function renderDetail() {
    const p = PROJECTS[state.selected];
    const s = state.statuses[state.selected];

    const titleLine = fg(p.accent, bold(p.display));
    const urlLine = fg(C.dim, `https://${p.url}`);

    const sep = fg(C.border, '─'.repeat(Math.max((detailBox.width || 30) - 4, 10)));

    // Service status rows
    const svcLabel = (label, running, color) => {
        const dot = running ? fg(color, '●') : fg(C.dim, '○');
        const text = running ? fg(color, 'Running') : fg(C.dim, 'Stopped');
        return `  ${dot} ${fg(C.mid, label.padEnd(12))} ${text}`;
    };

    const services = [
        svcLabel('Containers', s.containers, C.green),
        svcLabel('Vite',       s.vite,       C.yellow),
    ];
    if (p.reverb) services.push(svcLabel('Reverb', s.reverb, C.cyan));
    if (p.queue)  services.push(svcLabel('Queue',  s.queue,  C.magenta));

    const lines = [
        ` ${titleLine}`,
        ` ${urlLine}`,
        ` ${sep}`,
        ...services,
    ];

    detailBox.setContent(lines.join('\n'));
    detailBox.setLabel(` ${fg(C.mid, bold(p.display.toUpperCase()))} `);
}

// ── Action buttons ──────────────────────────────────────────────────────────

// Row 1: Sail lifecycle (primary)
const btnRow = blessed.box({
    parent: screen,
    top: 14,
    left: '50%+1',
    width: '50%-2',
    height: 1,
    tags: true,
});

// Row 2: Artisan / maintenance (secondary)
const btnRow2 = blessed.box({
    parent: screen,
    top: 15,
    left: '50%+1',
    width: '50%-2',
    height: 1,
    tags: true,
});

function makeBtn(parent, label, left, bgColor, fgColor, action) {
    const padded = ` ${label} `;
    const btn = blessed.button({
        parent,
        top: 0,
        left,
        width: padded.length,
        height: 1,
        content: padded,
        tags: true,
        mouse: true,
        style: {
            fg: fgColor, bg: bgColor,
            hover: { bold: true },
        },
    });
    btn.on('press', action);
    return btn;
}

// Primary row — consistent green/yellow/red spectrum
makeBtn(btnRow, 'Up',      1,  C.green,   '#000000', () => runAction('up', PROJECTS[state.selected].name));
makeBtn(btnRow, 'Dev',     6,  C.yellow,  '#000000', () => runAction('dev', PROJECTS[state.selected].name));
makeBtn(btnRow, 'Stop',    12, C.red,     '#ffffff', () => runAction('down', PROJECTS[state.selected].name));
makeBtn(btnRow, 'Restart', 19, C.cyan,    '#000000', () => runAction('restart', PROJECTS[state.selected].name));
makeBtn(btnRow, 'Heal',    29, C.magenta, '#000000', () => runAction('heal', PROJECTS[state.selected].name));

// Secondary row — muted, all same tone
const btnDim = '#555555';
const btnDimFg = '#dddddd';
makeBtn(btnRow2, 'cache:clear', 1,  btnDim, btnDimFg, () => runArtisan(PROJECTS[state.selected].name, ['cache:clear']));
makeBtn(btnRow2, 'view:clear',  16, btnDim, btnDimFg, () => runArtisan(PROJECTS[state.selected].name, ['view:clear']));
makeBtn(btnRow2, 'flush all',   30, btnDim, C.orange, () => runArtisan(PROJECTS[state.selected].name, ['cache:clear', 'view:clear', 'route:clear', 'config:clear']));

// ── Log tabs (clickable) ────────────────────────────────────────────────────

const TAB_DEFS = ['vite', 'reverb', 'queue'];
const tabButtons = {};
let tabOffset = 1;

TAB_DEFS.forEach((t, i) => {
    const label = t.toUpperCase();
    const width = label.length + 2;
    const btn = blessed.button({
        parent: screen,
        top: 17,
        left: `50%+${tabOffset}`,
        width: width,
        height: 1,
        content: ` ${label} `,
        tags: true,
        mouse: true,
        style: { fg: C.dim, hover: { fg: C.bright } },
    });
    btn.on('press', () => {
        state.logTab = t;
        renderLogTabs();
        renderLogView();
        screen.render();
    });
    tabButtons[t] = btn;
    tabOffset += width + 1;
});

function renderLogTabs() {
    const p = PROJECTS[state.selected];

    TAB_DEFS.forEach(t => {
        const btn = tabButtons[t];
        const visible = t === 'vite' || (t === 'reverb' && p.reverb) || (t === 'queue' && p.queue);
        if (!visible) {
            btn.hide();
            return;
        }
        btn.show();
        const active = state.logTab === t;
        btn.style.fg = active ? C.bright : C.dim;
        btn.style.bg = active ? C.border : undefined;
        btn.style.bold = active;
    });
}

// ── Log view ────────────────────────────────────────────────────────────────

const logBox = blessed.box({
    parent: screen,
    top: 18,
    left: '50%',
    width: '50%',
    height: '100%-20',
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: C.border } },
    label: ` ${fg(C.mid, bold('LOGS'))} `,
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    scrollbar: {
        ch: '█',
        style: { fg: C.dim },
    },
});

function renderLogView() {
    const p = PROJECTS[state.selected];
    const availH = Math.max((logBox.height || 10) - 2, 5);
    const lines = tailLog(p.name, state.logTab, availH);

    logBox.setContent(lines.join('\n'));
    logBox.setScrollPerc(100);
    renderLogTabs();
}

// ── Status bar ──────────────────────────────────────────────────────────────

const statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 2,
    tags: true,
    style: {},
    padding: { left: 1 },
});

function renderStatusBar() {
    const upCount = state.statuses.filter(s => s.containers).length;
    const total = PROJECTS.length;
    const now = new Date().toLocaleTimeString('en-IE', { hour12: false });

    // Key hints — dim keys, bright actions
    const key = (k, action) => `${fg(C.dim, k)} ${fg(C.mid, action)}`;
    const keys = [
        key('j/k', 'nav'),
        key('u', 'up'),
        key('d', 'dev'),
        key('s', 'stop'),
        key('r', 'restart'),
        key('h', 'heal'),
        key('c', 'clear'),
        key('SHIFT', 'all'),
        key('l', 'log'),
        key('a', 'activity'),
        key('q', 'quit'),
    ].join(fg(C.border, '  '));

    // Info line
    const upLabel = upCount > 0
        ? `${fg(C.green, `${upCount}`)}${fg(C.dim, `/${total}`)}`
        : `${fg(C.dim, `0/${total}`)}`;

    const dot = state.refreshing ? fg(C.yellow, SPIN[state.spinFrame]) : fg(C.green, '●');
    const timeStr = fg(C.dim, now);

    const recent = activity.list();
    const recentAction = recent.length > 0
        ? `  ${fg(C.dim, '│')}  ${recent[0].msg}`
        : '';

    statusBar.setContent(`${keys}\n ${dot} ${upLabel} up  ${fg(C.dim, '│')}  ${timeStr}${recentAction}`);
}

// ── Activity overlay ────────────────────────────────────────────────────────

let activityVisible = false;

const activityBox = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '60%',
    height: '60%',
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: C.mid } },
    label: ` ${fg(C.mid, bold('ACTIVITY LOG'))} `,
    padding: { left: 1, right: 1, top: 1 },
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    scrollbar: { ch: '█', style: { fg: C.dim } },
    hidden: true,
});

function renderActivity() {
    if (!activityVisible) return;
    const entries = activity.list();
    if (entries.length === 0) {
        activityBox.setContent(fg(C.dim, '  No recent activity'));
        return;
    }
    const lines = entries.map(a => `${fg(C.dim, a.time)}  ${a.msg}`);
    activityBox.setContent(lines.join('\n'));
}

function toggleActivity() {
    activityVisible = !activityVisible;
    if (activityVisible) {
        renderActivity();
        activityBox.show();
        activityBox.focus();
    } else {
        activityBox.hide();
    }
    screen.render();
}

// ── Render all ──────────────────────────────────────────────────────────────

function renderAll() {
    renderHeader();
    renderProjectList();
    renderDetail();
    renderLogView();
    renderStatusBar();
    renderActivity();
}

// ── Keybindings ─────────────────────────────────────────────────────────────

screen.key(['q', 'C-c'], () => process.exit(0));

screen.key(['j', 'down'], () => {
    if (activityVisible) return;
    state.selected = Math.min(state.selected + 1, PROJECTS.length - 1);
    state.logTab = 'vite'; // reset log tab on project change
    renderAll();
    screen.render();
});

screen.key(['k', 'up'], () => {
    if (activityVisible) return;
    state.selected = Math.max(state.selected - 1, 0);
    state.logTab = 'vite';
    renderAll();
    screen.render();
});

// Single project actions
screen.key('u', () => { if (!activityVisible) runAction('up', PROJECTS[state.selected].name); });
screen.key('d', () => { if (!activityVisible) runAction('dev', PROJECTS[state.selected].name); });
screen.key('s', () => { if (!activityVisible) runAction('down', PROJECTS[state.selected].name); });
screen.key('r', () => { if (!activityVisible) runAction('restart', PROJECTS[state.selected].name); });
screen.key('h', () => { if (!activityVisible) runAction('heal', PROJECTS[state.selected].name); });
screen.key('c', () => { if (!activityVisible) runArtisan(PROJECTS[state.selected].name, ['cache:clear', 'view:clear']); });

// All project actions (shift)
screen.key('S-u', () => { if (!activityVisible) runAction('up'); });
screen.key('S-d', () => { if (!activityVisible) runAction('dev'); });
screen.key('S-s', () => { if (!activityVisible) runAction('down'); });
screen.key('S-r', () => { if (!activityVisible) runAction('restart'); });
screen.key('S-h', () => { if (!activityVisible) runAction('heal'); });

// Log tab cycling
screen.key('l', () => {
    if (activityVisible) return;
    const p = PROJECTS[state.selected];
    const tabs = ['vite'];
    if (p.reverb) tabs.push('reverb');
    if (p.queue) tabs.push('queue');
    const cur = tabs.indexOf(state.logTab);
    state.logTab = tabs[(cur + 1) % tabs.length];
    renderLogView();
    screen.render();
});

// Activity toggle
screen.key('a', toggleActivity);
screen.key('escape', () => {
    if (activityVisible) toggleActivity();
});

// Manual refresh
screen.key('f', () => refreshAllStatuses());

// ── Spinner animation ───────────────────────────────────────────────────────

setInterval(() => {
    state.spinFrame = (state.spinFrame + 1) % SPIN.length;
    if (state.refreshing || state.actionRunning) {
        renderHeader();
        renderStatusBar();
        screen.render();
    }
}, 80);

// ── Boot ────────────────────────────────────────────────────────────────────

addActivity(`${fg(C.green, '●')} Dashboard started`);
renderAll();
screen.render();
refreshAllStatuses();

// Auto-refresh status every 5s
setInterval(() => refreshAllStatuses(), 5000);

// Auto-refresh logs every 2s
setInterval(() => {
    renderLogView();
    renderStatusBar();
    screen.render();
}, 2000);

// Handle resize
screen.on('resize', () => {
    renderAll();
    screen.render();
});
