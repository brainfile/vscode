import * as vscode from "vscode";

// Documentation for brainfile.md fields
const FIELD_DOCS: Record<string, { description: string; example?: string }> = {
  // Top-level fields
  title: {
    description: "The title of your brainfile board, displayed in the header.",
    example: "title: My Project Tasks",
  },
  schema: {
    description: "URL to the brainfile JSON schema for validation.",
    example: "schema: https://brainfile.md/v1.json",
  },
  agent: {
    description:
      "Configuration for AI agents working with this brainfile. Contains instructions for how agents should interact with tasks.",
  },
  instructions: {
    description:
      "List of rules for AI agents to follow when modifying this brainfile.",
    example: `instructions:
  - Modify only the YAML frontmatter
  - Use task-[number] format for task IDs`,
  },
  rules: {
    description:
      "Behavioral rules organized by category: always, never, prefer, and context.",
  },
  always: {
    description: "Rules that must always be followed.",
    example: `always:
  - id: 1
    rule: commit changes after each task`,
  },
  never: {
    description: "Rules that must never be violated.",
    example: `never:
  - id: 1
    rule: delete tasks without confirmation`,
  },
  prefer: {
    description: "Preferred behaviors when multiple options exist.",
    example: `prefer:
  - id: 1
    rule: simple solutions over complex ones`,
  },
  context: {
    description: "Contextual information about the project or workspace.",
    example: `context:
  - id: 1
    rule: this is a TypeScript monorepo`,
  },
  columns: {
    description:
      "List of kanban columns. Each column contains tasks and has an id, title, and order.",
    example: `columns:
  - id: todo
    title: To Do
    order: 1
    tasks: []`,
  },
  statsConfig: {
    description:
      "Configuration for which columns appear in the board statistics display.",
    example: `statsConfig:
  columns:
    - todo
    - in-progress
    - done`,
  },

  // Column fields
  id: {
    description:
      "Unique identifier for columns and tasks. Use kebab-case (e.g., task-1, in-progress).",
    example: "id: task-1",
  },
  order: {
    description: "Display order for columns. Lower numbers appear first.",
    example: "order: 1",
  },
  tasks: {
    description: "Array of tasks within a column.",
  },

  // Task fields
  description: {
    description:
      "Detailed description of the task. Supports markdown formatting.",
    example: `description: |
  Implement the new feature.

  ## Requirements
  - Must be responsive
  - Support dark mode`,
  },
  template: {
    description:
      "Task template type. Built-in templates: feature, bug, chore, docs, refactor, test.",
    example: "template: feature",
  },
  priority: {
    description:
      "Task priority level. Common values: critical, high, medium, low. Custom priorities are also supported.",
    example: "priority: high",
  },
  tags: {
    description: "Array of labels for categorizing tasks.",
    example: `tags:
  - frontend
  - urgent`,
  },
  assignee: {
    description: "Person assigned to the task.",
    example: "assignee: george",
  },
  relatedFiles: {
    description: "Array of file paths related to this task.",
    example: `relatedFiles:
  - src/components/Button.tsx
  - src/styles/button.css`,
  },
  subtasks: {
    description: "List of smaller tasks that make up this task.",
    example: `subtasks:
  - id: task-1-1
    title: Create component
    completed: false`,
  },
  completed: {
    description: "Whether a subtask is completed.",
    example: "completed: true",
  },
  rule: {
    description: "The text of a rule in the rules section.",
    example: 'rule: always write tests',
  },
};

export class BrainfileHoverProvider implements vscode.HoverProvider {
  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.Hover | null {
    // Only process brainfile.md files
    if (!document.fileName.endsWith("brainfile.md")) {
      return null;
    }

    const line = document.lineAt(position.line).text;

    // Check if we're in YAML frontmatter (between --- markers)
    if (!this.isInFrontmatter(document, position.line)) {
      return null;
    }

    // Extract the YAML key at the cursor position
    const key = this.extractYamlKey(line, position.character);
    if (!key) {
      return null;
    }

    const doc = FIELD_DOCS[key];
    if (!doc) {
      return null;
    }

    // Build markdown content
    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown(`**${key}**\n\n`);
    markdown.appendMarkdown(doc.description + "\n\n");

    if (doc.example) {
      markdown.appendMarkdown("**Example:**\n");
      markdown.appendCodeblock(doc.example, "yaml");
    }

    markdown.appendMarkdown(
      "\n\n[Brainfile Schema Documentation](https://brainfile.md)"
    );
    markdown.isTrusted = true;

    return new vscode.Hover(markdown);
  }

  private isInFrontmatter(
    document: vscode.TextDocument,
    lineNumber: number
  ): boolean {
    let frontmatterStart = -1;
    let frontmatterEnd = -1;

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i).text.trim();
      if (line === "---") {
        if (frontmatterStart === -1) {
          frontmatterStart = i;
        } else {
          frontmatterEnd = i;
          break;
        }
      }
    }

    return (
      frontmatterStart !== -1 &&
      frontmatterEnd !== -1 &&
      lineNumber > frontmatterStart &&
      lineNumber < frontmatterEnd
    );
  }

  private extractYamlKey(line: string, character: number): string | null {
    // Match YAML key pattern: "  key:" or "- key:" or just "key:"
    const keyMatch = line.match(/^\s*-?\s*([a-zA-Z_][a-zA-Z0-9_]*):/);
    if (keyMatch) {
      const key = keyMatch[1];
      // Check if cursor is on or near the key
      const keyStart = line.indexOf(key);
      const keyEnd = keyStart + key.length;
      if (character >= keyStart && character <= keyEnd + 1) {
        return key;
      }
    }

    // Also check for array item keys like "- id: value"
    const arrayKeyMatch = line.match(/^\s+-\s+([a-zA-Z_][a-zA-Z0-9_]*):/);
    if (arrayKeyMatch) {
      const key = arrayKeyMatch[1];
      const keyStart = line.indexOf(key);
      const keyEnd = keyStart + key.length;
      if (character >= keyStart && character <= keyEnd + 1) {
        return key;
      }
    }

    return null;
  }
}
