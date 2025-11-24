import * as vscode from "vscode";
import * as fs from "fs";
import { BrainfileParser, Board, Task, Column } from "@brainfile/core";
import { log } from "./extension";

export class BrainfileCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    // Only process brainfile.md files
    if (!document.fileName.endsWith("brainfile.md")) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];
    const content = document.getText();

    // Track lines that already have CodeLens to avoid duplicates
    const usedLines = new Set<number>();

    try {
      const board = BrainfileParser.parse(content);
      if (!board) {
        return [];
      }

      // Add frontmatter-level CodeLens (at line 0, the opening ---)
      codeLenses.push(
        new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          title: "$(preview) Open Board",
          command: "brainfile.codelens.openBoard",
          tooltip: "Open the Brainfile board view in sidebar",
        }),
        new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          title: "$(open-editors-view-icon) Open in Editor",
          command: "brainfile.openInEditor",
          tooltip: "Open the Brainfile board as an editor tab",
        }),
        new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          title: "$(check) Validate",
          command: "brainfile.codelens.validate",
          arguments: [document.uri],
          tooltip: "Validate the brainfile schema",
        }),
        new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          title: "$(wand) Lint & Sort",
          command: "brainfile.codelens.lintAndSort",
          arguments: [document.uri],
          tooltip: "Sort columns by order and fix lint issues",
        })
      );
      usedLines.add(0);

      // Find and add CodeLens for each column
      for (const column of board.columns) {
        const columnLocation = this.findColumnLocation(content, column.id);
        if (columnLocation !== null && !usedLines.has(columnLocation)) {
          usedLines.add(columnLocation);
          codeLenses.push(
            new vscode.CodeLens(new vscode.Range(columnLocation, 0, columnLocation, 0), {
              title: "$(add) Add Task",
              command: "brainfile.codelens.addTaskToColumn",
              arguments: [document.uri, column.id],
              tooltip: `Add a new task to "${column.title}"`,
            })
          );
        }

        // Add CodeLens for each task
        for (const task of column.tasks) {
          const taskLocation = this.findTaskStartLine(content, task.id);
          if (taskLocation !== null && !usedLines.has(taskLocation)) {
            usedLines.add(taskLocation);

            // Task actions - all on the same line
            codeLenses.push(
              new vscode.CodeLens(new vscode.Range(taskLocation, 0, taskLocation, 0), {
                title: "$(play) Send to Agent",
                command: "brainfile.codelens.sendToAgent",
                arguments: [document.uri, task.id, column.title, board.title],
                tooltip: "Send this task to an AI agent",
              }),
              new vscode.CodeLens(new vscode.Range(taskLocation, 0, taskLocation, 0), {
                title: "$(archive) Archive",
                command: "brainfile.codelens.archiveTask",
                arguments: [document.uri, column.id, task.id],
                tooltip: "Archive this task",
              }),
              new vscode.CodeLens(new vscode.Range(taskLocation, 0, taskLocation, 0), {
                title: "$(trash) Delete",
                command: "brainfile.codelens.deleteTask",
                arguments: [document.uri, column.id, task.id],
                tooltip: "Delete this task",
              }),
              new vscode.CodeLens(new vscode.Range(taskLocation, 0, taskLocation, 0), {
                title: "$(arrow-right) Move",
                command: "brainfile.codelens.moveTask",
                arguments: [document.uri, column.id, task.id, board.columns.map(c => ({ id: c.id, title: c.title }))],
                tooltip: "Move to another column",
              }),
              new vscode.CodeLens(new vscode.Range(taskLocation, 0, taskLocation, 0), {
                title: "$(tag) Priority",
                command: "brainfile.codelens.changePriority",
                arguments: [document.uri, task.id],
                tooltip: "Change task priority",
              })
            );
          }
        }
      }
    } catch (error) {
      log("Error providing CodeLenses:", error);
    }

    return codeLenses;
  }

  /**
   * Find the line where a task starts (the line with "- id: taskId")
   * This ensures we get the actual task start, not a property line
   */
  private findTaskStartLine(content: string, taskId: string): number | null {
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match "- id: task-XX" pattern (task array item start)
      if (line.match(new RegExp(`^\\s*-\\s+id:\\s*${taskId}\\s*$`))) {
        return i;
      }
    }

    return null;
  }

  private findColumnLocation(content: string, columnId: string): number | null {
    const lines = content.split("\n");
    let inColumns = false;
    let currentIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect columns section
      if (line.match(/^columns:\s*$/)) {
        inColumns = true;
        continue;
      }

      if (inColumns) {
        // Check for column id
        const idMatch = line.match(/^\s+-\s+id:\s*(.+)$/);
        if (idMatch && idMatch[1].trim() === columnId) {
          // Return the line with "- id:" which is the column start
          return i;
        }

        // Exit columns section if we hit another top-level key
        if (line.match(/^[a-zA-Z]/) && !line.startsWith(" ")) {
          break;
        }
      }
    }

    return null;
  }
}
