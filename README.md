# CodeGrid — Terminal workspace for AI coding agents

A dense, 2D canvas for running dozens of Claude Code sessions simultaneously. macOS.

![CodeGrid](https://img.shields.io/badge/CodeGrid-v0.1.0-ff8c00)
![macOS](https://img.shields.io/badge/macOS-Apple_Silicon-000000)

## Download

**[→ Download the latest release](https://github.com/isaachorowitz/CodeGrid-Claude-Code-Terminal/releases/latest)**

Signed and notarized by Apple — double-click to install, no security warnings.

> Requires macOS 13+ on Apple Silicon (M1/M2/M3/M4).

---

## What is CodeGrid?

CodeGrid is a **terminal workspace manager for AI coding agents**. Unlike traditional terminal multiplexers that use split panes or tabs, CodeGrid provides a **free-form 2D grid** where you can tile 4, 9, 16+ terminal instances in any arrangement.

Built for people running Claude Code in parallel across multiple projects.

### Key Features

- **True 2D Grid Layout** — Drag, resize, and arrange terminal panes in any configuration. Not split panes, not tabs.
- **Broadcast Mode** — Type once, send to all panes simultaneously. Run `/review` across 5 projects at once.
- **Git Worktree Isolation** — Multiple agents on the same repo without conflicts. Auto-creates worktrees per session.
- **Full Git Manager** — Stage files, commit, push/pull, create/switch branches — all without leaving the app.
- **MCP Server Management** — Add, toggle, and remove Claude MCP servers from the sidebar.
- **GitHub Integration** — Auth via device flow, search repos, clone in one click.
- **Command Palette** — `Cmd+K` for fuzzy-search across all actions, layouts, and sessions.
- **Workspace System** — Save and restore named collections of sessions with their grid layouts.
- **Keyboard-First Navigation** — `Cmd+Arrow` to navigate, `Cmd+1-9` to jump, `Cmd+Enter` to maximize.
- **Mac-Native Performance** — Built with Tauri v2 (~10MB), not Electron (~200MB).

---

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
- **3x3** — Nine panes (the dense grid look)
- **1+2** — One large left, two stacked right
- **1+3** — One large top, three small bottom

---

## License

14-day free trial, up to 9 panes. Licensed tier unlocks unlimited panes.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript |
| Terminal | xterm.js 5 (WebGL) |
| State | Zustand 5 |
| Styling | Tailwind CSS v4 |
| PTY | portable-pty 0.8 |
| Database | SQLite (rusqlite) |

---

## Building from Source

### Prerequisites

```bash
# Xcode Command Line Tools
xcode-select --install

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node.js 22+
fnm install 22  # or: nvm install 22

# Claude Code
npm install -g @anthropic-ai/claude-code
```

### Development

```bash
npm install
npm run tauri dev
```

### Production Build

```bash
npm run tauri build -- --target aarch64-apple-darwin
```

---

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
