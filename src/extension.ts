import * as vscode from 'vscode';
import * as fs from 'fs';
import { BoardViewProvider } from './boardViewProvider';
import { BoardEditorPanel, BoardEditorPanelSerializer } from './boardEditorPanel';
import { BrainfileCompletionProvider } from './completionProvider';
import { BrainfileCodeLensProvider } from './codeLensProvider';
import { BrainfileHoverProvider } from './hoverProvider';
import { BrainfileDecorationProvider } from './fileDecorationProvider';
import { BrainfileParser, BrainfileSerializer, BrainfileLinter } from '@brainfile/core';
import { buildAgentPrompt } from './board';

const LOG_PREFIX = '[Brainfile]';
let outputChannel: vscode.OutputChannel | undefined;

export function log(...args: any[]) {
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ');

  console.log(LOG_PREFIX, ...args);

  if (outputChannel) {
    outputChannel.appendLine(`${new Date().toISOString()} ${message}`);
  }
}

export function activate(context: vscode.ExtensionContext) {
  // Create output channel for logging
  outputChannel = vscode.window.createOutputChannel('Brainfile');
  context.subscriptions.push(outputChannel);

  log('Extension activated');

  try {
    // Register the tasks view provider
    const provider = new BoardViewProvider(context.extensionUri, context);

    // Register webview provider with proper options
    const webviewDisposable = vscode.window.registerWebviewViewProvider(
      BoardViewProvider.viewType,
      provider,
      {
        // Ensure webview content is retained when hidden
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    );
    context.subscriptions.push(webviewDisposable);

    // Add provider to subscriptions for proper disposal
    context.subscriptions.push(provider as any);

    // Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand('brainfile.refresh', () => {
        log('Refreshing tasks');
        provider.refresh();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('brainfile.createBoard', () => {
        log('Creating new Brainfile board');
        provider.createBoard();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('brainfile.addTask', () => {
        log('Quick adding task');
        provider.quickAddTask();
      })
    );

    // Register "Open in Editor Tab" command
    context.subscriptions.push(
      vscode.commands.registerCommand('brainfile.openInEditor', () => {
        log('Opening board in editor tab');
        BoardEditorPanel.createOrShow(context.extensionUri, context);
      })
    );

    // Register serializer for editor panel persistence across restarts
    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer(
        BoardEditorPanel.viewType,
        new BoardEditorPanelSerializer(context.extensionUri, context)
      )
    );

    // Register completion provider for brainfile.md files
    const completionProvider = new BrainfileCompletionProvider();
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        { pattern: '**/*brainfile.md', scheme: 'file' },
        completionProvider,
        ' ', // Trigger on space
        ':', // Trigger on colon
        '-'  // Trigger on dash (for arrays)
      )
    );
    log('Completion provider registered');

    // Register CodeLens provider if enabled
    const config = vscode.workspace.getConfiguration('brainfile');
    if (config.get('enableCodeLens', true)) {
      const codeLensProvider = new BrainfileCodeLensProvider();
      context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
          { pattern: '**/*brainfile.md', scheme: 'file' },
          codeLensProvider
        )
      );
      log('CodeLens provider registered');

      // Register CodeLens commands
      registerCodeLensCommands(context, provider);
    }

    // Register Hover provider
    const hoverProvider = new BrainfileHoverProvider();
    context.subscriptions.push(
      vscode.languages.registerHoverProvider(
        { pattern: '**/*brainfile.md', scheme: 'file' },
        hoverProvider
      )
    );
    log('Hover provider registered');

    // Register File Decoration provider
    const decorationProvider = new BrainfileDecorationProvider();
    context.subscriptions.push(
      vscode.window.registerFileDecorationProvider(decorationProvider)
    );
    context.subscriptions.push(decorationProvider);
    log('File decoration provider registered');

    // Set context for keybinding
    vscode.commands.executeCommand('setContext', 'brainfile.boardActive', true);

    log('All providers and commands registered');
  } catch (error) {
    log('Error activating extension:', error);
    vscode.window.showErrorMessage('Failed to activate Brainfile extension');
  }
}

/**
 * Write content to file and update the editor if the document is open
 */
async function writeAndRefreshDocument(uri: vscode.Uri, content: string): Promise<void> {
  // Write to file system
  fs.writeFileSync(uri.fsPath, content);

  // If the document is open in an editor, update it
  const openDoc = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === uri.fsPath);
  if (openDoc) {
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      openDoc.positionAt(0),
      openDoc.positionAt(openDoc.getText().length)
    );
    edit.replace(uri, fullRange, content);
    await vscode.workspace.applyEdit(edit);
  }
}

function registerCodeLensCommands(
  context: vscode.ExtensionContext,
  boardProvider: BoardViewProvider
) {
  // Open Board command
  context.subscriptions.push(
    vscode.commands.registerCommand('brainfile.codelens.openBoard', () => {
      vscode.commands.executeCommand('brainfile.tasksView.focus');
    })
  );

  // Validate command
  context.subscriptions.push(
    vscode.commands.registerCommand('brainfile.codelens.validate', async (uri: vscode.Uri) => {
      try {
        const content = fs.readFileSync(uri.fsPath, 'utf8');
        const board = BrainfileParser.parse(content);
        if (board) {
          vscode.window.showInformationMessage('Brainfile is valid!');
        } else {
          vscode.window.showErrorMessage('Brainfile has validation errors.');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Validation failed: ${error}`);
      }
    })
  );

  // Add Task to Column command
  context.subscriptions.push(
    vscode.commands.registerCommand('brainfile.codelens.addTaskToColumn', async (uri: vscode.Uri, columnId: string) => {
      const title = await vscode.window.showInputBox({
        prompt: 'Enter task title',
        placeHolder: 'New task title...'
      });
      if (!title) return;

      try {
        const content = fs.readFileSync(uri.fsPath, 'utf8');
        const board = BrainfileParser.parse(content);
        if (!board) return;

        const column = board.columns.find(c => c.id === columnId);
        if (!column) return;

        // Generate new task ID
        const allTaskIds = board.columns.flatMap(c => c.tasks.map(t => t.id));
        const maxNum = Math.max(0, ...allTaskIds.map(id => {
          const match = id.match(/task-(\d+)/);
          return match ? parseInt(match[1]) : 0;
        }));
        const newId = `task-${maxNum + 1}`;

        column.tasks.push({
          id: newId,
          title,
          description: '',
          priority: 'medium',
          tags: [],
        });

        const newContent = BrainfileSerializer.serialize(board);
        await writeAndRefreshDocument(uri, newContent);
        boardProvider.refresh();
        vscode.window.showInformationMessage(`Task "${title}" added to ${column.title}`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to add task: ${error}`);
      }
    })
  );

  // Archive Task command
  context.subscriptions.push(
    vscode.commands.registerCommand('brainfile.codelens.archiveTask', async (uri: vscode.Uri, columnId: string, taskId: string) => {
      const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
        placeHolder: `Archive task ${taskId}?`
      });
      if (confirm !== 'Yes') return;

      try {
        const content = fs.readFileSync(uri.fsPath, 'utf8');
        const board = BrainfileParser.parse(content);
        if (!board) return;

        const column = board.columns.find(c => c.id === columnId);
        if (!column) return;

        const taskIndex = column.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;

        const [task] = column.tasks.splice(taskIndex, 1);
        if (!board.archive) board.archive = [];
        board.archive.push(task);

        const newContent = BrainfileSerializer.serialize(board);
        await writeAndRefreshDocument(uri, newContent);
        boardProvider.refresh();
        vscode.window.showInformationMessage(`Task "${task.title}" archived`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to archive task: ${error}`);
      }
    })
  );

  // Delete Task command
  context.subscriptions.push(
    vscode.commands.registerCommand('brainfile.codelens.deleteTask', async (uri: vscode.Uri, columnId: string, taskId: string) => {
      const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
        placeHolder: `Delete task ${taskId}? This cannot be undone.`
      });
      if (confirm !== 'Yes') return;

      try {
        const content = fs.readFileSync(uri.fsPath, 'utf8');
        const board = BrainfileParser.parse(content);
        if (!board) return;

        const column = board.columns.find(c => c.id === columnId);
        if (!column) return;

        const taskIndex = column.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;

        const [task] = column.tasks.splice(taskIndex, 1);
        const newContent = BrainfileSerializer.serialize(board);
        await writeAndRefreshDocument(uri, newContent);
        boardProvider.refresh();
        vscode.window.showInformationMessage(`Task "${task.title}" deleted`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to delete task: ${error}`);
      }
    })
  );

  // Move Task command
  context.subscriptions.push(
    vscode.commands.registerCommand('brainfile.codelens.moveTask', async (
      uri: vscode.Uri,
      fromColumnId: string,
      taskId: string,
      columns: { id: string; title: string }[]
    ) => {
      const targetColumn = await vscode.window.showQuickPick(
        columns.filter(c => c.id !== fromColumnId).map(c => ({
          label: c.title,
          description: c.id,
          columnId: c.id
        })),
        { placeHolder: 'Move to which column?' }
      );
      if (!targetColumn) return;

      try {
        const content = fs.readFileSync(uri.fsPath, 'utf8');
        const board = BrainfileParser.parse(content);
        if (!board) return;

        const fromColumn = board.columns.find(c => c.id === fromColumnId);
        const toColumn = board.columns.find(c => c.id === targetColumn.columnId);
        if (!fromColumn || !toColumn) return;

        const taskIndex = fromColumn.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;

        const [task] = fromColumn.tasks.splice(taskIndex, 1);
        toColumn.tasks.push(task);

        const newContent = BrainfileSerializer.serialize(board);
        await writeAndRefreshDocument(uri, newContent);
        boardProvider.refresh();
        vscode.window.showInformationMessage(`Task moved to ${toColumn.title}`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to move task: ${error}`);
      }
    })
  );

  // Change Priority command
  context.subscriptions.push(
    vscode.commands.registerCommand('brainfile.codelens.changePriority', async (uri: vscode.Uri, taskId: string) => {
      const priorities = ['critical', 'high', 'medium', 'low'];
      const selected = await vscode.window.showQuickPick(priorities, {
        placeHolder: 'Select new priority'
      });
      if (!selected) return;

      try {
        const content = fs.readFileSync(uri.fsPath, 'utf8');
        const board = BrainfileParser.parse(content);
        if (!board) return;

        for (const column of board.columns) {
          const task = column.tasks.find(t => t.id === taskId);
          if (task) {
            task.priority = selected as 'critical' | 'high' | 'medium' | 'low';
            const newContent = BrainfileSerializer.serialize(board);
            await writeAndRefreshDocument(uri, newContent);
            boardProvider.refresh();
            vscode.window.showInformationMessage(`Priority changed to ${selected}`);
            return;
          }
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to change priority: ${error}`);
      }
    })
  );

  // Send to Agent command
  context.subscriptions.push(
    vscode.commands.registerCommand('brainfile.codelens.sendToAgent', async (
      uri: vscode.Uri,
      taskId: string,
      columnTitle: string,
      boardTitle: string
    ) => {
      try {
        const content = fs.readFileSync(uri.fsPath, 'utf8');
        const board = BrainfileParser.parse(content);
        if (!board) return;

        // Find the task
        let targetTask = null;
        for (const column of board.columns) {
          const task = column.tasks.find(t => t.id === taskId);
          if (task) {
            targetTask = task;
            break;
          }
        }

        if (!targetTask) {
          vscode.window.showErrorMessage(`Task ${taskId} not found`);
          return;
        }

        // Build the prompt
        const prompt = buildAgentPrompt({
          boardTitle,
          columnTitle,
          task: targetTask,
        });

        // Show quick pick to choose agent
        const agents = [
          { label: '$(comment-discussion) Copilot', description: 'Send to GitHub Copilot Chat', agent: 'copilot' },
          { label: '$(terminal) Cursor', description: 'Send to Cursor AI', agent: 'cursor' },
          { label: '$(hubot) Claude Code', description: 'Send to Claude Code terminal', agent: 'claude-code' },
          { label: '$(clippy) Copy Prompt', description: 'Copy to clipboard', agent: 'copy' },
        ];

        const selected = await vscode.window.showQuickPick(agents, {
          placeHolder: 'Choose where to send the task'
        });

        if (!selected) return;

        // Send to the selected agent
        switch (selected.agent) {
          case 'copilot':
          case 'cursor':
            try {
              await vscode.commands.executeCommand('workbench.action.chat.newChat');
              await new Promise(resolve => setTimeout(resolve, 100));
              await vscode.commands.executeCommand('workbench.action.chat.open', prompt);
            } catch (err) {
              await vscode.env.clipboard.writeText(prompt);
              vscode.window.showInformationMessage('Prompt copied. Paste into chat.');
            }
            break;

          case 'claude-code':
            const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
            const terminal = vscode.window.createTerminal('Claude Code');
            terminal.show();
            terminal.sendText(`claude "${escapedPrompt}"`);
            break;

          case 'copy':
          default:
            await vscode.env.clipboard.writeText(prompt);
            vscode.window.showInformationMessage('Prompt copied to clipboard.');
            break;
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to send to agent: ${error}`);
      }
    })
  );

  // Lint & Sort command
  context.subscriptions.push(
    vscode.commands.registerCommand('brainfile.codelens.lintAndSort', async (uri: vscode.Uri) => {
      try {
        const content = fs.readFileSync(uri.fsPath, 'utf8');
        const board = BrainfileParser.parse(content);

        // Run linter first
        const lintResult = BrainfileLinter.lint(content, { autoFix: true });

        // Sort columns by order property
        let sortedContent = lintResult.fixedContent || content;
        const sortedBoard = BrainfileParser.parse(sortedContent);

        if (sortedBoard && sortedBoard.columns.length > 0) {
          // Sort columns by order property (ascending)
          sortedBoard.columns.sort((a, b) => {
            const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
            const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
            return orderA - orderB;
          });
          sortedContent = BrainfileSerializer.serialize(sortedBoard);
        }

        // Check if anything changed
        if (sortedContent === content) {
          vscode.window.showInformationMessage('No changes needed - file is already sorted and lint-free.');
          return;
        }

        // Show diff preview
        const fixedDoc = await vscode.workspace.openTextDocument({
          content: sortedContent,
          language: 'markdown'
        });

        await vscode.commands.executeCommand(
          'vscode.diff',
          uri,
          fixedDoc.uri,
          'brainfile.md: Original ↔ Lint & Sort'
        );

        const choice = await vscode.window.showInformationMessage(
          'Apply lint fixes and sort columns?',
          'Apply Changes',
          'Cancel'
        );

        if (choice !== 'Apply Changes') return;

        await writeAndRefreshDocument(uri, sortedContent);
        boardProvider.refresh();

        const fixCount = lintResult.issues.filter(i => i.fixable).length;
        const message = fixCount > 0
          ? `Applied ${fixCount} lint fix(es) and sorted columns.`
          : 'Columns sorted by order.';
        vscode.window.showInformationMessage(message);

      } catch (error) {
        vscode.window.showErrorMessage(`Lint & Sort failed: ${error}`);
      }
    })
  );
}

export function deactivate() {
  log('Extension deactivating...');
  // All cleanup will be handled by disposal of subscriptions
  log('Extension deactivated');
}
