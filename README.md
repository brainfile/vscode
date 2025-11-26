# Brainfile for VSCode

**A protocol-first task management system for AI-assisted development.**

Brainfile provides a visual kanban board interface for managing tasks defined in `brainfile.md` files using YAML frontmatter. Built on [@brainfile/core](https://www.npmjs.com/package/@brainfile/core) - the official Brainfile parser and serializer.

<p align="center">
  <img src="https://raw.githubusercontent.com/brainfile/vscode/main/icon.png" alt="Brainfile Logo" width="128" height="128">
</p>

## ✨ Features

- 📋 **Visual Kanban Board** - View and organize tasks in customizable columns
- 🎯 **Drag & Drop** - Intuitive task movement between columns
- 🔄 **Live Sync** - Automatic updates when editing markdown files
- 📝 **Task Templates** - Pre-built templates for bugs, features, and refactors
- ✅ **Progress Tracking** - Subtask completion and visual indicators
- 🎨 **Priority Levels** - Color-coded task priorities (low, medium, high, critical)
- 🏷️ **Tag Support** - Organize and filter tasks with tags
- 📏 **Project Rules** - Define always/never/prefer/context rules with inline editing
- 📦 **Archive Management** - Search, restore, or permanently delete archived tasks
- 🔢 **Bulk Operations** - Multi-select tasks for batch move, archive, delete, or priority changes
- 🤖 **AI-Friendly** - Designed for seamless AI agent integration with send-to-agent support

## 🚀 Quick Start

1. **Install the extension** from the VSCode Marketplace
2. **Create a `brainfile.md` file** in your project root
3. **Open the folder** in VSCode - the Brainfile sidebar appears automatically
4. **Start managing tasks** with the visual board

## 📝 Example brainfile.md

```yaml
---
schema: https://brainfile.md/v1
title: My Project
agent:
  instructions:
    - Modify only the YAML frontmatter
    - Preserve all IDs
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Implement user authentication
        priority: high
        tags: [backend, security]
  - id: in-progress
    title: In Progress
    tasks: []
  - id: done
    title: Done
    tasks: []
---

# My Project Tasks

This is your task board.
```

## 🎨 Smart Autocomplete with Built-in Templates

Brainfile provides intelligent IntelliSense autocomplete when editing `brainfile.md` files. No need for buttons or commands - just start typing!

### Built-in Templates

When adding a new task in the `tasks:` array, trigger autocomplete to insert full task templates:

**🐛 Bug Report**
- High priority
- Includes reproduction steps structure
- Tags: bug, needs-triage

**✨ Feature Request**
- Medium priority  
- Includes use cases and acceptance criteria
- Tags: feature, enhancement

**🔧 Code Refactor**
- Low priority
- Includes analysis and testing plan
- Tags: refactor, technical-debt

### How to Use Templates

**While editing brainfile.md:**
1. Navigate to a `tasks:` array in your YAML frontmatter
2. Press `Ctrl+Space` (or your autocomplete trigger key)
3. Select a template from the completion list (🐛 Bug Report, ✨ Feature Request, or 🔧 Code Refactor)
4. Fill in the placeholder values using Tab to navigate

### Smart Field Completions

Autocomplete also suggests:
- **Field names**: `title`, `description`, `priority`, `tags`, `status`, etc.
- **Priority values**: `critical`, `high`, `medium`, `low`
- **Status values**: `todo`, `in-progress`, `done`, `blocked`
- **Common fields** with snippets for quick navigation

## 🔧 Commands

- **Brainfile: Refresh** - Manually refresh the task board
- **Brainfile: Create Board** - Initialize a new brainfile.md
- **Brainfile: Add Task** - Quick task creation

## ⌨️ Keyboard Shortcuts

- `Ctrl+Shift+T` / `Cmd+Shift+T` - Add new task (when board is active)

## 🔗 Ecosystem

The Brainfile extension is part of a complete task management ecosystem:

- **[Documentation](https://brainfile.md)** - Complete protocol specification and guides
- **[@brainfile/core](https://www.npmjs.com/package/@brainfile/core)** - Core TypeScript/JavaScript library
- **[@brainfile/cli](https://www.npmjs.com/package/@brainfile/cli)** - Command-line interface
- **[Protocol](https://github.com/brainfile/protocol)** - Schema and specification

## 🤝 Integration with Other Tools

**CLI Tool:**
```bash
# Install globally
npm install -g @brainfile/cli

# Add tasks from terminal
brainfile add --title "Fix login bug" --priority high

# Changes sync automatically with VSCode
```

**AI Agents:**  
Brainfile is designed for AI agent compatibility. The extension respects agent instructions in your brainfile.md:

```yaml
agent:
  instructions:
    - Modify only the YAML frontmatter
    - Preserve all IDs
    - Keep ordering
```

Learn more: [AI Agent Integration Guide](https://brainfile.md/agents/integration/)

## 📚 Documentation

- **[Getting Started](https://brainfile.md/getting-started/quick-start/)** - Comprehensive quick start guide
- **[Protocol Specification](https://brainfile.md/protocol/specification/)** - Complete file format documentation
- **[VSCode Extension Guide](https://brainfile.md/vscode/extension/)** - Detailed usage instructions
- **[Templates](https://brainfile.md/core/templates/)** - Learn about task templates

## 🛠️ Development & Architecture

- **Vue + Vite Webview**: The board UI lives in `webview-ui/` (Vue 3 + Pinia + Vite). The build outputs hashed assets into `media/webview` that the extension loads via a CSP-safe manifest.
- **Backend / Frontend Split**: `src/boardViewProvider.ts` now only boots the webview, streams board updates, and relays messages. All rendering happens inside the Vue app.
- **Build commands**: `npm run webview:build` (webview bundle), `npm run compile` (webview build + esbuild backend), `npm run package` (production build for vsix). Scripts automatically pull types from `@brainfile/core`.
- **Message contract**: Webview sends `webviewReady` before receiving `boardUpdate`/`agentsDetected`. Priority colors from VS Code settings are injected via `priorityStyles` in `boardUpdate`.
- **Source packaging**: `webview-ui` sources are excluded from the vsix; only the built assets in `media/webview` ship with the extension.

## 🐛 Issues & Support

- **[Report Issues](https://github.com/brainfile/vscode/issues)** - Bug reports and feature requests
- **[Discussions](https://github.com/brainfile/protocol/discussions)** - Questions and community support
- **[Support](SUPPORT.md)** - Get help

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🛠️ Development

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
cd vscode
npm install
npm run compile
```

### Testing

```bash
npm test          # Run all 230 tests
npm run compile   # TypeScript check + esbuild
```

### Architecture

The extension uses a modular architecture under `src/board/`:

| Module | Purpose |
|--------|---------|
| `types.ts` | Type definitions, guards, constants |
| `messages.ts` | Webview message validation |
| `html/` | HTML generation (utils, styles, stats, error) |
| `agents/` | AI prompt builder for copilot/cursor/claude |
| `data/` | Pure board operations (immutable) |
| `handlers/` | Message router dispatch |
| `orchestrator.ts` | File I/O coordination |

All board operations are pure functions with immutable updates, making them easily testable without VS Code runtime.

## 🌟 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

---

**Made with ❤️ by the Brainfile team**
Website: [brainfile.md](https://brainfile.md) | GitHub: [@brainfile](https://github.com/brainfile)
