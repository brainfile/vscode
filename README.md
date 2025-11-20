# Brainfile

Task management protocol for AI-assisted development.

Built on [@brainfile/core](https://www.npmjs.com/package/@brainfile/core) - the official Brainfile parser and serializer.

## Features

- View and manage tasks from `brainfile.md` files
- Organize tasks in customizable columns
- Define project rules (always, never, prefer, context)
- Drag and drop tasks between columns
- Live updates when editing the markdown file
- Collapsible task sections
- Progress tracking
- **Task Templates**: Create tasks from predefined templates (Bug Report, Feature Request, Refactor)

## Usage

1. Create a `brainfile.md` file in your project root
2. Open the folder in VSCode
3. The Brainfile sidebar will appear automatically
4. View and manage your tasks

### Creating Tasks from Templates

Brainfile includes built-in task templates to help you quickly create structured tasks:

1. **Using the Command Palette**:
   - Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Search for "Brainfile: Create Task from Template"
   - Select a template (Bug Report, Feature Request, or Refactor)
   - Fill in the required variables
   - Select the column for the new task

2. **Using the UI Button**:
   - Click the "New from Template" button in the Brainfile sidebar
   - Follow the prompts to create a task

3. **Available Templates**:
   - **Bug Report**: For tracking bugs with reproduction steps, expected/actual behavior
   - **Feature Request**: For proposing new features with use cases and acceptance criteria
   - **Code Refactor**: For refactoring tasks with scope, motivation, and testing plan

Each template automatically includes:
- Pre-configured priority level
- Relevant tags
- Structured description with markdown formatting
- Related subtasks for tracking implementation steps
- Template type field for categorization

## File Format

Tasks are defined in YAML frontmatter:

```yaml
---
title: My Project
rules:
  always:
    - id: 1
      rule: write tests for all new features
  never:
    - id: 1
      rule: commit directly to main branch
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Task Title
        description: Task description
---
```

## Related Tools

- **[@brainfile/core](https://www.npmjs.com/package/@brainfile/core)** - Core parsing and serialization library
- **[@brainfile/cli](https://www.npmjs.com/package/@brainfile/cli)** - Command-line interface for Brainfile
- **[Protocol Documentation](https://brainfile.md)** - Full Brainfile protocol specification

## License

MIT
