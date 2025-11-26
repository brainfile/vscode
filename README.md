# Brainfile for VSCode

**Visual kanban board for brainfile.md files.**

The Brainfile VSCode extension brings your task board into the editor. View, organize, and manage tasks without leaving your development environment. Built on [@brainfile/core](https://www.npmjs.com/package/@brainfile/core).

<p align="center">
  <img src="https://raw.githubusercontent.com/brainfile/vscode/main/icon.png" alt="Brainfile Logo" width="128" height="128">
</p>

## What is Brainfile?

Brainfile is a protocol for task management that lives in your repo. A single `brainfile.md` file contains your entire kanban board as structured YAML frontmatter. AI assistants can read and update it directly via MCP. No external database. No SaaS dependency.

This extension is one of several interfaces:

| Tool | Purpose |
|------|---------|
| **VSCode Extension** | Visual kanban board in the sidebar |
| [@brainfile/cli](https://www.npmjs.com/package/@brainfile/cli) | Terminal TUI and CLI commands |
| MCP Server | AI assistants manage tasks directly |
| [@brainfile/core](https://www.npmjs.com/package/@brainfile/core) | TypeScript library for building tools |

Learn more at [brainfile.md](https://brainfile.md)

## Features

| Feature | Description |
|---------|-------------|
| **Visual Board** | Drag-and-drop kanban columns and tasks |
| **Live Sync** | Edits to brainfile.md reflect immediately |
| **Bulk Operations** | Multi-select tasks for batch actions |
| **Archive** | Archive, restore, or permanently delete tasks |
| **Rules Panel** | View and edit project rules inline |
| **Send to Agent** | Dispatch tasks to Copilot or Claude Code |
| **Templates** | Create tasks from bug, feature, or refactor templates |

## Quick Start

1. Install the extension from the VSCode Marketplace
2. Create a `brainfile.md` in your project root
3. Open the folder — the Brainfile sidebar appears automatically

Or initialize via CLI:

```bash
npm install -g @brainfile/cli
brainfile init
```

## File Format

Tasks are defined in YAML frontmatter:

```yaml
---
title: My Project
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Implement authentication
        priority: high
        tags: [backend, security]
  - id: in-progress
    title: In Progress
    tasks: []
  - id: done
    title: Done
    tasks: []
rules:
  always:
    - id: 1
      rule: write tests for new features
  never:
    - id: 1
      rule: commit directly to main
---
```

The markdown body below the frontmatter is preserved and can contain notes, documentation, or anything else.

## AI Integration

The extension includes a **Send to Agent** feature. Click the play button on any task to dispatch it to:

- **GitHub Copilot** — Opens in Copilot Chat
- **Claude Code** — Opens in Claude Code extension
- **Clipboard** — Copy for any other assistant

For deeper integration, add the MCP server to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "brainfile": {
      "command": "npx",
      "args": ["@brainfile/cli", "mcp"]
    }
  }
}
```

Now Claude Code, Cursor, or any MCP-compatible assistant can manage your tasks directly — listing, creating, moving, and updating without manual syncing.

## Commands

- **Brainfile: Refresh** — Manually refresh the board
- **Brainfile: Create Board** — Initialize a new brainfile.md
- **Brainfile: Add Task** — Quick task creation
- **Brainfile: Create Task from Template** — Bug, feature, or refactor template

## Archive

Archived tasks are stored in a separate `brainfile-archive.md` file in the same directory as your board. The Archive tab lets you:

- Search archived tasks by title, description, or ID
- Restore tasks to any column
- Permanently delete tasks

## Development

```bash
cd vscode
npm install
npm run compile
npm test
```

The extension uses a modular architecture:

| Module | Purpose |
|--------|---------|
| `src/boardViewProvider.ts` | Sidebar webview provider |
| `src/boardEditorPanel.ts` | Tab editor panel |
| `webview-ui/` | Vue 3 + Pinia frontend |
| `src/board/` | Pure operations and message handling |

The webview is built with Vite and outputs to `media/webview/`. All board operations are pure functions for testability.

## Links

- **Documentation**: [brainfile.md](https://brainfile.md)
- **GitHub**: [github.com/brainfile](https://github.com/brainfile)
- **Issues**: [github.com/brainfile/vscode/issues](https://github.com/brainfile/vscode/issues)
- **CLI**: [@brainfile/cli](https://www.npmjs.com/package/@brainfile/cli)
- **Core**: [@brainfile/core](https://www.npmjs.com/package/@brainfile/core)

## License

MIT
