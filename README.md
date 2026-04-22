# sail-tui

[![Tests](https://github.com/danielarcher/sail-tui/actions/workflows/test.yml/badge.svg)](https://github.com/danielarcher/sail-tui/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](./package.json)

Terminal UI dashboard for managing all Laravel Sail projects under `~/webserver/`.

Wraps the existing `sail-all` script with a real-time interactive interface — status monitoring, log tailing, and per-project or bulk actions, all from one terminal.

## Quick Start

```bash
# From ~/webserver/
./sail-tui.sh
```

Requires Node.js (v18+). Dependencies are installed locally in `sail-tui/node_modules/`.

## Layout

```
┌─ SAIL DASHBOARD ──────────────────── Dev All ─ Up All ─ Stop All ─┐
│                                                                     │
│  PROJECTS                        │  PROJECT NAME                    │
│  ▌● Void Crown Arena    UP vite  │  https://project.local           │
│   ○ Fastidious.gg       ──       │  ──────────────────              │
│   ○ Fastidious React    ──       │  ● Containers   Running          │
│   ● LootKeep            UP vite  │  ● Vite         Running          │
│   ● Marmitas Irlanda    UP ...   │  ○ Reverb       Stopped          │
│                                  │                                   │
│                                  │  ● Tests        ✓ 248 · 1.4s     │
│                                  │  [ Up ] [ Dev ] [ Stop ] [Restart]│
├──────────────────────────────────┤                                   │
│  GIT                             │  VITE │ REVERB │ QUEUE │ LARAVEL │ TESTS │
│  ⎇ main ●                        │  ┌─ LOGS ───────────────────┐    │
│  ⇡ origin/main ↑2                │  │ > dev                     │    │
│  3✎  1?  1⚑                       │  │ > vite                    │    │
│  ─────────                        │  │ VITE v8.0.8 ready in 651 │    │
│  RECENT                           │  └───────────────────────────┘    │
│  abc1234 fix bug   2h  Alice      │                                   │
│  def5678 add feat  1d  Bob        │                                   │
├─────────────────────────────────────────────────────────────────────┤
│  j/k nav  u up  d dev  s stop  r restart  SHIFT all  l log  q quit  │
│  ● 3/8 up  │  14:59:11  │  ✓ dev marmitas-irlanda done              │
└─────────────────────────────────────────────────────────────────────┘
```

## Keybindings

| Key         | Action                              |
|-------------|-------------------------------------|
| `j` / `k`   | Navigate project list (or arrows)  |
| `u`         | Start selected project (containers) |
| `d`         | Dev mode — containers + Vite + Reverb + Queue |
| `s`         | Stop selected project               |
| `r`         | Restart selected project            |
| `t`         | Run the project's test suite (streams into the TESTS tab) |
| `U` (Shift) | Start all projects                  |
| `D` (Shift) | Dev all projects                    |
| `S` (Shift) | Stop all projects                   |
| `R` (Shift) | Restart all projects                |
| `F` (Shift) | Fix Laravel — clear compiled views + `artisan optimize:clear` |
| `o`         | Open selected project URL in the default browser |
| `l`         | Cycle log tabs (Vite → Reverb → Queue → Laravel → Tests) |
| `←` / `→`   | Horizontal scroll through long log lines (no wrap)  |
| `0`         | Reset horizontal scroll to column 0                 |
| `G` / `End` | Jump to end of log, resume follow mode, reset horizontal scroll |
| `?`         | Toggle the help / keybindings overlay |
| `a`         | Toggle activity log overlay         |
| `Escape`    | Close the activity overlay, or cancel the in-flight action |
| `f`         | Force status refresh                |
| `q` / `Ctrl+C` | Quit                            |

Mouse clicks work on all buttons, log tabs, and the project list.

## How It Works

### Architecture

```
sail-tui.js (Node.js + neo-blessed)
    │
    ├── Status Detection ──→ writes .sail-logs/.status-check.sh
    │                         then runs it via bash
    │
    ├── Actions ───────────→ spawns: sail-all {up|down|dev|restart} [project]
    │
    └── Log Tailing ───────→ reads: .sail-logs/{project}-{vite|reverb|queue|tests}.log
                             reads: {project}/storage/logs/laravel.log
```

The TUI is a **wrapper** around `sail-all` — it does not reimplement container management, process lifecycle, or storage symlink fixes. All actions delegate to the existing script.

### Status Detection

Every 5 seconds, the TUI checks what's running:

1. **Containers** — runs `sail ps -q` per project and counts results. If > 0, Docker containers are up.
2. **Vite / Reverb / Queue** — uses `pgrep -xc -f` to match the exact process command line:
   - Vite: `bash /path/to/sail npm run dev`
   - Reverb: `bash /path/to/sail artisan reverb:start`
   - Queue: `bash /path/to/sail artisan queue:work` (partial match, since it has extra flags)

All checks are written to a **temp script file** (`.sail-logs/.status-check.sh`) before execution. This prevents `pgrep` from matching the checker's own bash process — a false-positive bug that occurs when all project paths are embedded in a single `bash -c` command string.

Status also refreshes immediately after any action completes.

### Actions

When you press a key or click a button:

1. The TUI spawns `sail-all {action} [project]` as a child process
2. The header shows a spinning indicator with the action name
3. On completion, a `✓` or `✗` entry is added to the activity log
4. Status refreshes 500ms after the action finishes

Only one action can run at a time — buttons are ignored while an action is in-flight.

### Log Tailing

The TUI reads log files every 2 seconds:

- `.sail-logs/{project}-vite.log` — Vite dev server output
- `.sail-logs/{project}-reverb.log` — Reverb WebSocket server output
- `.sail-logs/{project}-queue.log` — Queue worker output
- `.sail-logs/{project}-tests.log` — most recent test run
- `{project}/storage/logs/laravel.log` — Laravel application log (read from inside each project)

Files under `.sail-logs/` are created by `sail-all dev` / the test runner. The Laravel log is written by the framework itself. The TUI reads the last 16KB of each and displays the tail. ANSI escape codes are stripped; blessed markup characters (`{`, `}`) are escaped to prevent rendering glitches.

Log tabs are clickable or cycle with `l`. Tabs auto-hide for projects that don't use Reverb/Queue; the Laravel tab is always visible.

### Laravel issue detection & auto-fix

The Laravel tab scans recent log lines for known-fixable problems and surfaces them without requiring you to open the tab:

- **Stale compiled Blade views** — detected by the signature `Call to undefined function _{32-hex-digits}()`. The LARAVEL tab turns red, and opening it shows a `⚠ stale compiled views — press F to clear` banner.
- **Other `local.ERROR` entries** — the tab turns orange and shows a softer hint.

Press `Shift+F` (or click the **Fix Laravel** button in the second action row) to run the recovery sequence:

1. Delete `storage/framework/views/*.php` **directly on the host**. This handles the case where the view cache is so wedged that `artisan` itself can't boot.
2. Run `artisan optimize:clear` inside Sail to flush cache / config / route / view / event caches the official way.

Step 2 needs the container up; if it's down, step 1 still unblocks the app once the container comes back (the TUI logs `views cleared, artisan failed` in that case).

### Color System

Each project has a unique accent color (matching `dashboard.html`):

| Project             | Accent    |
|---------------------|-----------|
| Void Crown Arena    | `#a855f7` (purple) |
| Fastidious.gg       | `#22d3ee` (cyan) |
| Fastidious React    | `#f97316` (orange) |
| Free Dublin Horses  | `#4ade80` (green) |
| IAANG.com           | `#f43f5e` (red) |
| Next Level Raid     | `#3b82f6` (blue) |
| LootKeep            | `#eab308` (yellow) |
| Marmitas Irlanda    | `#ec4899` (pink) |

The selected project's name and accent bar (`▌`) use its color. Service statuses use semantic colors: green = containers, yellow = Vite, cyan = Reverb, magenta = Queue.

No background colors are forced — the TUI inherits your terminal's native background for a cohesive look.

## Files

```
~/webserver/
├── sail-tui.sh              # Launcher script (just runs node sail-tui/sail-tui.js)
├── sail-all                 # Existing management script (unchanged, called by TUI)
├── .sail-logs/              # Log directory (created by sail-all dev)
│   ├── {project}-vite.log
│   ├── {project}-reverb.log
│   ├── {project}-queue.log
│   └── .status-check.sh    # Temp script generated each status refresh cycle
└── sail-tui/
    ├── sail-tui.js          # Main TUI application — wiring and rendering
    ├── lib/                 # Pure modules (testable without blessed)
    │   ├── projects.js      # PROJECTS definitions
    │   ├── theme.js         # Colour palette + blessed tag helpers
    │   ├── logs.js          # readLogTail, sanitizeLogLine
    │   ├── status.js        # buildStatusScript, parseStatusOutput
    │   ├── activity.js      # createActivity ring buffer
    │   └── actions.js       # buildSailAllArgs, labelForAction
    ├── test/                # node:test suite (no framework, no deps)
    │   ├── logs.test.js
    │   ├── status.test.js
    │   ├── activity.test.js
    │   ├── actions.test.js
    │   ├── theme.test.js
    │   └── projects.test.js
    ├── package.json
    └── node_modules/        # neo-blessed dependency
```

## Testing

Pure logic is split into `lib/` modules so it can be tested without booting
blessed. The suite uses Node's built-in `node:test` runner — no test
framework, no dev dependencies.

```bash
npm test
```

Pipeline-coupled parts (blessed rendering, `spawn`, timers) are not covered
by the unit suite; they are best exercised with a PTY-based smoke test
(future work).

## Adding a New Project

1. Add an entry to the `PROJECTS` array in `sail-tui.js` (name, display, url, reverb, queue, accent color)
2. Add the same project to the `PROJECTS` array in `sail-all`
3. The TUI will pick it up on next launch

## Troubleshooting

**Status shows wrong state** — Press `f` to force a refresh. If `sail ps` is slow (Docker engine lag), the 15-second timeout may expire; check `docker ps` manually.

**Logs show "No log file"** — Logs are only created when running `sail-all dev` (or `d` in the TUI). Plain `up` starts containers without Vite/Reverb.

**Buttons don't respond** — An action is already in-flight (check the header spinner). Wait for it to finish.

**Colors look wrong** — The TUI uses 24-bit hex colors. Ensure your terminal supports truecolor (`COLORTERM=truecolor`).
