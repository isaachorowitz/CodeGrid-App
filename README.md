# GridCode — Bloomberg Terminal for Claude Code

A dense, information-rich terminal multiplexer designed for power users running multiple Claude Code sessions simultaneously.

![GridCode](https://img.shields.io/badge/GridCode-v0.1.0-ff8c00)

## What is GridCode?

GridCode is the **Bloomberg Terminal for AI coding agents**. Unlike traditional terminal multiplexers that use split panes or tabs, GridCode provides a **free-form 2D grid** where you can tile 4, 9, 16+ terminal instances in any arrangement.

### Key Features

- **True 2D Grid Layout** — Drag, resize, and arrange terminal panes in any configuration. Not split panes, not tabs. A real grid.
- **Bloomberg Dark Aesthetic** — Dense, dark, orange accents. Monospace everything. No rounded corners. No wasted space.
- **Broadcast Mode** — Type once, send to all panes simultaneously. Run `/review` across 5 projects at once.
- **Git Worktree Isolation** — Multiple agents on the same repo without conflicts. Auto-creates worktrees for concurrent sessions.
- **Command Palette** — `Cmd+K` for fuzzy-search across all actions, layouts, and sessions.
- **Workspace System** — Save and restore collections of sessions with their grid layouts.
- **Keyboard-First Navigation** — `Cmd+Arrow` to navigate, `Cmd+1-9` to jump, `Cmd+Enter` to maximize.
- **Mac-Native Performance** — Built with Tauri v2 (~10MB), not Electron (~200MB).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript |
| Terminal | xterm.js 5 (WebGL) |
| Grid | react-grid-layout |
| State | Zustand 5 |
| Styling | Tailwind CSS v4 |
| PTY | portable-pty 0.8 |
| Database | SQLite (rusqlite) |

## Prerequisites

```bash
# Xcode Command Line Tools (macOS)
xcode-select --install

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node.js 22+
fnm install 22  # or nvm install 22

# Claude Code
npm install -g @anthropic-ai/claude-code
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+N` | New pane |
| `Cmd+W` | Close focused pane |
| `Cmd+Arrow` | Navigate between panes |
| `Cmd+Shift+Arrow` | Swap pane positions |
| `Cmd+Enter` | Maximize / restore pane |
| `Cmd+K` | Command palette |
| `Cmd+1-9` | Jump to pane by number |
| `Cmd+B` | Toggle broadcast mode |
| `Cmd+S` | Toggle sidebar |
| `Cmd+Tab` | Cycle workspaces |
| `Cmd+Shift+N` | New workspace |
| `Cmd+,` | Settings |

## Layout Presets

- **1x1** — Single focused pane
- **2x2** — Four equal quadrants
- **3x3** — Nine panes (the Bloomberg look)
- **1+2** — One large left, two stacked right
- **1+3** — One large top, three small bottom

## Architecture

```
Tauri (Rust)                    Webview (React)
├── PTY Manager          <IPC>  ├── Grid Layout Engine
├── Process Pool         <───>  ├── xterm.js Instances
├── Session Store                ├── Workspace Manager
├── SQLite DB                    ├── Status Bars
├── Shell Detector               ├── Command Palette
└── Worktree Manager             └── Keyboard Nav Layer
```

## License

MIT
