# Brainfile for VSCode

**A protocol-first task management system for AI-assisted development.**

Brainfile provides a visual kanban board interface for managing tasks defined in `brainfile.md` files using YAML frontmatter. Built on [@brainfile/core](https://www.npmjs.com/package/@brainfile/core) - the official Brainfile parser and serializer.

![Brainfile VSCode Extension](https://raw.githubusercontent.com/brainfile/vscode/main/icon.png)

## ✨ Features

- 📋 **Visual Kanban Board** - View and organize tasks in customizable columns
- 🎯 **Drag & Drop** - Intuitive task movement between columns
- 🔄 **Live Sync** - Automatic updates when editing markdown files
- 📝 **Task Templates** - Pre-built templates for bugs, features, and refactors
- ✅ **Progress Tracking** - Subtask completion and visual indicators
- 🎨 **Priority Levels** - Color-coded task priorities (low, medium, high, critical)
- 🏷️ **Tag Support** - Organize and filter tasks with tags
- 📏 **Project Rules** - Define always/never/prefer/context rules for your team
- 🤖 **AI-Friendly** - Designed for seamless AI agent integration

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

## 🎨 Creating Tasks from Templates

### Built-in Templates

**Bug Report** 🐛
- Pre-configured with high priority
- Includes reproduction steps structure
- Tags: bug, needs-triage

**Feature Request** ✨
- Pre-configured with medium priority  
- Includes use cases and acceptance criteria
- Tags: feature, enhancement

**Code Refactor** 🔧
- Pre-configured with low priority
- Includes analysis and testing plan
- Tags: refactor, technical-debt

### How to Use Templates

**Via Command Palette:**
1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type "Brainfile: Create Task from Template"
3. Select your template
4. Fill in the details
5. Choose the target column

**Via UI Button:**
- Click "New from Template" in the Brainfile sidebar
- Follow the prompts

## 🔧 Commands

- **Brainfile: Refresh** - Manually refresh the task board
- **Brainfile: Create Board** - Initialize a new brainfile.md
- **Brainfile: Add Task** - Quick task creation
- **Brainfile: Create Task from Template** - Create from built-in templates

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

## 🐛 Issues & Support

- **[Report Issues](https://github.com/brainfile/vscode/issues)** - Bug reports and feature requests
- **[Discussions](https://github.com/brainfile/protocol/discussions)** - Questions and community support
- **[Support](SUPPORT.md)** - Get help

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🌟 Contributing

Contributions are welcome! See the [Contributing Guide](https://github.com/brainfile/protocol/blob/main/CONTRIBUTING.md)

---

**Made with ❤️ by the Brainfile team**  
Website: [brainfile.md](https://brainfile.md) | GitHub: [@brainfile](https://github.com/brainfile)
