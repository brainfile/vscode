import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { log } from "./extension";
import {
  BrainfileParser,
  BrainfileSerializer,
  BrainfileLinter,
  Board,
  TaskTemplate,
  Task,
  BUILT_IN_TEMPLATES,
  hashBoardContent
} from "@brainfile/core";

// Import modular board components
import {
  // Types
  AgentType,
  DetectedAgent,
  // HTML utilities
  getPriorityClassName,
  generateErrorHtml,
  // Agent utilities
  buildAgentPrompt,
  createParseWarningMessage,
  // Board operations
  updateTask,
  deleteTask,
  moveTask,
  addTask,
  updateBoardTitle,
  toggleSubtask,
  updateStatsConfig,
  findColumnById,
} from "./board";

export class BoardViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "brainfile.tasksView";

  private _view?: vscode.WebviewView;
  private _boardFilePath?: string;
  private _fileWatcher?: vscode.FileSystemWatcher;
  private _archiveWatcher?: vscode.FileSystemWatcher;
  private _textDocumentListener?: vscode.Disposable;
  private _refreshTimer?: NodeJS.Timeout;
  private _isFirstRender: boolean = true;
  private _disposables: vscode.Disposable[] = [];
  private _lastContentHash?: string;
  private _writeDebounceTimer?: NodeJS.Timeout;
  private _pendingWrite?: { content: string; callback?: () => void };
  private _lastValidBoard?: Board;
  private _parseErrorCount: number = 0;
  private _lastUsedAgent: AgentType = "copilot";
  private _context?: vscode.ExtensionContext;
  private _webviewReady: boolean = false;
  private _pendingBoard?: Board | null;

  constructor(private readonly _extensionUri: vscode.Uri, context?: vscode.ExtensionContext) {
    this._context = context;
    // Load last-used agent from workspace state
    if (context) {
      const saved = context.workspaceState.get<AgentType>("brainfile.lastUsedAgent");
      if (saved) {
        this._lastUsedAgent = saved;
      }
    }
  }

  /**
   * Check if running in Cursor IDE
   */
  private isCursorIDE(): boolean {
    return vscode.env.appName.toLowerCase().includes("cursor");
  }

  /**
   * Detect available AI agents in the current environment
   */
  private detectAvailableAgents(): DetectedAgent[] {
    const agents: DetectedAgent[] = [];

    // Check if running in Cursor
    const isCursor = vscode.env.appName.toLowerCase().includes("cursor");
    if (isCursor) {
      agents.push({ type: "cursor", label: "Cursor", available: true });
    }

    // Check for Copilot Chat extension
    const copilotExt = vscode.extensions.getExtension("github.copilot-chat");
    if (copilotExt) {
      agents.push({ type: "copilot", label: "Copilot", available: true });
    }

    // Check for Claude Code extension
    const claudeExt = vscode.extensions.getExtension("anthropic.claude-code");
    if (claudeExt) {
      agents.push({ type: "claude-code", label: "Claude", available: true });
    }

    // Always add copy fallback
    agents.push({ type: "copy", label: "Copy", available: true });

    return agents;
  }

  /**
   * Send available agents to the webview
   */
  private postAvailableAgents() {
    if (!this._view) return;
    const agents = this.detectAvailableAgents();
    const defaultAgent = this.getDefaultAgent();
    this._view.webview.postMessage({
      type: "agentsDetected",
      agents,
      defaultAgent,
      lastUsed: this._lastUsedAgent,
    });
  }

  /**
   * Get the default agent (last used or first available)
   */
  private getDefaultAgent(): AgentType {
    const agents = this.detectAvailableAgents();
    const lastUsed = agents.find(a => a.type === this._lastUsedAgent && a.available);
    if (lastUsed) return lastUsed.type;
    // Return first available non-copy agent, or copy as last resort
    const preferred = agents.find(a => a.type !== "copy" && a.available);
    return preferred?.type || "copy";
  }

  /**
   * Debounced write to prevent file conflicts when multiple agents/humans edit simultaneously
   */
  private debouncedWrite(content: string, callback?: () => void) {
    if (!this._boardFilePath) {
      log("No board file path for write");
      return;
    }

    // Store the pending write
    this._pendingWrite = { content, callback };

    // Clear existing timer
    if (this._writeDebounceTimer) {
      clearTimeout(this._writeDebounceTimer);
    }

    // Set new timer (300ms debounce)
    this._writeDebounceTimer = setTimeout(() => {
      if (this._pendingWrite && this._boardFilePath) {
        try {
          // Check if file has changed externally before writing
          const currentContent = fs.readFileSync(this._boardFilePath, "utf8");
          const currentHash = this.hashContent(currentContent);

          // If file changed externally and differs from our pending write
          if (
            currentHash !== this._lastContentHash &&
            currentHash !== this.hashContent(this._pendingWrite.content)
          ) {
            log("File changed externally, attempting merge");
            // For now, just warn - could implement merge logic later
            vscode.window.showWarningMessage(
              "Board file was modified externally. Your changes may conflict."
            );
          }

          // Write the file
          fs.writeFileSync(
            this._boardFilePath,
            this._pendingWrite.content,
            "utf8"
          );
          this._lastContentHash = this.hashContent(this._pendingWrite.content);

          // Execute callback if provided
          if (this._pendingWrite.callback) {
            this._pendingWrite.callback();
          }
        } catch (error) {
          log("Error in debounced write:", error);
          vscode.window.showErrorMessage("Failed to save board changes");
        }

        this._pendingWrite = undefined;
      }
    }, 300);
  }

  public refresh() {
    this.updateView();
  }

  /**
   * Persist board changes to disk and refresh the view
   * Common pattern for all board-mutating operations
   */
  private persistAndRefresh(board: Board, logMessage: string) {
    if (!this._boardFilePath) return;

    const newContent = BrainfileSerializer.serialize(board);
    fs.writeFileSync(this._boardFilePath, newContent, "utf8");
    log(logMessage);

    // Update hash to prevent double update from file watcher
    this._lastContentHash = this.hashContent(newContent);

    // Immediately update the view with the new content
    this.updateView(false, newContent);
  }

  public async createBoard() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage("No workspace folder open");
      return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const brainfilePath = path.join(rootPath, "brainfile.md");

    // Check if file already exists
    if (fs.existsSync(brainfilePath)) {
      const answer = await vscode.window.showWarningMessage(
        "brainfile.md already exists. Overwrite?",
        "Yes",
        "No"
      );
      if (answer !== "Yes") {
        return;
      }
    }

    await this.createDefaultBrainfileFile(brainfilePath);
    this.updateView();
  }

  public async quickAddTask() {
    if (!this._boardFilePath) {
      vscode.window.showErrorMessage("No Brainfile board found");
      return;
    }

    // Get column options
    const content = fs.readFileSync(this._boardFilePath, "utf8");
    const board = BrainfileParser.parse(content);
    if (!board) {
      vscode.window.showErrorMessage("Failed to parse board");
      return;
    }

    // Quick input for task title
    const title = await vscode.window.showInputBox({
      prompt: "Task title",
      placeHolder: "Enter task title",
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "Task title is required";
        }
        return null;
      },
    });

    if (!title) {
      return;
    }

    // Quick pick for column selection
    const columnOptions = board.columns.map((col) => ({
      label: col.title,
      description: `${col.tasks.length} tasks`,
      id: col.id,
    }));

    const selectedColumn = await vscode.window.showQuickPick(columnOptions, {
      placeHolder: "Select column (default: To Do)",
      canPickMany: false,
    });

    const columnId = selectedColumn?.id || "todo";

    // Optional description
    const description = await vscode.window.showInputBox({
      prompt: "Task description (optional)",
      placeHolder: "Enter task description (supports markdown)",
    });

    // Generate next task ID
    const allTaskIds = board.columns.flatMap((col) =>
      col.tasks.map((t) => parseInt(t.id.replace("task-", "")) || 0)
    );
    const maxId = Math.max(0, ...allTaskIds);
    const newTaskId = `task-${maxId + 1}`;

    // Add task to the selected column
    const column = board.columns.find((col) => col.id === columnId);
    if (column) {
      column.tasks.push({
        id: newTaskId,
        title: title.trim(),
        description: description?.trim() || "",
      });

      // Save the updated board
      const newContent = BrainfileSerializer.serialize(board);
      fs.writeFileSync(this._boardFilePath, newContent, "utf8");
      log(`Quick added task ${newTaskId} to column ${columnId}`);
      vscode.window.showInformationMessage(
        `Added task "${title}" to ${column.title}`
      );

      // Update hash to prevent double update from file watcher
      this._lastContentHash = this.hashContent(newContent);

      // Update the view with the new content
      this.updateView(false, newContent);
    }
  }

  // Template Management Methods
  private getTemplateStorageKey(): string {
    return "brainfile.userTemplates";
  }

  public getUserTemplates(): TaskTemplate[] {
    const config = vscode.workspace.getConfiguration();
    const templates = config.get<TaskTemplate[]>(this.getTemplateStorageKey());
    return templates || [];
  }

  public async saveUserTemplates(templates: TaskTemplate[]): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    await config.update(
      this.getTemplateStorageKey(),
      templates,
      vscode.ConfigurationTarget.Workspace
    );
  }

  public getAllTemplates(): TaskTemplate[] {
    const userTemplates = this.getUserTemplates();
    return [...BUILT_IN_TEMPLATES, ...userTemplates];
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    log("Resolving webview view");
    this._view = webviewView;

    // When webview is moved between panes, it gets recreated
    // Reset first render flag to ensure full HTML is set
    this._isFirstRender = true;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // Find brainfile.md file
    this.findBrainfileFile().then(() => {
      log("Board file found:", this._boardFilePath);
      this.updateView();
      this.watchFile();
    });

    // Listen for settings changes to update priority colors immediately
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("brainfile.priorities")) {
        log("Priority settings changed, refreshing webview styles");
        this.updateView(false);
      }
    });

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((data) => {
      log("Received message from webview:", data.type, data);
      switch (data.type) {
        case "webviewReady":
          this._webviewReady = true;
          if (this._pendingBoard !== undefined) {
            this.postBoardUpdate(this._pendingBoard);
            this._pendingBoard = undefined;
          } else if (this._lastValidBoard) {
            this.postBoardUpdate(this._lastValidBoard);
          } else {
            this.refresh();
          }
          this.postAvailableAgents();
          break;
        case "updateTask":
          this.handleUpdateTask(
            data.columnId,
            data.taskId,
            data.title,
            data.description
          );
          break;
        case "editTask":
          this.handleEditTask(data.taskId);
          break;
        case "editPriority":
          this.handleEditPriority(data.taskId);
          break;
        case "deleteTask":
          this.handleDeleteTask(data.columnId, data.taskId);
          break;
        case "moveTask":
          this.handleMoveTask(
            data.taskId,
            data.fromColumn,
            data.toColumn,
            data.toIndex
          );
          break;
        case "updateTitle":
          this.handleUpdateTitle(data.title);
          break;
        case "openFile":
          this.handleOpenFile(data.filePath);
          break;
        case "clearCache":
          this.handleClearCache();
          break;
        case "openSettings":
          vscode.commands.executeCommand('workbench.action.openSettings', 'brainfile');
          break;
        case "archiveTask":
          this.handleArchiveTask(data.columnId, data.taskId);
          break;
        case "completeTask":
          this.handleMoveTask(data.taskId, data.columnId, "done", 0);
          break;
        case "addTaskToColumn":
          this.handleAddTaskToColumn(data.columnId);
          break;
        case "addRule":
          this.handleAddRule(data.ruleType);
          break;
        case "editRule":
          this.handleEditRule(data.ruleId, data.ruleType);
          break;
        case "deleteRule":
          this.handleDeleteRule(data.ruleId, data.ruleType);
          break;
        case "toggleSubtask":
          this.handleToggleSubtask(data.taskId, data.subtaskId);
          break;
        case "saveStatsConfig":
          this.handleSaveStatsConfig(data.columns);
          break;
        case "fix-issues":
          this.handleFixIssues();
          break;
        case "refresh":
          this.handleRefresh();
          break;
        case "sendToAgent":
          this.handleSendToAgent(data.taskId, data.agentType);
          break;
        case "getAvailableAgents":
          this.postAvailableAgents();
          break;
      }
    });
  }

  private async findBrainfileFile() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;

    // Check for non-hidden brainfile.md first (new default)
    const nonHiddenPath = path.join(rootPath, "brainfile.md");
    if (fs.existsSync(nonHiddenPath)) {
      this._boardFilePath = nonHiddenPath;
      return;
    }

    // Check for hidden .brainfile.md (backward compatibility)
    const hiddenPath = path.join(rootPath, ".brainfile.md");
    if (fs.existsSync(hiddenPath)) {
      this._boardFilePath = hiddenPath;
      return;
    }

    // Check for .bb.md (shorthand - backward compatibility)
    const bbPath = path.join(rootPath, ".bb.md");
    if (fs.existsSync(bbPath)) {
      this._boardFilePath = bbPath;
      return;
    }

    // If no file exists, create default brainfile.md (non-hidden)
    await this.createDefaultBrainfileFile(nonHiddenPath);
  }

  private async createDefaultBrainfileFile(filePath: string) {
    try {
      const defaultContent = `---
title: My Project
agent:
  instructions:
    - Modify only the YAML frontmatter
    - Preserve all IDs
    - Keep ordering
    - Make minimal changes
    - Preserve unknown fields
rules:
  always: []
  never: []
  prefer: []
  context: []
columns:
  - id: todo
    title: To Do
    tasks: []
  - id: in-progress
    title: In Progress
    tasks: []
  - id: done
    title: Done
    tasks: []
---
`;

      fs.writeFileSync(filePath, defaultContent, "utf8");
      this._boardFilePath = filePath;

      const fileName = path.basename(filePath);
      log(`Created default ${fileName} file`);
      vscode.window.showInformationMessage(
        `Created ${fileName} with starter template`
      );
    } catch (error) {
      const fileName = path.basename(filePath);
      log(`Error creating default ${fileName}:`, error);
      vscode.window.showErrorMessage(`Failed to create ${fileName} file`);
    }
  }

  private watchFile() {
    if (!this._boardFilePath) {
      log("No board file to watch");
      return;
    }

    this.disposeWatchers();

    const boardUri = vscode.Uri.file(this._boardFilePath);
    const boardFolder = vscode.workspace.getWorkspaceFolder(boardUri);
    if (!boardFolder) {
      log("No workspace folder found for watcher");
      return;
    }

    const rootPath = boardFolder.uri.fsPath;
    const boardRelative = path.relative(rootPath, this._boardFilePath);
    const boardPattern = new vscode.RelativePattern(rootPath, boardRelative);

    log("Setting up file watchers for:", this._boardFilePath);

    this._fileWatcher = vscode.workspace.createFileSystemWatcher(
      boardPattern,
      false,
      false,
      false
    );
    this._fileWatcher.onDidChange((uri) => {
      log("Board file changed on disk:", uri.fsPath);
      this.scheduleBoardRefresh("file-change", uri);
    });
    this._fileWatcher.onDidCreate((uri) => {
      log("Board file created:", uri.fsPath);
      this._boardFilePath = uri.fsPath;
      this.scheduleBoardRefresh("file-create", uri);
    });
    this._fileWatcher.onDidDelete(() => {
      log("Board file deleted");
      this._boardFilePath = undefined;
      this.updateView(true);
    });

    const archivePath = this.getArchivePath();
    if (archivePath) {
      const archiveRelative = path.relative(rootPath, archivePath);
      const archivePattern = new vscode.RelativePattern(
        rootPath,
        archiveRelative
      );
      this._archiveWatcher = vscode.workspace.createFileSystemWatcher(
        archivePattern,
        false,
        false,
        false
      );
      this._archiveWatcher.onDidChange((uri) => {
        log("Archive file changed on disk:", uri.fsPath);
        this.scheduleBoardRefresh("archive-change", uri);
      });
      this._archiveWatcher.onDidCreate((uri) => {
        log("Archive file created:", uri.fsPath);
        this.scheduleBoardRefresh("archive-create", uri);
      });
      this._archiveWatcher.onDidDelete(() => {
        log("Archive file deleted");
        this.scheduleBoardRefresh("archive-delete");
      });
    }

    this._textDocumentListener = vscode.workspace.onDidChangeTextDocument(
      (event) => {
        if (event.document.uri.fsPath === this._boardFilePath) {
          log("Board document changed in editor");
          this.scheduleBoardRefresh("document-change", event.document.uri);
        }
      }
    );

    // Trigger an initial refresh to sync hash state
    this.scheduleBoardRefresh("initial-watch");
  }

  private scheduleBoardRefresh(reason: string, _uri?: vscode.Uri) {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
    }

    // Use longer debounce for document changes to allow users to finish typing
    const debounceTime = reason === "document-change" ? 500 : 150;

    this._refreshTimer = setTimeout(() => {
      this.refreshBoardFromSource(reason);
    }, debounceTime);
  }

  private async refreshBoardFromSource(reason: string) {
    if (!this._boardFilePath) {
      log("No board file to refresh from");
      return;
    }

    try {
      const content = await this.readBoardContent();

      const currentHash = this.hashContent(content);
      if (currentHash === this._lastContentHash) {
        log("Refresh skipped - content hash unchanged");
        return;
      }

      log(`Refreshing board due to ${reason}; new hash: ${currentHash}`);
      this._lastContentHash = currentHash;
      this.updateView(false, content);
    } catch (error) {
      log("Error refreshing board from source:", error);
      // Only show error if it's not a file not found error (could be deleted)
      if (error instanceof Error && !error.message.includes("ENOENT")) {
        vscode.window.showErrorMessage(
          `Failed to refresh Brainfile board: ${error.message}`
        );
      }
    }
  }

  private async readBoardContent(): Promise<string> {
    if (!this._boardFilePath) {
      throw new Error("No board file path set");
    }

    const openDoc = vscode.workspace.textDocuments.find(
      (doc) => doc.uri.fsPath === this._boardFilePath
    );
    if (openDoc) {
      return openDoc.getText();
    }

    const data = await vscode.workspace.fs.readFile(
      vscode.Uri.file(this._boardFilePath)
    );
    return Buffer.from(data).toString("utf8");
  }

  private disposeWatchers() {
    if (this._fileWatcher) {
      this._fileWatcher.dispose();
      this._fileWatcher = undefined;
    }

    if (this._archiveWatcher) {
      this._archiveWatcher.dispose();
      this._archiveWatcher = undefined;
    }

    if (this._textDocumentListener) {
      this._textDocumentListener.dispose();
      this._textDocumentListener = undefined;
    }

    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = undefined;
    }
  }

  private hashContent(content: string): string {
    return hashBoardContent(content);
  }

  private updateView(
    forceFullRefresh: boolean = false,
    contentOverride?: string
  ) {
    if (!this._view || !this._boardFilePath) {
      log("Cannot update view - missing view or board file");
      return;
    }

    try {
      log("Updating tasks view");
      const content =
        contentOverride ?? fs.readFileSync(this._boardFilePath, "utf8");
      const board = BrainfileParser.parse(content);

      if (!board) {
        log("Failed to parse board file");
        this._parseErrorCount++;

        if (this._lastValidBoard && this._parseErrorCount <= 3) {
          log("Showing last valid board with warning");
          if (!this._isFirstRender && this._webviewReady) {
            this._view.webview.postMessage(
              createParseWarningMessage("Syntax error in brainfile.md - showing last valid state")
            );
            this.postBoardUpdate(this._lastValidBoard);
          }
          return;
        }

        const lintResult = BrainfileLinter.lint(content);
        this._view.webview.html = generateErrorHtml({
          message: "Failed to parse brainfile.md",
          details: "Check for YAML syntax errors in the frontmatter. Common issues:\n• Missing colons after keys\n• Incorrect indentation\n• Unclosed quotes or brackets",
          lintResult,
        });
        this._webviewReady = false;
        this._isFirstRender = true;
        return;
      }

      // Successful parse - reset error count
      this._parseErrorCount = 0;

      // Load archive from separate file if it exists
      this.loadArchive(board);
      const newHash = this.hashContent(content);

      log(
        "Board parsed successfully:",
        board.title,
        `(${board.columns.length} columns)`
      );

      this._lastValidBoard = board;
      this._lastContentHash = newHash;

      this.ensureWebviewHtml(forceFullRefresh);
      this.postBoardUpdate(board);
    } catch (error) {
      log("Error updating view:", error);
      vscode.window.showErrorMessage("Failed to update Brainfile board view");
    }
  }

  private ensureWebviewHtml(forceFullRefresh: boolean) {
    if (!this._view) return;

    if (this._isFirstRender || forceFullRefresh) {
      log("Loading Vue webview (force:", forceFullRefresh, ")");
      this._webviewReady = false;
      this._pendingBoard = this._lastValidBoard ?? null;
      this._view.webview.html = this.getWebviewHtml(this._view.webview);
      this._isFirstRender = false;
    }
  }

  private postBoardUpdate(board: Board | null) {
    if (!this._view) return;
    const payload = {
      type: "boardUpdate",
      board,
      priorityStyles: this.getDynamicPriorityCSS(),
    };

    if (this._webviewReady) {
      this._view.webview.postMessage(payload);
    } else {
      this._pendingBoard = board;
    }
  }

  private handleUpdateTask(
    columnId: string,
    taskId: string,
    newTitle: string,
    newDescription: string
  ) {
    if (!this._boardFilePath) return;

    log(`Updating task ${taskId} in column ${columnId}`);
    const content = fs.readFileSync(this._boardFilePath, "utf8");
    const board = BrainfileParser.parse(content);
    if (!board) return;

    const result = updateTask(board, columnId, taskId, newTitle, newDescription);
    if (!result.success || !result.board) {
      log(`Failed to update task: ${result.error}`);
      return;
    }

    this.persistAndRefresh(result.board, "Task updated successfully");
  }

  private handleDeleteTask(columnId: string, taskId: string) {
    if (!this._boardFilePath) return;

    log(`Deleting task ${taskId} from column ${columnId}`);
    const content = fs.readFileSync(this._boardFilePath, "utf8");
    const board = BrainfileParser.parse(content);
    if (!board) return;

    const result = deleteTask(board, columnId, taskId);
    if (!result.success || !result.board) {
      log(`Failed to delete task: ${result.error}`);
      return;
    }

    this.persistAndRefresh(result.board, "Task deleted successfully");
  }

  private handleMoveTask(
    taskId: string,
    fromColumnId: string,
    toColumnId: string,
    toIndex: number
  ) {
    if (!this._boardFilePath) return;

    log(`Moving task ${taskId} from ${fromColumnId} to ${toColumnId} at index ${toIndex}`);
    const content = fs.readFileSync(this._boardFilePath, "utf8");
    const board = BrainfileParser.parse(content);
    if (!board) {
      log("Failed to parse board");
      return;
    }

    const result = moveTask(board, taskId, fromColumnId, toColumnId, toIndex);
    if (!result.success || !result.board) {
      log(`Failed to move task: ${result.error}`);
      return;
    }

    this.persistAndRefresh(result.board, "Task moved successfully");
  }

  private handleUpdateTitle(newTitle: string) {
    if (!this._boardFilePath) return;

    log(`Updating board title to: ${newTitle}`);
    const content = fs.readFileSync(this._boardFilePath, "utf8");
    const board = BrainfileParser.parse(content);
    if (!board) return;

    const result = updateBoardTitle(board, newTitle);
    if (!result.success || !result.board) {
      log(`Failed to update title: ${result.error}`);
      return;
    }

    this.persistAndRefresh(result.board, "Board title updated successfully");
  }

  private async handleEditTask(taskId: string) {
    if (!this._boardFilePath) return;

    try {
      log(`Opening task ${taskId} in editor`);

      // Read the file content
      const content = fs.readFileSync(this._boardFilePath, "utf8");

      // Find the task location
      const location = BrainfileParser.findTaskLocation(content, taskId);

      if (!location) {
        vscode.window.showErrorMessage(`Could not find task ${taskId} in file`);
        return;
      }

      // Check if the document is already open in a visible editor
      const uri = vscode.Uri.file(this._boardFilePath);
      let editor = vscode.window.visibleTextEditors.find(
        (editor) => editor.document.uri.toString() === uri.toString()
      );

      if (editor) {
        // Document is already open, just focus it and move cursor
        const position = new vscode.Position(
          location.line - 1,
          location.column
        );
        const range = new vscode.Range(position, position);

        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

        // Focus the existing editor
        await vscode.window.showTextDocument(editor.document, {
          viewColumn: editor.viewColumn,
          preserveFocus: false,
        });
      } else {
        // Document is not open, open it in a new editor
        const document = await vscode.workspace.openTextDocument(uri);
        const position = new vscode.Position(
          location.line - 1,
          location.column
        );
        const range = new vscode.Range(position, position);

        editor = await vscode.window.showTextDocument(document, {
          selection: range,
          viewColumn: vscode.ViewColumn.Beside, // Open beside the webview
          preserveFocus: false, // Give focus to the editor
        });
      }

      // Highlight the task temporarily
      if (editor) {
        await this.highlightTask(editor, taskId, content);
      }

      log(`Opened editor at line ${location.line} for task ${taskId}`);
    } catch (error) {
      log("Error opening task in editor:", error);
      vscode.window.showErrorMessage("Failed to open task in editor");
    }
  }

  private async handleEditPriority(taskId: string) {
    if (!this._boardFilePath) return;

    try {
      const content = fs.readFileSync(this._boardFilePath, "utf8");
      const board = BrainfileParser.parse(content);
      if (!board) return;

      // Find the task
      let targetTask: { task: Task; columnId: string } | null = null;
      for (const col of board.columns) {
        const task = col.tasks.find((t) => t.id === taskId);
        if (task) {
          targetTask = { task, columnId: col.id };
          break;
        }
      }

      if (!targetTask) {
        vscode.window.showErrorMessage(`Could not find task ${taskId}`);
        return;
      }

      const priorities = [
        { label: "critical", description: "Highest priority" },
        { label: "high", description: "High priority" },
        { label: "medium", description: "Medium priority" },
        { label: "low", description: "Low priority" },
        { label: "$(edit) Custom...", description: "Enter a custom priority" },
        { label: "$(close) Remove priority", description: "Remove priority from task" },
      ];

      const selected = await vscode.window.showQuickPick(priorities, {
        placeHolder: `Current: ${targetTask.task.priority || "none"}`,
        title: "Select Priority",
      });

      if (!selected) return;

      let newPriority: string | undefined;

      if (selected.label === "$(close) Remove priority") {
        newPriority = undefined;
      } else if (selected.label === "$(edit) Custom...") {
        const custom = await vscode.window.showInputBox({
          prompt: "Enter custom priority",
          value: targetTask.task.priority || "",
        });
        if (custom === undefined) return;
        newPriority = custom || undefined;
      } else {
        newPriority = selected.label;
      }

      // Update the task priority (cast to any since we support custom priorities)
      (targetTask.task as any).priority = newPriority;

      const newContent = BrainfileSerializer.serialize(board);
      fs.writeFileSync(this._boardFilePath, newContent, "utf8");

      // Update hash to prevent double update
      this._lastContentHash = this.hashContent(newContent);

      log(`Updated priority for task ${taskId} to: ${newPriority || "none"}`);
      this.updateView(false, newContent);
    } catch (error) {
      log("Error updating priority:", error);
      vscode.window.showErrorMessage("Failed to update priority");
    }
  }

  private async handleSendToAgent(taskId: string, agentType?: AgentType) {
    if (!this._boardFilePath) {
      vscode.window.showErrorMessage("No Brainfile board found");
      return;
    }

    try {
      const content = fs.readFileSync(this._boardFilePath, "utf8");
      const board = BrainfileParser.parse(content);
      if (!board) {
        vscode.window.showErrorMessage("Failed to parse board");
        return;
      }

      // Find task and column
      let targetTask: Task | undefined;
      let columnTitle = "";
      for (const col of board.columns) {
        const found = col.tasks.find((t) => t.id === taskId);
        if (found) {
          targetTask = found;
          columnTitle = col.title;
          break;
        }
      }

      if (!targetTask) {
        vscode.window.showErrorMessage(`Task ${taskId} not found`);
        return;
      }

      const prompt = buildAgentPrompt({
        boardTitle: board.title,
        columnTitle,
        task: targetTask,
      });

      // Use provided agent or default
      const agent = agentType || this.getDefaultAgent();
      this._lastUsedAgent = agent;

      // Persist to workspace state
      if (this._context) {
        this._context.workspaceState.update("brainfile.lastUsedAgent", agent);
      }

      await this.sendToAgent(agent, prompt);
    } catch (error) {
      log("Error sending to agent:", error);
      vscode.window.showErrorMessage("Failed to build agent prompt.");
    }
  }

  /**
   * Send prompt to the specified agent
   */
  private async sendToAgent(agent: AgentType, prompt: string): Promise<void> {
    switch (agent) {
      case "copilot":
      case "cursor":
        // Use workbench.action.chat.open with prompt directly
        try {
          await vscode.commands.executeCommand("workbench.action.chat.open", prompt);
        } catch (err) {
          // Fallback to clipboard if command fails
          await vscode.env.clipboard.writeText(prompt);
          vscode.window.showInformationMessage("Prompt copied. Paste into chat.");
        }
        break;

      case "claude-code":
        // Open terminal and run claude CLI
        const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
        const terminal = vscode.window.createTerminal("Claude Code");
        terminal.show();
        terminal.sendText(`claude "${escapedPrompt}"`);
        break;

      case "copy":
      default:
        // Copy to clipboard and show in document
        await vscode.env.clipboard.writeText(prompt);
        const doc = await vscode.workspace.openTextDocument({
          content: prompt,
          language: "markdown",
        });
        await vscode.window.showTextDocument(doc, { preview: true });
        vscode.window.showInformationMessage("Prompt copied to clipboard.");
        break;
    }
  }

  private async highlightTask(
    editor: vscode.TextEditor,
    taskId: string,
    content: string
  ) {
    // Create a decoration type for highlighting
    const highlightDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(255, 235, 59, 0.3)", // Yellow highlight
      border: "1px solid rgba(255, 235, 59, 0.5)",
      borderRadius: "2px",
      overviewRulerColor: "rgba(255, 235, 59, 0.8)",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    // Find the task's full range (from task start to next task or end of tasks array)
    const lines = content.split("\n");
    const ranges: vscode.Range[] = [];

    let taskStartLine = -1;
    let taskEndLine = -1;
    let foundTask = false;
    let indentLevel = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.includes(`id: ${taskId}`)) {
        // Found our task
        foundTask = true;

        // Check if this line starts with a dash (compact format)
        if (line.match(/^\s*-\s+id:/)) {
          taskStartLine = i;
          indentLevel = line.match(/^(\s*)/)?.[1].length || 0;
        } else if (i > 0 && lines[i - 1].match(/^\s*-\s*$/)) {
          // Dash on previous line (expanded format)
          taskStartLine = i - 1;
          indentLevel = lines[i - 1].match(/^(\s*)/)?.[1].length || 0;
        } else {
          taskStartLine = i;
          indentLevel = line.match(/^(\s*)/)?.[1].length || 0;
        }
      } else if (foundTask) {
        // Check if we've reached the next task or end of this task's properties
        const currentIndent = line.match(/^(\s*)/)?.[1].length || 0;

        // If we find another task dash at the same or lower indent level, we're done
        if (line.match(/^\s*-\s/) && currentIndent <= indentLevel) {
          taskEndLine = i - 1;
          break;
        }

        // If we've gone to a lower indent level (not counting empty lines), we're done
        if (line.trim() && currentIndent <= indentLevel) {
          taskEndLine = i - 1;
          break;
        }
      }
    }

    // If we didn't find an end, highlight to the end of the found content
    if (foundTask && taskEndLine === -1) {
      // Find the last non-empty line that belongs to this task
      for (let i = taskStartLine + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const currentIndent = line.match(/^(\s*)/)?.[1].length || 0;
        if (currentIndent > indentLevel) {
          taskEndLine = i;
        } else {
          break;
        }
      }
    }

    if (taskStartLine !== -1 && taskEndLine !== -1) {
      const range = new vscode.Range(
        new vscode.Position(taskStartLine, 0),
        new vscode.Position(taskEndLine, lines[taskEndLine].length)
      );
      ranges.push(range);
    } else if (taskStartLine !== -1) {
      // Just highlight the single line if we couldn't find the end
      const range = new vscode.Range(
        new vscode.Position(taskStartLine, 0),
        new vscode.Position(taskStartLine, lines[taskStartLine].length)
      );
      ranges.push(range);
    }

    // Apply the decoration
    editor.setDecorations(highlightDecoration, ranges);

    // Remove the highlight after 3 seconds
    setTimeout(() => {
      highlightDecoration.dispose();
    }, 3000);
  }

  private async handleOpenFile(filePath: string) {
    try {
      log(`Opening file: ${filePath}`);

      // Check if filePath contains line number (e.g., "file.ts:42")
      const match = filePath.match(/^(.+):(\d+)$/);
      let actualPath = filePath;
      let lineNumber = 0;

      if (match) {
        actualPath = match[1];
        lineNumber = parseInt(match[2], 10) - 1; // VSCode uses 0-based line numbers
      }

      // Resolve relative paths from workspace root
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        log("No workspace folder found");
        return;
      }

      const absolutePath = path.isAbsolute(actualPath)
        ? actualPath
        : path.join(workspaceFolders[0].uri.fsPath, actualPath);

      const uri = vscode.Uri.file(absolutePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);

      // Jump to line if specified
      if (lineNumber > 0) {
        const position = new vscode.Position(lineNumber, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position));
      }

      log("File opened successfully");
    } catch (error) {
      log("Error opening file:", error);
      vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
    }
  }

  private handleClearCache() {
    try {
      log("Clearing cache and reloading window");

      // Dispose all resources
      this.dispose();

      // Reload the window
      vscode.commands.executeCommand("workbench.action.reloadWindow");
    } catch (error) {
      log("Error clearing cache:", error);
      vscode.window.showErrorMessage("Failed to clear cache");
    }
  }

  private handleSaveStatsConfig(columns: string[]) {
    if (!this._boardFilePath) return;

    try {
      log(`Saving stats config with columns: ${columns.join(", ")}`);

      const content = fs.readFileSync(this._boardFilePath, "utf8");
      const board = BrainfileParser.parse(content);
      if (!board) return;

      // Handle empty columns (remove config) or use updateStatsConfig
      let updatedBoard: Board;
      if (columns.length > 0) {
        const result = updateStatsConfig(board, columns.slice(0, 4));
        if (!result.success || !result.board) {
          log(`Failed to update stats config: ${result.error}`);
          return;
        }
        updatedBoard = result.board;
      } else {
        // Remove statsConfig if no columns selected (use default)
        updatedBoard = { ...board };
        delete updatedBoard.statsConfig;
      }

      this.persistAndRefresh(updatedBoard, "Stats config saved successfully");
      vscode.window.showInformationMessage("Stats configuration saved successfully");
    } catch (error) {
      log("Error saving stats config:", error);
      vscode.window.showErrorMessage("Failed to save stats configuration");
    }
  }

  private async handleFixIssues() {
    if (!this._boardFilePath) {
      vscode.window.showErrorMessage("No brainfile.md file found");
      return;
    }

    try {
      log("Running auto-fix on brainfile.md");
      
      // Read current content
      const content = fs.readFileSync(this._boardFilePath, "utf8");
      
      // Run linter with auto-fix
      const result = BrainfileLinter.lint(content, { autoFix: true });
      
      if (!result.fixedContent) {
        vscode.window.showInformationMessage("No fixable issues found");
        return;
      }
      
      // Show preview in diff editor
      const fixedUri = vscode.Uri.parse(`untitled:${path.basename(this._boardFilePath)}.fixed`);
      const originalUri = vscode.Uri.file(this._boardFilePath);
      
      // Ask user to confirm
      const choice = await vscode.window.showInformationMessage(
        `Found ${result.issues.filter(i => i.fixable).length} fixable issue(s). Apply fixes?`,
        { modal: true },
        "Apply Fixes",
        "Preview Changes"
      );
      
      if (choice === "Preview Changes") {
        // Show diff
        const fixedDoc = await vscode.workspace.openTextDocument({
          content: result.fixedContent,
          language: "markdown"
        });
        
        await vscode.commands.executeCommand(
          "vscode.diff",
          originalUri,
          fixedDoc.uri,
          "brainfile.md: Original ↔ Fixed"
        );
        
        // Ask again after preview
        const applyChoice = await vscode.window.showInformationMessage(
          "Apply these fixes?",
          "Apply Fixes",
          "Cancel"
        );
        
        if (applyChoice !== "Apply Fixes") {
          return;
        }
      } else if (choice !== "Apply Fixes") {
        return;
      }
      
      // Apply the fixes
      fs.writeFileSync(this._boardFilePath, result.fixedContent, "utf8");
      this._lastContentHash = this.hashContent(result.fixedContent);
      
      vscode.window.showInformationMessage(
        `Fixed ${result.issues.filter(i => i.fixable).length} issue(s) successfully!`
      );
      
      // Refresh the view
      this.refresh();
      
    } catch (error) {
      log("Error fixing issues:", error);
      vscode.window.showErrorMessage(
        `Failed to fix issues: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private handleRefresh() {
    log("Manual refresh triggered from error page");
    this.refresh();
  }

  private getArchivePath(): string | undefined {
    if (!this._boardFilePath) return;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return;

    const rootPath = workspaceFolders[0].uri.fsPath;

    // Determine archive filename based on main board filename
    const mainFilename = path.basename(this._boardFilePath);
    const archiveFilename = mainFilename.replace(/\.md$/, "-archive.md");
    return path.join(rootPath, archiveFilename);
  }

  private loadArchive(board: Board) {
    const archivePath = this.getArchivePath();
    if (!archivePath || !this._boardFilePath) return;

    if (!fs.existsSync(archivePath)) {
      log("No archive file found at:", archivePath);
      board.archive = [];
      return;
    }

    try {
      log("Loading archive from:", archivePath);
      const archiveContent = fs.readFileSync(archivePath, "utf8");
      const archiveBoard = BrainfileParser.parse(archiveContent);

      if (archiveBoard && archiveBoard.archive) {
        board.archive = archiveBoard.archive;
        log(`Loaded ${archiveBoard.archive.length} archived tasks`);
      } else {
        board.archive = [];
      }
    } catch (error) {
      log("Error loading archive:", error);
      board.archive = [];
    }
  }

  private async handleAddTaskToColumn(columnId: string) {
    if (!this._boardFilePath) return;

    // Show quick input for task title
    const title = await vscode.window.showInputBox({
      prompt: "Task title",
      placeHolder: "Enter task title",
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "Task title is required";
        }
        return null;
      },
    });

    if (!title) return;

    // Optional description
    const description = await vscode.window.showInputBox({
      prompt: "Task description (optional)",
      placeHolder: "Enter task description (supports markdown)",
    });

    // Read current board
    const content = fs.readFileSync(this._boardFilePath, "utf8");
    const board = BrainfileParser.parse(content);
    if (!board) return;

    // Use addTask from boardOperations (handles ID generation)
    const result = addTask(board, columnId, title, description || "");
    if (!result.success || !result.board) {
      log(`Failed to add task: ${result.error}`);
      return;
    }

    const column = findColumnById(board, columnId);
    const columnTitle = column?.title || columnId;

    this.persistAndRefresh(result.board, `Added task to column ${columnId}`);
    vscode.window.showInformationMessage(`Added task "${title}" to ${columnTitle}`);
  }

  private handleToggleSubtask(taskId: string, subtaskId: string) {
    if (!this._boardFilePath) return;

    log(`Toggling subtask ${subtaskId} for task ${taskId}`);

    const content = fs.readFileSync(this._boardFilePath, "utf8");
    const board = BrainfileParser.parse(content);
    if (!board) return;

    const result = toggleSubtask(board, taskId, subtaskId);
    if (!result.success || !result.board) {
      log(`Failed to toggle subtask: ${result.error}`);
      return;
    }

    this.persistAndRefresh(result.board, `Subtask ${subtaskId} toggled`);
  }

  private async handleAddRule(
    ruleType: "always" | "never" | "prefer" | "context"
  ) {
    if (!this._boardFilePath) return;

    // Show quick input for rule text
    const ruleText = await vscode.window.showInputBox({
      prompt: `Add ${ruleType.toUpperCase()} rule`,
      placeHolder: `Enter the rule text for ${ruleType}`,
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "Rule text is required";
        }
        return null;
      },
    });

    if (!ruleText) return;

    // Read current board
    const content = fs.readFileSync(this._boardFilePath, "utf8");
    const board = BrainfileParser.parse(content);
    if (!board) return;

    // Initialize rules if not present
    if (!board.rules) {
      board.rules = {
        always: [],
        never: [],
        prefer: [],
        context: [],
      };
    }

    // Ensure the rule type array exists
    if (!board.rules[ruleType]) {
      board.rules[ruleType] = [];
    }

    // Generate next rule ID for this type
    const existingIds = board.rules[ruleType].map((r) => r.id);
    const maxId = Math.max(0, ...existingIds);
    const newRuleId = maxId + 1;

    // Add the new rule
    board.rules[ruleType].push({
      id: newRuleId,
      rule: ruleText.trim(),
    });

    // Save the updated board
    const newContent = BrainfileSerializer.serialize(board);
    fs.writeFileSync(this._boardFilePath, newContent, "utf8");

    // Update hash to prevent double update
    this._lastContentHash = this.hashContent(newContent);

    log(`Added new ${ruleType} rule with id ${newRuleId}`);

    // Update the view with the new content
    this.updateView(false, newContent);
  }

  private async handleEditRule(
    ruleId: string,
    ruleType: "always" | "never" | "prefer" | "context"
  ) {
    if (!this._boardFilePath) return;

    try {
      log(`Opening rule ${ruleId} in ${ruleType} section in editor`);

      // Read the file content
      const content = fs.readFileSync(this._boardFilePath, "utf8");

      // Convert ruleId to number and find the rule location
      const ruleIdNum = parseInt(ruleId);
      const location = BrainfileParser.findRuleLocation(
        content,
        ruleIdNum,
        ruleType
      );

      if (!location) {
        vscode.window.showErrorMessage(
          `Could not find rule ${ruleId} in ${ruleType} section`
        );
        return;
      }

      // Check if the document is already open in a visible editor
      const uri = vscode.Uri.file(this._boardFilePath);
      let editor = vscode.window.visibleTextEditors.find(
        (editor) => editor.document.uri.toString() === uri.toString()
      );

      if (editor) {
        // Document is already open, just focus it and move cursor
        const position = new vscode.Position(
          location.line - 1,
          location.column
        );
        const range = new vscode.Range(position, position);

        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

        // Focus the existing editor
        await vscode.window.showTextDocument(editor.document, {
          viewColumn: editor.viewColumn,
          preserveFocus: false,
        });
      } else {
        // Document is not open, open it in a new editor
        const document = await vscode.workspace.openTextDocument(uri);
        const position = new vscode.Position(
          location.line - 1,
          location.column
        );
        const range = new vscode.Range(position, position);

        editor = await vscode.window.showTextDocument(document, {
          selection: range,
          viewColumn: vscode.ViewColumn.Beside, // Open beside the webview
          preserveFocus: false, // Give focus to the editor
        });
      }

      log(`Opened editor at line ${location.line} for rule ${ruleId}`);
    } catch (error) {
      log("Error opening rule in editor:", error);
      vscode.window.showErrorMessage("Failed to open rule in editor");
    }
  }

  private async handleDeleteRule(
    ruleId: string,
    ruleType: "always" | "never" | "prefer" | "context"
  ) {
    if (!this._boardFilePath) return;

    // Show confirmation dialog
    const confirm = await vscode.window.showWarningMessage(
      `Delete ${ruleType} rule ${ruleId}?`,
      "Delete",
      "Cancel"
    );

    if (confirm !== "Delete") return;

    // Read current board
    const content = fs.readFileSync(this._boardFilePath, "utf8");
    const board = BrainfileParser.parse(content);
    if (!board || !board.rules) return;

    // Check if the rule type exists
    if (!board.rules[ruleType]) return;

    // Find and remove the rule (convert ruleId to number for comparison)
    const ruleIdNum = parseInt(ruleId);
    const ruleIndex = board.rules[ruleType].findIndex(
      (r) => r.id === ruleIdNum
    );
    if (ruleIndex !== -1) {
      board.rules[ruleType].splice(ruleIndex, 1);

      // Save the updated board
      const newContent = BrainfileSerializer.serialize(board);
      fs.writeFileSync(this._boardFilePath, newContent, "utf8");

      // Update hash to prevent double update
      this._lastContentHash = this.hashContent(newContent);

      log(`Deleted ${ruleType} rule ${ruleId}`);

      // Update the view with the new content
      this.updateView(false, newContent);
    }
  }

  private handleArchiveTask(columnId: string, taskId: string) {
    if (!this._boardFilePath) return;

    log(`Archiving task ${taskId} from column ${columnId}`);

    // Read main board
    const content = fs.readFileSync(this._boardFilePath, "utf8");
    const board = BrainfileParser.parse(content);
    if (!board) return;

    // Find and remove the task from the column
    let taskToArchive = null;
    for (const col of board.columns) {
      if (col.id === columnId) {
        const taskIndex = col.tasks.findIndex((t) => t.id === taskId);
        if (taskIndex !== -1) {
          taskToArchive = col.tasks.splice(taskIndex, 1)[0];
          break;
        }
      }
    }

    if (!taskToArchive) {
      log("Task not found");
      return;
    }

    // Save updated main board (without the archived task)
    const newContent = BrainfileSerializer.serialize(board);
    fs.writeFileSync(this._boardFilePath, newContent, "utf8");

    // Update hash to prevent double update
    this._lastContentHash = this.hashContent(newContent);

    // Get archive file path
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    const rootPath = workspaceFolders[0].uri.fsPath;
    const mainFilename = path.basename(this._boardFilePath);
    const archiveFilename = mainFilename.replace(/\.md$/, "-archive.md");
    const archivePath = path.join(rootPath, archiveFilename);

    // Read or create archive file
    let archiveBoard: Board;
    if (fs.existsSync(archivePath)) {
      const archiveContent = fs.readFileSync(archivePath, "utf8");
      const parsed = BrainfileParser.parse(archiveContent);
      if (parsed) {
        archiveBoard = parsed;
      } else {
        archiveBoard = this.createEmptyArchiveBoard();
      }
    } else {
      archiveBoard = this.createEmptyArchiveBoard();
    }

    // Add task to archive
    if (!archiveBoard.archive) {
      archiveBoard.archive = [];
    }
    archiveBoard.archive.unshift(taskToArchive); // Add to beginning

    // Save archive file
    const archiveContent = BrainfileSerializer.serialize(archiveBoard);
    fs.writeFileSync(archivePath, archiveContent, "utf8");

    log("Task archived successfully");
    vscode.window.showInformationMessage(
      `Task "${taskToArchive.title}" archived`
    );

    // Immediately update the view with the new content
    this.updateView(false, newContent);
  }

  private createEmptyArchiveBoard(): Board {
    return {
      title: "Archive",
      columns: [],
      archive: [],
    };
  }

  private getNonce(): string {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private getDynamicPriorityCSS(): string {
    const config = vscode.workspace.getConfiguration("brainfile.priorities");

    // Built-in priority colors from settings
    const criticalColor = config.get<string>("criticalColor", "#ffffff");
    const highColor = config.get<string>("highColor", "#cccccc");
    const mediumColor = config.get<string>("mediumColor", "#999999");
    const lowColor = config.get<string>("lowColor", "#666666");
    const customPriorities = config.get<Record<string, string>>("custom", {});

    let css = "/* Priority colors from settings */\n";

    // Override built-in priority colors
    css += `    .task.priority-critical { border-left-color: ${criticalColor}; }\n`;
    css += `    .task-priority-label.priority-critical { color: ${criticalColor}; }\n`;
    css += `    .task.priority-high { border-left-color: ${highColor}; }\n`;
    css += `    .task-priority-label.priority-high { color: ${highColor}; }\n`;
    css += `    .task.priority-medium { border-left-color: ${mediumColor}; }\n`;
    css += `    .task-priority-label.priority-medium { color: ${mediumColor}; }\n`;
    css += `    .task.priority-low { border-left-color: ${lowColor}; }\n`;
    css += `    .task-priority-label.priority-low { color: ${lowColor}; }\n`;

    // Custom priorities
    for (const [priority, color] of Object.entries(customPriorities)) {
      const className = getPriorityClassName(priority);
      css += `    .task.${className} { border-left-color: ${color}; }\n`;
      css += `    .task-priority-label.${className} { color: ${color}; }\n`;
    }

    return css;
  }

  private getWebviewHtml(webview: vscode.Webview): string {
    const nonce = this.getNonce();
    const distPath = path.join(this._extensionUri.fsPath, "media", "webview");
    const manifestInVite = path.join(distPath, ".vite", "manifest.json");
    const manifestPath = fs.existsSync(manifestInVite)
      ? manifestInVite
      : path.join(distPath, "manifest.json");

    if (!fs.existsSync(manifestPath)) {
      const message = "Webview assets not found. Run npm run webview:build.";
      log(message);
      return `<html><body><p>${message}</p></body></html>`;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const entry = manifest["index.html"] ?? manifest["src/main.ts"];

    if (!entry || !entry.file) {
      const message = "Invalid Vite manifest for webview.";
      log(message);
      return `<html><body><p>${message}</p></body></html>`;
    }

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "webview", entry.file)
    );

    const styles = (entry.css ?? []).map((cssPath: string) =>
      webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, "media", "webview", cssPath)
      )
    );

    const csp = [
      `default-src 'none';`,
      `img-src ${webview.cspSource} https: data:;`,
      `style-src ${webview.cspSource} 'unsafe-inline';`,
      `font-src ${webview.cspSource};`,
      `script-src 'nonce-${nonce}';`,
    ].join(" ");

    const styleTags = styles
      .map((href: vscode.Uri) => `<link rel="stylesheet" href="${href}">`)
      .join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  ${styleTags}
</head>
<body>
  <div id="app"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose() {
    // Clean up all resources properly
    this.disposeWatchers();

    // Clear any pending timers
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = undefined;
    }

    // Dispose all tracked disposables
    this._disposables.forEach((d) => {
      try {
        d.dispose();
      } catch (error) {
        log("Error disposing resource:", error);
      }
    });
    this._disposables = [];

    // Clear view reference
    this._view = undefined;

    log("BoardViewProvider disposed");
  }
}
