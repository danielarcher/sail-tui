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
const { validateProjects } = require('./lib/validateProjects');
const { openUrl } = require('./lib/browser');
const { isAtBottom } = require('./lib/followMode');
const { parseViteHealth, STATES: VITE_STATES } = require('./lib/viteHealth');
const { cancelChild } = require('./lib/cancel');
const { formatHelpLines } = require('./lib/help');
const { readGitDetails } = require('./lib/git');
const { loadState, saveState, resolveSelectedIndex, resolveLogTab } = require('./lib/persistence');
const errorBoundary = require('./lib/errorBoundary');

try {
    validateProjects(PROJECTS);
} catch (err) {
    process.stderr.write(`sail-tui: invalid PROJECTS configuration — ${err.message}\n`);
    process.exit(2);
}

// ── Config ──────────────────────────────────────────────────────────────────

const WEBSERVER_DIR = process.env.SAIL_TUI_DIR || path.resolve(__dirname, '..');
const LOGS_DIR = path.join(WEBSERVER_DIR, '.sail-logs');
const SAIL_ALL = path.join(WEBSERVER_DIR, 'sail-all');

// ── State ───────────────────────────────────────────────────────────────────

const activity = createActivity();

const persisted = loadState();
const initialSelected = resolveSelectedIndex(PROJECTS, persisted.selectedProject);
const initialLogTab = resolveLogTab(PROJECTS[initialSelected], persisted.logTab);

const state = {
    selected: initialSelected,
    statuses: PROJECTS.map(() => ({ containers: false, vite: false, reverb: false, queue: false })),
    viteHealth: PROJECTS.map(() => null),
    gitDetails: null,
    gitSelectedIdx: -1,
    refreshing: false,
    actionRunning: null,
    actionChild: null,
    logTab: initialLogTab,
    logFollow: true,
    spinFrame: 0,
    firstLoad: true,
};

function refreshSelectedGitDetails() {
    const p = PROJECTS[state.selected];
    const dir = path.join(WEBSERVER_DIR, p.name);
    state.gitDetails = readGitDetails(dir);
    state.gitSelectedIdx = state.selected;
}

function refreshViteHealth() {
    PROJECTS.forEach((p, i) => {
        if (!state.statuses[i].vite) {
            state.viteHealth[i] = null;
            return;
        }
        const result = readLogTail(LOGS_DIR, p.name, 'vite', 100);
        state.viteHealth[i] = result.kind === 'ok' ? parseViteHealth(result.lines) : null;
    });
}

function viteHealthColor(health) {
    switch (health) {
        case VITE_STATES.READY:     return C.green;
        case VITE_STATES.COMPILING: return C.yellow;
        case VITE_STATES.ERROR:     return C.red;
        default:                    return C.yellow;
    }
}

function viteHealthLabel(health) {
    switch (health) {
        case VITE_STATES.READY:     return 'Ready';
        case VITE_STATES.COMPILING: return 'Compiling';
        case VITE_STATES.ERROR:     return 'Error';
        default:                    return 'Running';
    }
}

function persistSession() {
    saveState({
        selectedProject: PROJECTS[state.selected].name,
        logTab: state.logTab,
    });
}

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
        refreshViteHealth();
        refreshSelectedGitDetails();
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
    state.actionChild = child;

    child.on('close', (code, signal) => {
        const prev = state.actionRunning;
        state.actionRunning = null;
        state.actionChild = null;
        if (signal) {
            addActivity(`${fg(C.yellow, '⊘')} ${prev} ${fg(C.yellow, `cancelled (${signal})`)}`);
        } else if (code === 0) {
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
    state.actionChild = child;

    child.on('close', (code, signal) => {
        const prev = state.actionRunning;
        state.actionRunning = null;
        state.actionChild = null;
        if (signal) {
            addActivity(`${fg(C.yellow, '⊘')} ${prev} ${fg(C.yellow, `cancelled (${signal})`)}`);
        } else if (code === 0) {
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
    height: '55%-3',
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: C.border } },
    label: ` ${fg(C.mid, bold('PROJECTS'))} `,
    padding: { left: 1, right: 1 },
});

const gitPanel = blessed.box({
    parent: screen,
    top: '55%',
    left: 0,
    width: '50%',
    bottom: 2,
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: C.border } },
    label: ` ${fg(C.mid, bold('GIT'))} `,
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
        if (s.vite)   badges.push(fg(viteHealthColor(state.viteHealth[i]), 'vite'));
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
        if (idx >= 0 && idx < PROJECTS.length && idx !== state.selected) {
            state.selected = idx;
            state.logTab = 'vite';
            state.logFollow = true;
            onProjectSelectionChanged();
            persistSession();
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
    const svcLabel = (label, running, color, runningText = 'Running') => {
        const dot = running ? fg(color, '●') : fg(C.dim, '○');
        const text = running ? fg(color, runningText) : fg(C.dim, 'Stopped');
        return `  ${dot} ${fg(C.mid, label.padEnd(12))} ${text}`;
    };

    const viteColor = s.vite ? viteHealthColor(state.viteHealth[state.selected]) : C.yellow;
    const viteText  = s.vite ? viteHealthLabel(state.viteHealth[state.selected]) : 'Running';

    const services = [
        svcLabel('Containers', s.containers, C.green),
        svcLabel('Vite',       s.vite,       viteColor, viteText),
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

// Drop follow mode whenever the user scrolls away from the bottom; resume
// it automatically when they scroll back down. This lets log refreshes
// stop fighting the user when they're trying to read an error above the
// tail. Don't re-render from here — the 2s log refresh interval will pick
// up the new state on its next tick, and the "paused" label update is not
// urgent.
logBox.on('scroll', () => {
    state.logFollow = isAtBottom(logBox.getScrollPerc());
});

function renderLogView() {
    const p = PROJECTS[state.selected];
    const availH = Math.max((logBox.height || 10) - 2, 5);
    const lines = tailLog(p.name, state.logTab, availH);

    const prevScroll = logBox.getScroll();
    logBox.setContent(lines.join('\n'));
    if (state.logFollow) {
        logBox.setScrollPerc(100);
    } else {
        // Preserve the line the user was looking at across refreshes
        logBox.scrollTo(prevScroll);
    }

    const suffix = state.logFollow ? '' : fg(C.dim, ' · paused (G to resume)');
    logBox.setLabel(` ${fg(C.mid, bold('LOGS'))}${suffix} `);
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
        key('o', 'open'),
        key('SHIFT', 'all'),
        key('l', 'log'),
        key('G', 'follow'),
        key('a', 'activity'),
        key('Esc', 'cancel'),
        key('?', 'help'),
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

function overlayVisible() {
    return activityVisible || helpVisible;
}

// ── Help overlay ───────────────────────────────────────────────────────────

let helpVisible = false;

const helpBox = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '70%',
    height: '70%',
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: C.mid } },
    label: ` ${fg(C.mid, bold('KEYBINDINGS'))} `,
    padding: { left: 2, right: 2, top: 1, bottom: 1 },
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    scrollbar: { ch: '█', style: { fg: C.dim } },
    hidden: true,
});

function renderHelp() {
    if (!helpVisible) return;
    const keyLine = (l) => {
        // Highlight the key column with bright text and dim the gap, so
        // the overlay reads like a two-column cheat sheet.
        const m = l.match(/^(\s+)(\S(?:.*?\S)?)(\s{2,})(.*)$/);
        if (!m) return l;
        return `${m[1]}${fg(C.bright, m[2])}${fg(C.dim, m[3])}${fg(C.text, m[4])}`;
    };
    const content = [
        fg(C.mid, 'Keyboard shortcuts for sail-tui'),
        '',
        ...formatHelpLines().map(keyLine),
        '',
        fg(C.dim, 'Press ? or Esc to close.'),
    ];
    helpBox.setContent(content.join('\n'));
}

function toggleHelp() {
    helpVisible = !helpVisible;
    if (helpVisible) {
        renderHelp();
        helpBox.show();
        helpBox.focus();
    } else {
        helpBox.hide();
    }
    screen.render();
}

// ── Git panel ──────────────────────────────────────────────────────────────

function truncate(text, max) {
    if (max <= 0) return '';
    if (text.length <= max) return text;
    return text.slice(0, Math.max(max - 1, 0)) + '…';
}

function renderGit() {
    const d = state.gitDetails;
    const innerWidth = Math.max((gitPanel.width || 40) - 4, 20);

    if (!d) {
        gitPanel.setContent(`\n  ${fg(C.dim, 'Not a git repository')}`);
        return;
    }

    const branchColor = d.dirty ? C.yellow : C.bright;
    const branchLine = `${fg(C.dim, '⎇')} ${fg(branchColor, bold(d.branch))}` +
        (d.dirty ? fg(C.yellow, ' ●') : '');

    let upstreamLine;
    if (!d.upstream) {
        upstreamLine = fg(C.dim, 'no upstream tracked');
    } else {
        const ab = [];
        if (d.ahead !== null && d.ahead > 0)   ab.push(fg(C.green, `↑${d.ahead}`));
        if (d.behind !== null && d.behind > 0) ab.push(fg(C.red,   `↓${d.behind}`));
        const inSync = ab.length === 0 && d.ahead !== null && d.behind !== null;
        const suffix = inSync ? fg(C.green, ' ✓') : (ab.length ? ` ${ab.join(' ')}` : '');
        upstreamLine = `${fg(C.dim, '⇡')} ${fg(C.mid, d.upstream)}${suffix}`;
    }

    const c = d.counts;
    const countParts = [];
    if (c.staged > 0)     countParts.push(fg(C.green,  `${c.staged}●`));
    if (c.modified > 0)   countParts.push(fg(C.yellow, `${c.modified}✎`));
    if (c.untracked > 0)  countParts.push(fg(C.mid,    `${c.untracked}?`));
    if (c.conflicted > 0) countParts.push(fg(C.red,    `${c.conflicted}!`));
    if (d.stash > 0)      countParts.push(fg(C.magenta, `${d.stash}⚑`));
    const countsLine = countParts.length > 0
        ? countParts.join(fg(C.dim, '  '))
        : `${fg(C.green, '✓')} ${fg(C.dim, 'clean')}`;

    const sep = fg(C.border, '─'.repeat(innerWidth));
    const logHeader = fg(C.dim, 'RECENT');

    const logLines = d.log.length === 0
        ? [fg(C.dim, '  (no commits)')]
        : d.log.map(entry => {
            const hash = fg(C.cyan, entry.hash);
            const rel  = fg(C.dim, entry.rel);
            // Reserve room: "hash " (8) + " rel" (up to 14) + padding
            const subjRoom = Math.max(innerWidth - 10 - Math.min(entry.rel.length + 1, 16), 10);
            const subj = fg(C.text, truncate(entry.subject, subjRoom));
            return `${hash} ${subj} ${rel}`;
        });

    const lines = [
        branchLine,
        upstreamLine,
        countsLine,
        sep,
        logHeader,
        ...logLines,
    ];
    gitPanel.setContent(lines.join('\n'));
}

// ── Render all ──────────────────────────────────────────────────────────────

function renderAll() {
    renderHeader();
    renderProjectList();
    renderDetail();
    renderGit();
    renderLogView();
    renderStatusBar();
    renderActivity();
}

function onProjectSelectionChanged() {
    // Re-read git details for the freshly-selected project. The regular 5s
    // status refresh will also re-read them, but doing it immediately keeps
    // the panel responsive to navigation.
    if (state.gitSelectedIdx !== state.selected) {
        state.gitDetails = null;
        refreshSelectedGitDetails();
    }
}

// ── Keybindings ─────────────────────────────────────────────────────────────

screen.key(['q', 'C-c'], () => process.exit(0));

screen.key(['j', 'down'], () => {
    if (overlayVisible()) return;
    state.selected = Math.min(state.selected + 1, PROJECTS.length - 1);
    state.logTab = 'vite'; // reset log tab on project change
    state.logFollow = true;
    onProjectSelectionChanged();
    persistSession();
    renderAll();
    screen.render();
});

screen.key(['k', 'up'], () => {
    if (overlayVisible()) return;
    state.selected = Math.max(state.selected - 1, 0);
    state.logTab = 'vite';
    state.logFollow = true;
    onProjectSelectionChanged();
    persistSession();
    renderAll();
    screen.render();
});

// Single project actions
screen.key('u', () => { if (!overlayVisible()) runAction('up', PROJECTS[state.selected].name); });
screen.key('d', () => { if (!overlayVisible()) runAction('dev', PROJECTS[state.selected].name); });
screen.key('s', () => { if (!overlayVisible()) runAction('down', PROJECTS[state.selected].name); });
screen.key('r', () => { if (!overlayVisible()) runAction('restart', PROJECTS[state.selected].name); });
screen.key('h', () => { if (!overlayVisible()) runAction('heal', PROJECTS[state.selected].name); });
screen.key('c', () => { if (!overlayVisible()) runArtisan(PROJECTS[state.selected].name, ['cache:clear', 'view:clear']); });

screen.key('o', () => {
    if (overlayVisible()) return;
    const p = PROJECTS[state.selected];
    const url = `https://${p.url}`;
    try {
        openUrl(url);
        addActivity(`${fg(C.cyan, '↗')} open ${bold(p.display)} ${fg(C.dim, url)}`);
    } catch (err) {
        addActivity(`${fg(C.red, '✗')} open ${p.display} ${fg(C.red, err.message || 'failed')}`);
    }
    renderAll();
    screen.render();
});

// All project actions (shift)
screen.key('S-u', () => { if (!overlayVisible()) runAction('up'); });
screen.key('S-d', () => { if (!overlayVisible()) runAction('dev'); });
screen.key('S-s', () => { if (!overlayVisible()) runAction('down'); });
screen.key('S-r', () => { if (!overlayVisible()) runAction('restart'); });
screen.key('S-h', () => { if (!overlayVisible()) runAction('heal'); });

// Log tab cycling
screen.key('l', () => {
    if (overlayVisible()) return;
    const p = PROJECTS[state.selected];
    const tabs = ['vite'];
    if (p.reverb) tabs.push('reverb');
    if (p.queue) tabs.push('queue');
    const cur = tabs.indexOf(state.logTab);
    state.logTab = tabs[(cur + 1) % tabs.length];
    state.logFollow = true;
    persistSession();
    renderLogView();
    screen.render();
});

// Jump to bottom of log + resume follow mode
screen.key(['G', 'end'], () => {
    if (overlayVisible()) return;
    state.logFollow = true;
    logBox.setScrollPerc(100);
    renderLogView();
    screen.render();
});

// Activity toggle
screen.key('a', toggleActivity);
screen.key('?', toggleHelp);
screen.key('escape', () => {
    if (activityVisible) { toggleActivity(); return; }
    if (helpVisible)     { toggleHelp();     return; }
    if (state.actionChild) {
        if (cancelChild(state.actionChild)) {
            addActivity(`${fg(C.yellow, '⊘')} cancelling ${state.actionRunning}...`);
            renderAll();
            screen.render();
        }
    }
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
    refreshViteHealth();
    renderLogView();
    renderProjectList();
    renderDetail();
    renderStatusBar();
    screen.render();
}, 2000);

// Handle resize
screen.on('resize', () => {
    renderAll();
    screen.render();
});
