import * as vscode from 'vscode';
import { BoardViewProvider } from './boardViewProvider';

const LOG_PREFIX = '[Brainfile]';

export function log(...args: any[]) {
  console.log(LOG_PREFIX, ...args);
}

export function activate(context: vscode.ExtensionContext) {
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

    context.subscriptions.push(
      vscode.commands.registerCommand('brainfile.createFromTemplate', () => {
        log('Creating task from template');
        provider.createFromTemplate();
      })
    );

    // Set context for keybinding
    vscode.commands.executeCommand('setContext', 'brainfile.boardActive', true);

    log('All providers and commands registered');
  } catch (error) {
    log('Error activating extension:', error);
    vscode.window.showErrorMessage('Failed to activate Brainfile extension');
  }
}

export function deactivate() {
  log('Extension deactivating...');
  // All cleanup will be handled by disposal of subscriptions
  log('Extension deactivated');
}
