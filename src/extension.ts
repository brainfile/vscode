import * as vscode from 'vscode';
import * as fs from 'fs';
import { BoardViewProvider } from './boardViewProvider';
import { BrainfileCompletionProvider } from './completionProvider';
import { BrainfileCodeLensProvider } from './codeLensProvider';
import { BrainfileHoverProvider } from './hoverProvider';
import { BrainfileParser, BrainfileSerializer } from '@brainfile/core';

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
    const provider = new BoardViewProvider(context.extensionUri);

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
}

export function deactivate() {
  log('Extension deactivating...');
  // All cleanup will be handled by disposal of subscriptions
  log('Extension deactivated');
}
