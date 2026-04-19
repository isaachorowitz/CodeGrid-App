<div align="center">

<img src="icons/icon.png" alt="CodeGrid" width="96" />

# CodeGrid

**The terminal workspace for AI coding agents.**

Run dozens of Claude Code sessions across all your projects — organized on a free-form 2D canvas you can drag, resize, and broadcast to.

[![Download](https://img.shields.io/github/v/release/isaachorowitz/CodeGrid-App?label=Download&color=ff8c00&style=for-the-badge)](https://github.com/isaachorowitz/CodeGrid-App/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-brightgreen.svg?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/macOS-Apple_Silicon-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/isaachorowitz/CodeGrid-App/releases/latest)
[![Built with Tauri](https://img.shields.io/badge/Tauri-v2-24C8D8?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app)

[**Download for macOS →**](https://github.com/isaachorowitz/CodeGrid-App/releases/latest) · [Website](https://codegrid.app) · [Built by ZipLyne](https://ziplyne.agency)

</div>

---

## The Problem

If you're running Claude Code seriously, you're juggling multiple repos at once. Terminal tabs and tmux panes don't scale — you lose track of which agent is waiting, which one errored, and which one needs your input.

## The Solution

CodeGrid gives every session its own pane on a **single infinite 2D canvas**. See everything at once. Type once and broadcast to all of them. Never miss a prompt again.

**~10 MB.** Built with Tauri — launches in under a second. Not Electron.

---

## Features

### 🗂 2D Canvas Layout
Arrange terminal panes freely — drag to reposition, resize from any edge, zoom in and out, pan around. Canvas has momentum physics so it feels smooth and natural. Not tabs. Not splits. An actual canvas.

### 📡 Broadcast Mode
`Cmd+B` — type once, send to every terminal simultaneously. Run the same Claude command across all your projects in one keystroke.

### 👁 Activity Detection
Status indicators on every pane (running / waiting / idle / error), visible even when zoomed out. You know what every agent is doing at a glance.

### 💾 Session Persistence
Close the app, reopen it — sessions come back exactly where you left them. Same directories, same layout, same names.

### 🌿 Full Git Manager
Stage, commit, push, pull, branch, stash, and view diffs — all from the sidebar. No context switching.

### 🗃 File Explorer
Browse files with git status indicators. Create, rename, move, delete, drag-and-drop. Right-click context menu.

### ✏️ Code Editor
Click any file to open it in the built-in editor with syntax highlighting. Always editable.

### 🕸 Dependency Graph
Interactive force-directed graph showing how your files connect. Supports TypeScript, JavaScript, Python, and Rust.

### ⌨️ Command Palette
`Cmd+K` — switch workspaces, open folders, focus sessions, run git commands. Everything in one search box.

### 🗄 Multiple Workspaces
Separate workspaces per project. Each has its own layout, sessions, and git context. Auto-named after the folder.

### 🔌 MCP Server Manager
Add, toggle, and configure Claude MCP servers from the sidebar. No config files to edit manually.

### 🔗 External Control API
Control CodeGrid from scripts, Alfred workflows, or IDE extensions via a local Unix socket.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+N` | New session |
| `Cmd+W` | Close session |
| `Cmd+K` | Command palette |
| `Cmd+B` | Broadcast to all |
| `Cmd+Enter` | Maximize / restore pane |
| `Cmd+1–9` | Jump to pane |
| `Cmd+Arrow` | Navigate between panes |
| `Cmd+S` | Toggle sidebar |
| `Cmd+Tab` | Switch workspace |
| `Cmd+Shift+N` | New workspace |
| `Cmd+F` | Search in terminal |
| `Cmd+,` | Settings |

---

## Requirements

- macOS 13 Ventura or later
- Apple Silicon (M1 / M2 / M3 / M4)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed

---

## Building from Source

```bash
# Install prerequisites
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
fnm install 22   # or: nvm install 22

# Clone and run
git clone https://github.com/isaachorowitz/CodeGrid-App.git
cd CodeGrid-App
npm install
npm run tauri dev
```

### Production build

```bash
npm run tauri build -- --target aarch64-apple-darwin
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript |
| Terminal renderer | xterm.js 5 (WebGL) |
| State management | Zustand 5 |
| Styling | Tailwind CSS v4 |
| PTY | portable-pty |
| Local database | SQLite (rusqlite) |

---

## Architecture

```
Tauri (Rust)                    Webview (React)
├── PTY Manager          <IPC>  ├── Canvas Layout Engine
├── Process Pool         <───>  ├── xterm.js Instances
├── Session Store                ├── Workspace Manager
├── SQLite DB                    ├── Status Indicators
├── Shell Detector               ├── Command Palette
└── Worktree Manager             └── Keyboard Nav Layer
```

---

## License

MIT — free to use, fork, and build on.

---

<div align="center">

Built with ♥ by [ZipLyne Agency](https://ziplyne.agency)

</div>
