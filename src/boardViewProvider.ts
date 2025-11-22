import * as fs from "fs";
import { marked } from "marked";
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
  escapeHtml,
  getPriorityClassName,
  getSubtaskProgress,
  getCompletedSubtaskCount,
  generateStatsHtml,
  generateErrorHtml,
  // Agent utilities
  buildAgentPrompt,
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
        log("Priority settings changed, forcing full refresh");
        this.updateView(true); // Force full refresh to regenerate CSS
      }
    });

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((data) => {
      log("Received message from webview:", data.type, data);
      switch (data.type) {
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
          // Send available agents to webview
          const agents = this.detectAvailableAgents();
          const defaultAgent = this.getDefaultAgent();
          this._view?.webview.postMessage({
            type: "agentsDetected",
            agents,
            defaultAgent,
            lastUsed: this._lastUsedAgent
          });
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

        // If we have a last valid board, show it with a warning banner
        if (this._lastValidBoard && this._parseErrorCount <= 3) {
          log("Showing last valid board with warning");
          // Send a warning message to the webview
          if (!this._isFirstRender) {
            this._view.webview.postMessage({
              type: "parseWarning",
              message: "Syntax error in brainfile.md - showing last valid state",
            });
          }
          // Don't update the view, keep showing the last valid board
          return;
        }

        // If no valid board or too many consecutive errors, show error page with lint results
        const lintResult = BrainfileLinter.lint(content);
        this._view.webview.html = generateErrorHtml({
          message: "Failed to parse brainfile.md",
          details: "Check for YAML syntax errors in the frontmatter. Common issues:\n• Missing colons after keys\n• Incorrect indentation\n• Unclosed quotes or brackets",
          lintResult,
        });
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

      // Debug log for subtasks
      board.columns.forEach((col) => {
        col.tasks.forEach((task) => {
          if (task.subtasks) {
            log(`Task ${task.id} has ${task.subtasks.length} subtasks`);
          }
        });
      });

      // Always use full HTML refresh for reliable updates
      log("Setting full HTML (firstRender:", this._isFirstRender, "forceRefresh:", forceFullRefresh, ")");
      this._view.webview.html = this.getTasksHtml(board);
      this._isFirstRender = false;
      this._lastValidBoard = board;
      this._lastContentHash = newHash;
    } catch (error) {
      log("Error updating view:", error);
      vscode.window.showErrorMessage("Failed to update Brainfile board view");
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

  private getTasksHtml(board: Board): string {
    // Calculate progress metrics
    const totalTasks = board.columns.reduce(
      (sum, col) => sum + col.tasks.length,
      0
    );
    const doneColumn = board.columns.find((col) => col.id === "done");
    const doneTasks = doneColumn ? doneColumn.tasks.length : 0;
    const progressPercent =
      totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    // Extract unique filter values from all tasks
    const allTasks = board.columns.flatMap((col) => col.tasks);
    const uniqueTags = new Set<string>();
    const uniqueAssignees = new Set<string>();
    const uniquePriorities = new Set<string>();

    allTasks.forEach((task) => {
      if (task.tags) {
        task.tags.forEach((tag) => uniqueTags.add(tag));
      }
      if (task.assignee) {
        uniqueAssignees.add(task.assignee);
      }
      if (task.priority) {
        uniquePriorities.add(task.priority);
      }
    });

    // Sort the unique values
    const sortedTags = Array.from(uniqueTags).sort();
    const sortedAssignees = Array.from(uniqueAssignees).sort();
    const priorityOrder = ["critical", "high", "medium", "low"];
    const sortedPriorities = Array.from(uniquePriorities).sort((a, b) => {
      return priorityOrder.indexOf(a) - priorityOrder.indexOf(b);
    });

    // Generate nonce for CSP
    const nonce = this.getNonce();

    // Get URI for external stylesheet
    const styleUri = this._view?.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'board.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${
    this._view?.webview.cspSource
  } 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Brainfile Tasks</title>
  <link rel="stylesheet" href="${styleUri}">
  <style>
    /* Dynamic priority colors from settings */
    ${this.getDynamicPriorityCSS()}

  </style>
</head>
<body>
  <div id="toast" class="toast"></div>
  <div class="header-top">
    <div class="board-title-wrapper">
      <div class="board-title" id="boardTitle">${escapeHtml(
        board.title
      )}</div>
      <button class="title-edit-btn" id="titleEditBtn" title="Edit title">✎</button>
    </div>
  </div>

  <div class="tabs">
    <button class="tab active" data-tab="tasks">
      Tasks
      <span class="tab-indicator"></span>
    </button>
    <button class="tab" data-tab="rules">
      Rules
      <span class="tab-indicator"></span>
    </button>
    <button class="tab" data-tab="archive">
      Archive
      <span class="tab-indicator"></span>
    </button>
    <button class="settings-gear" id="openSettings" title="Open Settings">⚙</button>
  </div>

  <div class="tab-content active" id="tasksTab">
    <div class="board-header">
      <div class="progress-section">
        <div class="progress-label">
          <span>Progress</span>
          <span class="progress-percent">${progressPercent}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progressPercent}%"></div>
        </div>
      </div>

      <div class="stats">
        ${generateStatsHtml(board, totalTasks)}
      </div>
    </div>

    <!-- Search Section -->
    <div class="search-section">
      <div class="search-container">
        <input type="text"
               id="searchInput"
               class="search-input"
               placeholder="Search tasks..."
               autocomplete="off">
        <button id="searchClear" class="search-clear" style="display: none;">×</button>
      </div>
    </div>

    ${[...board.columns]
      .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
      .map(
        (col) => `
      <div class="column-section" data-column-id="${col.id}">
        <div class="column-header">
          <div class="column-header-title">
            <span class="collapse-icon">▼</span>
            <span>${escapeHtml(col.title)}</span>
          </div>
          <div class="column-header-right">
            <button class="add-task-btn" data-column-id="${
              col.id
            }" title="Add task to ${escapeHtml(col.title)}">+</button>
            <span class="task-count">${col.tasks.length}</span>
          </div>
        </div>
        ${
          col.tasks.length === 0
            ? '<div class="empty-state">No tasks</div>'
            : col.tasks
                .map(
                  (task, index) => `
            <div class="task ${task.priority ? getPriorityClassName(task.priority) : ""}"
                 data-task-id="${task.id}"
                 data-column-id="${col.id}"
                 data-priority="${task.priority || ""}"
                 data-assignee="${task.assignee || ""}"
                 data-tags="${
                   task.tags ? escapeHtml(JSON.stringify(task.tags)) : "[]"
                 }"
                 draggable="true">
              <div class="task-header">
                <span class="drag-handle">⋮⋮</span>
                <div class="task-title">${escapeHtml(task.title)}</div>
                <div class="task-id" data-task-id="${task.id}" title="Click to copy">${task.id}</div>
                <div class="task-actions">
                  <button class="task-action edit" data-action="edit" title="Edit">✎</button>
                  ${
                    col.id === "done"
                      ? '<button class="task-action archive" data-action="archive" title="Archive">⬇</button>'
                      : '<button class="task-action complete" data-action="complete" title="Mark as done">✓</button>'
                  }
                  <button class="task-action delete" data-action="delete" title="Delete">×</button>
                  <div class="agent-split-btn">
                    <button class="agent-primary" data-action="send-agent-default" title="Send to agent">▷</button>
                    <button class="agent-dropdown-toggle" data-action="agent-dropdown" title="Choose agent">▾</button>
                    <div class="agent-dropdown-menu" style="display: none;">
                      <button class="agent-option" data-agent="copilot">Copilot</button>
                      ${this.isCursorIDE() ? '<button class="agent-option" data-agent="cursor">Cursor</button>' : ''}
                      <button class="agent-option" data-agent="claude-code">Claude</button>
                      <div class="agent-divider"></div>
                      <button class="agent-option" data-agent="copy">Copy prompt</button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="task-description">${this.renderMarkdown(
                task.description || ""
              )}</div>
              ${
                task.priority || task.assignee || (task.tags && task.tags.length > 0)
                  ? `
                <div class="task-metadata">
                  ${task.priority ? `<span class="task-priority-label ${getPriorityClassName(task.priority)}" data-task-id="${task.id}" title="Click to change priority">${escapeHtml(task.priority.toUpperCase())}</span>` : ""}
                  ${
                    task.assignee
                      ? `<span class="task-assignee">${escapeHtml(
                          task.assignee
                        )}</span>`
                      : ""
                  }
                  ${
                    task.tags && task.tags.length > 0
                      ? task.tags
                          .map(
                            (tag) =>
                              `<span class="task-tag">${escapeHtml(tag)}</span>`
                          )
                          .join("")
                      : ""
                  }
                </div>
              `
                  : ""
              }
              ${
                task.subtasks && task.subtasks.length > 0
                  ? `
                <div class="subtasks-container">
                  <div class="subtask-progress">
                    <div class="subtask-progress-bar">
                      <div class="subtask-progress-fill" style="width: ${getSubtaskProgress(
                        task.subtasks
                      )}%"></div>
                    </div>
                    <span class="subtask-count">${getCompletedSubtaskCount(
                      task.subtasks
                    )}/${task.subtasks.length}</span>
                  </div>
                  <ul class="subtask-list">
                    ${task.subtasks
                      .map(
                        (subtask) => `
                      <li class="subtask-item ${
                        subtask.completed ? "completed" : ""
                      }" data-task-id="${task.id}" data-subtask-id="${
                          subtask.id
                        }">
                        <div class="subtask-checkbox"></div>
                        <span class="subtask-title">${escapeHtml(
                          subtask.title
                        )}</span>
                      </li>
                    `
                      )
                      .join("")}
                  </ul>
                </div>
              `
                  : ""
              }
              ${
                task.relatedFiles && task.relatedFiles.length > 0
                  ? `
                <div class="task-related-files">
                  ${task.relatedFiles
                    .map(
                      (file) => `
                    <div class="related-file" data-file="${escapeHtml(
                      file
                    )}">📄 ${escapeHtml(file)}</div>
                  `
                    )
                    .join("")}
                </div>
              `
                  : ""
              }
            </div>
          `
                )
                .join("")
        }
      </div>
    `
      )
      .join("")}
  </div>

  <div class="tab-content" id="rulesTab">
    ${
      board.rules
        ? `
      <div class="rules-view">
        <div class="rules-category">
          <div class="rules-category-header">
            <div class="rules-category-title">ALWAYS</div>
            <button class="add-rule-btn" data-rule-type="always" title="Add always rule">+</button>
          </div>
          ${
            board.rules.always && board.rules.always.length > 0
              ? board.rules.always
                  .map(
                    (rule) => `
            <div class="rule-item-full" data-rule-id="${
              rule.id
            }" data-rule-type="always">
              <div class="rule-number">${rule.id}</div>
              <div class="rule-text">${escapeHtml(rule.rule)}</div>
              <div class="rule-actions">
                <button class="rule-action edit" data-action="edit-rule" title="Edit">✎</button>
                <button class="rule-action delete" data-action="delete-rule" title="Delete">×</button>
              </div>
            </div>
          `
                  )
                  .join("")
              : '<div class="empty-state">No always rules</div>'
          }
        </div>

        <div class="rules-category">
          <div class="rules-category-header">
            <div class="rules-category-title">NEVER</div>
            <button class="add-rule-btn" data-rule-type="never" title="Add never rule">+</button>
          </div>
          ${
            board.rules.never && board.rules.never.length > 0
              ? board.rules.never
                  .map(
                    (rule) => `
            <div class="rule-item-full" data-rule-id="${
              rule.id
            }" data-rule-type="never">
              <div class="rule-number">${rule.id}</div>
              <div class="rule-text">${escapeHtml(rule.rule)}</div>
              <div class="rule-actions">
                <button class="rule-action edit" data-action="edit-rule" title="Edit">✎</button>
                <button class="rule-action delete" data-action="delete-rule" title="Delete">×</button>
              </div>
            </div>
          `
                  )
                  .join("")
              : '<div class="empty-state">No never rules</div>'
          }
        </div>

        <div class="rules-category">
          <div class="rules-category-header">
            <div class="rules-category-title">PREFER</div>
            <button class="add-rule-btn" data-rule-type="prefer" title="Add prefer rule">+</button>
          </div>
          ${
            board.rules.prefer && board.rules.prefer.length > 0
              ? board.rules.prefer
                  .map(
                    (rule) => `
            <div class="rule-item-full" data-rule-id="${
              rule.id
            }" data-rule-type="prefer">
              <div class="rule-number">${rule.id}</div>
              <div class="rule-text">${escapeHtml(rule.rule)}</div>
              <div class="rule-actions">
                <button class="rule-action edit" data-action="edit-rule" title="Edit">✎</button>
                <button class="rule-action delete" data-action="delete-rule" title="Delete">×</button>
              </div>
            </div>
          `
                  )
                  .join("")
              : '<div class="empty-state">No prefer rules</div>'
          }
        </div>

        <div class="rules-category">
          <div class="rules-category-header">
            <div class="rules-category-title">CONTEXT</div>
            <button class="add-rule-btn" data-rule-type="context" title="Add context rule">+</button>
          </div>
          ${
            board.rules.context && board.rules.context.length > 0
              ? board.rules.context
                  .map(
                    (rule) => `
            <div class="rule-item-full" data-rule-id="${
              rule.id
            }" data-rule-type="context">
              <div class="rule-number">${rule.id}</div>
              <div class="rule-text">${escapeHtml(rule.rule)}</div>
              <div class="rule-actions">
                <button class="rule-action edit" data-action="edit-rule" title="Edit">✎</button>
                <button class="rule-action delete" data-action="delete-rule" title="Delete">×</button>
              </div>
            </div>
          `
                  )
                  .join("")
              : '<div class="empty-state">No context rules</div>'
          }
        </div>
      </div>
    `
        : '<div class="empty-state">No rules defined</div>'
    }
  </div>

  <div class="tab-content" id="archiveTab">
    ${
      board.archive && board.archive.length > 0
        ? `
      <div class="archive-view">
        ${board.archive
          .map(
            (task) => `
          <div class="task archived-task" data-task-id="${task.id}">
            <div class="task-header">
              <div class="task-title">${escapeHtml(task.title)}</div>
            </div>
            <div class="task-id" data-task-id="${task.id}" title="Click to copy task ID">${task.id}</div>
            <div class="task-description">${this.renderMarkdown(
              task.description
            )}</div>
            ${
              task.relatedFiles && task.relatedFiles.length > 0
                ? `
              <div class="task-related-files">
                ${task.relatedFiles
                  .map(
                    (file) => `
                  <div class="related-file" data-file="${escapeHtml(
                    file
                  )}">📄 ${escapeHtml(file)}</div>
                `
                  )
                  .join("")}
              </div>
            `
                : ""
            }
          </div>
        `
          )
          .join("")}
      </div>
    `
        : '<div class="empty-state">No archived tasks</div>'
    }
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const IS_CURSOR = ${this.isCursorIDE()};

    class DragController {
      constructor(root) {
        this.root = root;
        this.dragState = null;
        this.dropSlot = null;
        this.activeColumn = null;
        this.rafId = null;
        this.pendingRender = null;
      }

      init() {
        if (!this.root) return;
        this.root.addEventListener('dragstart', (e) => this.onDragStart(e));
        this.root.addEventListener('dragend', () => this.onDragEnd());
        this.root.addEventListener('dragover', (e) => this.onDragOver(e));
        this.root.addEventListener('drop', (e) => this.onDrop(e));
        this.root.addEventListener('dragleave', (e) => this.onDragLeave(e));
      }

      onDragStart(e) {
        const task = e.target.closest('.task');
        if (!task) return;
        const column = task.closest('.column-section');
        if (!column) return;

        this.dragState = {
          taskId: task.dataset.taskId,
          fromColumnId: task.dataset.columnId
        };

        task.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', task.dataset.taskId || '');
        }
        this.setActiveColumn(column);
      }

      onDragOver(e) {
        if (!this.dragState) return;
        const column = e.target.closest('.column-section');
        if (!column) return;

        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'move';
        }

        this.scheduleRender(column, e.clientY);
      }

      onDrop(e) {
        if (!this.dragState) return;
        const column = e.target.closest('.column-section');
        if (!column) return;

        e.preventDefault();

        const toIndex = this.getPlannedIndex(column, e.clientY);
        vscode.postMessage({
          type: 'moveTask',
          taskId: this.dragState.taskId,
          fromColumn: this.dragState.fromColumnId,
          toColumn: column.dataset.columnId,
          toIndex: toIndex
        });

        this.reset();
      }

      onDragEnd() {
        this.reset();
      }

      onDragLeave(e) {
        if (!this.dragState) return;
        const related = e.relatedTarget;
        if (!related || !this.root.contains(related)) {
          this.clearSlot();
          this.clearActiveColumn();
        }
      }

      scheduleRender(column, y) {
        this.pendingRender = { column, y };
        if (this.rafId) return;
        this.rafId = requestAnimationFrame(() => {
          this.rafId = null;
          if (!this.pendingRender) return;
          const { column: pendingColumn, y: pendingY } = this.pendingRender;
          this.pendingRender = null;
          this.renderSlot(pendingColumn, pendingY);
        });
      }

      renderSlot(column, y) {
        const tasks = Array.from(column.querySelectorAll('.task:not(.dragging)'));
        let index = tasks.length;

        for (let i = 0; i < tasks.length; i++) {
          const rect = tasks[i].getBoundingClientRect();
          if (y < rect.top + rect.height / 2) {
            index = i;
            break;
          }
        }

        this.ensureDropSlot();
        this.dropSlot.dataset.index = String(index);
        if (index >= tasks.length) {
          column.appendChild(this.dropSlot);
        } else {
          column.insertBefore(this.dropSlot, tasks[index]);
        }

        this.setActiveColumn(column);
      }

      ensureDropSlot() {
        if (this.dropSlot) return;
        this.dropSlot = document.createElement('div');
        this.dropSlot.className = 'drop-slot';
      }

      getPlannedIndex(column, y) {
        if (this.dropSlot && this.dropSlot.parentElement === column && this.dropSlot.dataset.index) {
          const parsed = parseInt(this.dropSlot.dataset.index, 10);
          if (!Number.isNaN(parsed)) {
            return parsed;
          }
        }
        return this.getIndexFromY(column, y);
      }

      getIndexFromY(column, y) {
        const tasks = Array.from(column.querySelectorAll('.task:not(.dragging)'));
        for (let i = 0; i < tasks.length; i++) {
          const rect = tasks[i].getBoundingClientRect();
          if (y < rect.top + rect.height / 2) {
            return i;
          }
        }
        return tasks.length;
      }

      setActiveColumn(column) {
        if (this.activeColumn === column) return;
        if (this.activeColumn) {
          this.activeColumn.classList.remove('drag-target');
        }
        this.activeColumn = column;
        this.activeColumn.classList.add('drag-target');
      }

      clearActiveColumn() {
        if (this.activeColumn) {
          this.activeColumn.classList.remove('drag-target');
          this.activeColumn = null;
        }
      }

      clearSlot() {
        if (this.dropSlot && this.dropSlot.parentElement) {
          this.dropSlot.parentElement.removeChild(this.dropSlot);
        }
        this.dropSlot = null;
      }

      clearDraggingClass() {
        this.root.querySelectorAll('.task.dragging').forEach(task => task.classList.remove('dragging'));
      }

      reset() {
        this.clearSlot();
        this.clearActiveColumn();
        this.clearDraggingClass();
        this.dragState = null;
      }
    }

    let dragController = null;

    function initDragAndDrop() {
      const tasksTab = document.getElementById('tasksTab');
      if (!tasksTab) return;
      if (!dragController) {
        dragController = new DragController(tasksTab);
        dragController.init();
      } else {
        dragController.reset();
      }
    }


    // Search state and logic
    let searchTerm = '';

    function applySearch() {
      const tasks = document.querySelectorAll('.task');

      tasks.forEach(task => {
        let shouldShow = true;

        // Search filter - check title and description
        if (searchTerm) {
          const searchLower = searchTerm.toLowerCase();
          const title = task.querySelector('.task-title')?.textContent?.toLowerCase() || '';
          const description = task.querySelector('.task-description')?.textContent?.toLowerCase() || '';
          const tags = task.querySelector('.task-metadata')?.textContent?.toLowerCase() || '';

          if (!title.includes(searchLower) && !description.includes(searchLower) && !tags.includes(searchLower)) {
            shouldShow = false;
          }
        }

        // Apply visibility
        if (shouldShow) {
          task.classList.remove('filtered-out');
        } else {
          task.classList.add('filtered-out');
        }
      });

      // Update column empty states
      document.querySelectorAll('.column-section').forEach(column => {
        const visibleTasks = column.querySelectorAll('.task:not(.filtered-out)');
        const emptyState = column.querySelector('.empty-state');

        if (visibleTasks.length === 0 && column.querySelectorAll('.task').length > 0) {
          column.classList.add('all-filtered');
          if (emptyState) {
            emptyState.style.display = 'block';
            emptyState.textContent = 'No matching tasks';
          }
        } else {
          column.classList.remove('all-filtered');
          if (emptyState && column.querySelectorAll('.task').length > 0) {
            emptyState.style.display = 'none';
          }
        }
      });
    }

    // Search input handler
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchTerm = e.target.value;
        searchClear.style.display = e.target.value ? 'block' : 'none';
        applySearch();
      });
    }

    if (searchClear) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchTerm = '';
        searchClear.style.display = 'none';
        applySearch();
      });
    }

    // Task expansion
    document.querySelectorAll('.task').forEach(taskEl => {
      taskEl.addEventListener('click', (e) => {
        if (e.target.closest('.task-action') || e.target.closest('.drag-handle') || e.target.closest('.related-file') || e.target.closest('.subtask-item') || e.target.closest('.task-id') || e.target.closest('.task-priority-label')) {
          return;
        }
        taskEl.classList.toggle('expanded');
      });
    });

    // Subtask checkbox clicks
    document.querySelectorAll('.subtask-item').forEach(subtaskEl => {
      subtaskEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = subtaskEl.dataset.taskId;
        const subtaskId = subtaskEl.dataset.subtaskId;
        vscode.postMessage({
          type: 'toggleSubtask',
          taskId: taskId,
          subtaskId: subtaskId
        });
      });
    });

    // Related file clicks
    document.querySelectorAll('.related-file').forEach(fileEl => {
      fileEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const filePath = fileEl.dataset.file;
        if (filePath) {
          vscode.postMessage({
            type: 'openFile',
            filePath: filePath
          });
        }
      });
    });

    // Edit action - opens task in editor
    document.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskEl = e.target.closest('.task');
        const taskId = taskEl.dataset.taskId;

        // Send message to open task in editor
        vscode.postMessage({
          type: 'editTask',
          taskId: taskId
        });
      });
    });

    // Delete action
    document.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskEl = e.target.closest('.task');
        const taskId = taskEl.dataset.taskId;
        const columnId = taskEl.dataset.columnId;

        vscode.postMessage({
          type: 'deleteTask',
          columnId: columnId,
          taskId: taskId
        });
      });
    });

    // Archive action
    document.querySelectorAll('[data-action="archive"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskEl = e.target.closest('.task');
        const taskId = taskEl.dataset.taskId;
        const columnId = taskEl.dataset.columnId;

        vscode.postMessage({
          type: 'archiveTask',
          columnId: columnId,
          taskId: taskId
        });
      });
    });

    // Complete action - moves task to done
    document.querySelectorAll('[data-action="complete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskEl = e.target.closest('.task');
        const taskId = taskEl.dataset.taskId;
        const columnId = taskEl.dataset.columnId;

        vscode.postMessage({
          type: 'completeTask',
          columnId: columnId,
          taskId: taskId
        });
      });
    });

    // Agent split button - primary action (send to default agent)
    document.querySelectorAll('[data-action="send-agent-default"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskEl = e.target.closest('.task');
        const taskId = taskEl.dataset.taskId;
        vscode.postMessage({
          type: 'sendToAgent',
          taskId: taskId
          // No agentType = use default
        });
      });
    });

    // Agent split button - dropdown toggle
    document.querySelectorAll('[data-action="agent-dropdown"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const splitBtn = e.target.closest('.agent-split-btn');
        const menu = splitBtn.querySelector('.agent-dropdown-menu');
        const isVisible = menu.style.display !== 'none';

        // Close all other dropdowns first
        document.querySelectorAll('.agent-dropdown-menu').forEach(m => {
          m.style.display = 'none';
        });

        if (!isVisible) {
          menu.style.display = 'block';
        }
      });
    });

    // Agent dropdown options
    document.querySelectorAll('.agent-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const agentType = e.target.dataset.agent;
        const taskEl = e.target.closest('.task');
        const taskId = taskEl.dataset.taskId;

        // Close dropdown
        const menu = e.target.closest('.agent-dropdown-menu');
        menu.style.display = 'none';

        vscode.postMessage({
          type: 'sendToAgent',
          taskId: taskId,
          agentType: agentType
        });
      });
    });

    // Close dropdown when clicking elsewhere
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.agent-split-btn')) {
        document.querySelectorAll('.agent-dropdown-menu').forEach(m => {
          m.style.display = 'none';
        });
      }
    });

    // Copy task ID to clipboard
    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2000);
    }

    document.querySelectorAll('.task-id').forEach(idEl => {
      idEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = idEl.dataset.taskId;
        navigator.clipboard.writeText(taskId).then(() => {
          showToast('Copied: ' + taskId);
        }).catch(() => {
          showToast('Failed to copy');
        });
      });
    });

    // Priority label click to edit
    document.querySelectorAll('.task-priority-label').forEach(prioEl => {
      prioEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = prioEl.dataset.taskId;
        vscode.postMessage({
          type: 'editPriority',
          taskId: taskId
        });
      });
    });

    // Drag and drop
    initDragAndDrop();

    // Add task buttons
    document.querySelectorAll('.add-task-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const columnId = btn.dataset.columnId;
        vscode.postMessage({
          type: 'addTaskToColumn',
          columnId: columnId
        });
      });
    });

    // Add rule buttons
    document.querySelectorAll('.add-rule-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ruleType = btn.dataset.ruleType;
        vscode.postMessage({
          type: 'addRule',
          ruleType: ruleType
        });
      });
    });

    // Edit rule actions - opens rule in editor
    document.querySelectorAll('[data-action="edit-rule"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ruleEl = e.target.closest('.rule-item-full');
        const ruleId = ruleEl.dataset.ruleId;
        const ruleType = ruleEl.dataset.ruleType;

        vscode.postMessage({
          type: 'editRule',
          ruleId: ruleId,
          ruleType: ruleType
        });
      });
    });

    // Delete rule actions
    document.querySelectorAll('[data-action="delete-rule"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ruleEl = e.target.closest('.rule-item-full');
        const ruleId = ruleEl.dataset.ruleId;
        const ruleType = ruleEl.dataset.ruleType;

        vscode.postMessage({
          type: 'deleteRule',
          ruleId: ruleId,
          ruleType: ruleType
        });
      });
    });

    // Column collapse/expand
    document.querySelectorAll('.column-header').forEach(header => {
      header.addEventListener('click', (e) => {
        // Don't collapse if clicking on add button
        if (e.target.closest('.add-task-btn')) {
          return;
        }
        const columnSection = header.closest('.column-section');
        columnSection.classList.toggle('collapsed');
      });
    });

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;

        // Update tab buttons
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Remove change indicator when viewing the tab
        tab.classList.remove('has-changes');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
          content.classList.remove('active');
        });
        document.getElementById(tabName + 'Tab').classList.add('active');
      });
    });

    // Settings gear - open VS Code settings
    const settingsBtn = document.getElementById('openSettings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        vscode.postMessage({ type: 'openSettings' });
      });
    }

    // Title editing
    let originalTitle = '';

    const editTitle = () => {
      const titleEl = document.getElementById('boardTitle');
      originalTitle = titleEl.textContent;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'settings-input';
      input.value = originalTitle;
      input.style.fontSize = '14px';
      input.style.fontWeight = '600';
      input.style.padding = '4px 6px';

      titleEl.replaceWith(input);
      input.focus();
      input.select();

      const saveTitle = () => {
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== originalTitle) {
          vscode.postMessage({
            type: 'updateTitle',
            title: newTitle
          });
        }

        const titleDiv = document.createElement('div');
        titleDiv.className = 'board-title';
        titleDiv.id = 'boardTitle';
        titleDiv.textContent = newTitle || originalTitle;
        titleDiv.addEventListener('click', editTitle);

        input.replaceWith(titleDiv);
      };

      input.addEventListener('blur', saveTitle);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          saveTitle();
        } else if (e.key === 'Escape') {
          const titleDiv = document.createElement('div');
          titleDiv.className = 'board-title';
          titleDiv.id = 'boardTitle';
          titleDiv.textContent = originalTitle;
          titleDiv.addEventListener('click', editTitle);
          input.replaceWith(titleDiv);
        }
      });
    };

    document.getElementById('boardTitle').addEventListener('click', editTitle);
    document.getElementById('titleEditBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      editTitle();
    });

    // Clear cache button
    document.getElementById('clearCacheBtn').addEventListener('click', () => {
      vscode.postMessage({
        type: 'clearCache'
      });
    });

    // Save stats config button
    const saveStatsBtn = document.getElementById('saveStatsConfig');
    if (saveStatsBtn) {
      saveStatsBtn.addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('.stat-column-checkbox:checked');
        const selectedColumns = Array.from(checkboxes).map(cb => cb.dataset.columnId);

        vscode.postMessage({
          type: 'saveStatsConfig',
          columns: selectedColumns
        });
      });
    }

    // Handle board updates from file changes
    let previousBoard = ${JSON.stringify(board)};

    window.addEventListener('message', (event) => {
      const message = event.data;

      try {
        if (message.type === 'boardUpdate') {
          console.log('[Brainfile] Received boardUpdate message');
          const newBoard = message.board;
          const activeTabEl = document.querySelector('.tab.active');
          const activeTab = activeTabEl ? activeTabEl.dataset.tab : 'tasks';

          // Clear any parse warnings on successful update
          const warningBanner = document.getElementById('parseWarningBanner');
          if (warningBanner) {
            warningBanner.remove();
          }

          // Check what changed
          const tasksChanged = JSON.stringify(newBoard.columns) !== JSON.stringify(previousBoard.columns);
          const rulesChanged = JSON.stringify(newBoard.rules) !== JSON.stringify(previousBoard.rules);

          // Update indicators if not on active tab
          const tasksTabEl = document.querySelector('[data-tab="tasks"]');
          const rulesTabEl = document.querySelector('[data-tab="rules"]');
          if (activeTab !== 'tasks' && tasksChanged && tasksTabEl) {
            tasksTabEl.classList.add('has-changes');
          }
          if (activeTab !== 'rules' && rulesChanged && rulesTabEl) {
            rulesTabEl.classList.add('has-changes');
          }

          // Update the content
          previousBoard = newBoard;

          // Update title
          const titleEl = document.getElementById('boardTitle');
          if (titleEl && titleEl.textContent !== newBoard.title) {
            titleEl.textContent = newBoard.title;
          }

          // Rebuild the tabs content (but don't switch tabs)
          console.log('[Brainfile] Calling updateTabsContent');
          updateTabsContent(newBoard, activeTab);
          console.log('[Brainfile] updateTabsContent completed');
        } else if (message.type === 'parseWarning') {
          // Show warning banner if not already present
          let warningBanner = document.getElementById('parseWarningBanner');
          if (!warningBanner) {
            warningBanner = document.createElement('div');
            warningBanner.id = 'parseWarningBanner';
            warningBanner.style.cssText = 'background: var(--vscode-inputValidation-warningBackground); color: var(--vscode-inputValidation-warningForeground); border: 1px solid var(--vscode-inputValidation-warningBorder); padding: 8px 12px; margin: 8px; border-radius: 4px; font-size: 12px;';
            warningBanner.textContent = '⚠️ ' + message.message;
            document.body.insertBefore(warningBanner, document.body.firstChild);
          }
        }
      } catch (error) {
        console.error('[Brainfile] Error handling message:', error);
      }
    });

    function getSubtaskProgress(subtasks) {
      if (!subtasks || subtasks.length === 0) return 0;
      const completed = subtasks.filter(st => st.completed).length;
      return Math.round((completed / subtasks.length) * 100);
    }

    function getCompletedSubtaskCount(subtasks) {
      if (!subtasks) return 0;
      return subtasks.filter(st => st.completed).length;
    }

    function updateTabsContent(board, activeTab) {
      try {
        console.log('[Brainfile] updateTabsContent starting, activeTab:', activeTab);
        // Store currently expanded tasks before updating
        const expandedTasks = new Set();
        document.querySelectorAll('.task.expanded').forEach(task => {
          expandedTasks.add(task.dataset.taskId);
        });

        // Store current search state before updating
      const currentSearchTerm = searchTerm;

      // Update tasks tab
      const tasksTab = document.getElementById('tasksTab');
      tasksTab.innerHTML = \`
        <div class="board-header">
          <div class="progress-section">
            <div class="progress-label">
              <span>Progress</span>
              <span class="progress-percent">\${calculateProgress(board)}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: \${calculateProgress(board)}%"></div>
            </div>
          </div>

          <div class="stats">
            \${getStatsHtmlForUpdate(board)}
          </div>
        </div>

        <!-- Search Section -->
        <div class="search-section">
          <div class="search-container">
            <input type="text"
                   id="searchInput"
                   class="search-input"
                   placeholder="Search tasks..."
                   value="\${currentSearchTerm}"
                   autocomplete="off">
            <button id="searchClear" class="search-clear" style="display: \${currentSearchTerm ? 'block' : 'none'};">×</button>
          </div>
        </div>

        \${[...board.columns].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity)).map(col => \`
          <div class="column-section" data-column-id="\${col.id}">
            <div class="column-header">
              <div class="column-header-title">
                <span class="collapse-icon">▼</span>
                <span>\${escapeHtml(col.title)}</span>
              </div>
              <div class="column-header-right">
                <button class="add-task-btn" data-column-id="\${col.id}" title="Add task to \${escapeHtml(col.title)}">+</button>
                <span class="task-count">\${col.tasks.length}</span>
              </div>
            </div>
            \${col.tasks.length === 0
              ? '<div class="empty-state">No tasks</div>'
              : col.tasks.map((task, index) => \`
                <div class="task \${task.priority ? 'priority-' + task.priority.toLowerCase().replace(/[^a-z0-9]/g, '-') : ''}"
                     data-task-id="\${task.id}"
                     data-column-id="\${col.id}"
                     data-priority="\${task.priority || ''}"
                     data-assignee="\${task.assignee || ''}"
                     data-tags="\${task.tags ? escapeHtml(JSON.stringify(task.tags)) : '[]'}"
                     draggable="true">
                  <div class="task-header">
                    <span class="drag-handle">⋮⋮</span>
                    <div class="task-title">\${escapeHtml(task.title)}</div>
                    <div class="task-id" data-task-id="\${task.id}" title="Click to copy">\${task.id}</div>
                    <div class="task-actions">
                      <button class="task-action edit" data-action="edit" title="Edit">✎</button>
                    \${col.id === 'done' ? '<button class="task-action archive" data-action="archive" title="Archive">⬇</button>' : '<button class="task-action complete" data-action="complete" title="Mark as done">✓</button>'}
                      <button class="task-action delete" data-action="delete" title="Delete">×</button>
                      <div class="agent-split-btn">
                        <button class="agent-primary" data-action="send-agent-default" title="Send to agent">▷</button>
                        <button class="agent-dropdown-toggle" data-action="agent-dropdown" title="Choose agent">▾</button>
                        <div class="agent-dropdown-menu" style="display: none;">
                          <button class="agent-option" data-agent="copilot">Copilot</button>
                          \${IS_CURSOR ? '<button class="agent-option" data-agent="cursor">Cursor</button>' : ''}
                          <button class="agent-option" data-agent="claude-code">Claude</button>
                          <div class="agent-divider"></div>
                          <button class="agent-option" data-agent="copy">Copy prompt</button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="task-description">\${renderMarkdown(task.description || '')}</div>
                  \${(task.priority || task.assignee || (task.tags && task.tags.length > 0)) ? \`
                    <div class="task-metadata">
                      \${task.priority ? \`<span class="task-priority-label priority-\${task.priority.toLowerCase().replace(/[^a-z0-9]/g, '-')}" data-task-id="\${task.id}" title="Click to change priority">\${escapeHtml(task.priority.toUpperCase())}</span>\` : ''}
                      \${task.assignee ? \`<span class="task-assignee">\${escapeHtml(task.assignee)}</span>\` : ''}
                      \${task.tags && task.tags.length > 0 ? task.tags.map(tag =>
                        \`<span class="task-tag">\${escapeHtml(tag)}</span>\`
                      ).join('') : ''}
                    </div>
                  \` : ''}
                  \${task.subtasks && task.subtasks.length > 0 ? \`
                    <div class="subtasks-container">
                      <div class="subtask-progress">
                        <div class="subtask-progress-bar">
                          <div class="subtask-progress-fill" style="width: \${getSubtaskProgress(task.subtasks)}%"></div>
                        </div>
                        <span class="subtask-count">\${getCompletedSubtaskCount(task.subtasks)}/\${task.subtasks.length}</span>
                      </div>
                      <ul class="subtask-list">
                        \${task.subtasks.map(subtask => \`
                          <li class="subtask-item \${subtask.completed ? 'completed' : ''}" data-task-id="\${task.id}" data-subtask-id="\${subtask.id}">
                            <div class="subtask-checkbox"></div>
                            <span class="subtask-title">\${escapeHtml(subtask.title)}</span>
                          </li>
                        \`).join('')}
                      </ul>
                    </div>
                  \` : ''}
                  \${task.relatedFiles && task.relatedFiles.length > 0 ? \`
                    <div class="task-related-files">
                      \${task.relatedFiles.map(file => \`
                        <div class="related-file" data-file="\${file}">📄 \${file}</div>
                      \`).join('')}
                    </div>
                  \` : ''}
                </div>
              \`).join('')
            }
          </div>
        \`).join('')}
      \`;

      // Update rules tab
      const rulesTab = document.getElementById('rulesTab');
      rulesTab.innerHTML = board.rules ? \`
        <div class="rules-view">
          \${board.rules.always && board.rules.always.length > 0 ? \`
            <div class="rules-category">
              <div class="rules-category-title">ALWAYS</div>
              \${board.rules.always.map(rule => \`
                <div class="rule-item-full">
                  <div class="rule-number">\${rule.id}</div>
                  <div class="rule-text">\${escapeHtml(rule.rule)}</div>
                </div>
              \`).join('')}
            </div>
          \` : ''}

          \${board.rules.never && board.rules.never.length > 0 ? \`
            <div class="rules-category">
              <div class="rules-category-title">NEVER</div>
              \${board.rules.never.map(rule => \`
                <div class="rule-item-full">
                  <div class="rule-number">\${rule.id}</div>
                  <div class="rule-text">\${escapeHtml(rule.rule)}</div>
                </div>
              \`).join('')}
            </div>
          \` : ''}

          \${board.rules.prefer && board.rules.prefer.length > 0 ? \`
            <div class="rules-category">
              <div class="rules-category-title">PREFER</div>
              \${board.rules.prefer.map(rule => \`
                <div class="rule-item-full">
                  <div class="rule-number">\${rule.id}</div>
                  <div class="rule-text">\${escapeHtml(rule.rule)}</div>
                </div>
              \`).join('')}
            </div>
          \` : ''}

          \${board.rules.context && board.rules.context.length > 0 ? \`
            <div class="rules-category">
              <div class="rules-category-title">CONTEXT</div>
              \${board.rules.context.map(rule => \`
                <div class="rule-item-full">
                  <div class="rule-number">\${rule.id}</div>
                  <div class="rule-text">\${escapeHtml(rule.rule)}</div>
                </div>
              \`).join('')}
            </div>
          \` : ''}
        </div>
      \` : '<div class="empty-state">No rules defined</div>';

      // Update archive tab
      const archiveTab = document.getElementById('archiveTab');
      archiveTab.innerHTML = board.archive && board.archive.length > 0 ? \`
        <div class="archive-view">
          \${board.archive.map(task => \`
            <div class="task archived-task" data-task-id="\${task.id}">
              <div class="task-header">
                <div class="task-title">\${escapeHtml(task.title)}</div>
              </div>
              <div class="task-id" data-task-id="\${task.id}" title="Click to copy task ID">\${task.id}</div>
              <div class="task-description">\${renderMarkdown(task.description)}</div>
              \${task.relatedFiles && task.relatedFiles.length > 0 ? \`
                <div class="task-related-files">
                  \${task.relatedFiles.map(file => \`
                    <div class="related-file" data-file="\${escapeHtml(file)}">📄 \${escapeHtml(file)}</div>
                  \`).join('')}
                </div>
              \` : ''}
            </div>
          \`).join('')}
        </div>
      \` : '<div class="empty-state">No archived tasks</div>';

      // Re-attach event listeners for tasks
      attachTaskEventListeners();

      // Re-attach search event listeners
      attachSearchEventListeners();

      // Restore search state
      searchTerm = currentSearchTerm;

      // Apply search after restoring state
      applySearch();

      // Restore expanded state
      expandedTasks.forEach(taskId => {
        const taskEl = document.querySelector(\`.task[data-task-id="\${taskId}"]\`);
        if (taskEl) {
          taskEl.classList.add('expanded');
        }
      });
        console.log('[Brainfile] updateTabsContent completed successfully');
      } catch (error) {
        console.error('[Brainfile] Error in updateTabsContent:', error);
      }
    }

    function calculateProgress(board) {
      const total = board.columns.reduce((sum, col) => sum + col.tasks.length, 0);
      const done = board.columns.find(col => col.id === 'done')?.tasks.length || 0;
      return total > 0 ? Math.round((done / total) * 100) : 0;
    }

    function getTotalTasks(board) {
      return board.columns.reduce((sum, col) => sum + col.tasks.length, 0);
    }

    function getDoneTasks(board) {
      return board.columns.find(col => col.id === 'done')?.tasks.length || 0;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function renderMarkdown(text) {
      if (!text) return '';
      // Basic markdown rendering - you might want to use a library like marked for full support
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
        .replace(/\\n/g, '<br>');
    }

    function getStatsHtmlForUpdate(board) {
      const totalTasks = getTotalTasks(board);

      // Check if custom stat columns are configured
      if (board.statsConfig?.columns && board.statsConfig.columns.length > 0) {
        // Use configured columns (max 4)
        const statColumns = board.statsConfig.columns.slice(0, 4);
        return statColumns.map(columnId => {
          const column = board.columns.find(col => col.id === columnId);
          if (column) {
            return \`
              <div class="stat">
                <div class="stat-value">\${column.tasks.length}</div>
                <div class="stat-label">\${escapeHtml(column.title)}</div>
              </div>
            \`;
          }
          return '';
        }).join('');
      } else {
        // Default: Total and Done
        const doneTasks = getDoneTasks(board);
        return \`
          <div class="stat">
            <div class="stat-value">\${totalTasks}</div>
            <div class="stat-label">Total</div>
          </div>
          <div class="stat">
            <div class="stat-value">\${doneTasks}</div>
            <div class="stat-label">Done</div>
          </div>
        \`;
      }
    }

    function attachTaskEventListeners() {
      // Re-attach all task-related event listeners
      document.querySelectorAll('.task').forEach(taskEl => {
        taskEl.addEventListener('click', (e) => {
          if (e.target.closest('.task-action') || e.target.closest('.drag-handle') || e.target.closest('.related-file') || e.target.closest('.subtask-item') || e.target.closest('.task-id') || e.target.closest('.task-priority-label')) {
            return;
          }
          taskEl.classList.toggle('expanded');
        });
      });

      // Re-attach task-id copy clicks
      document.querySelectorAll('.task-id').forEach(idEl => {
        idEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const taskId = idEl.dataset.taskId;
          navigator.clipboard.writeText(taskId).then(() => {
            showToast('Copied: ' + taskId);
          }).catch(() => {
            showToast('Failed to copy');
          });
        });
      });

      // Re-attach priority label clicks
      document.querySelectorAll('.task-priority-label').forEach(prioEl => {
        prioEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const taskId = prioEl.dataset.taskId;
          vscode.postMessage({
            type: 'editPriority',
            taskId: taskId
          });
        });
      });

      // Re-attach subtask clicks
      document.querySelectorAll('.subtask-item').forEach(subtaskEl => {
        subtaskEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const taskId = subtaskEl.dataset.taskId;
          const subtaskId = subtaskEl.dataset.subtaskId;
          vscode.postMessage({
            type: 'toggleSubtask',
            taskId: taskId,
            subtaskId: subtaskId
          });
        });
      });

      // Related file clicks
      document.querySelectorAll('.related-file').forEach(fileEl => {
        fileEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const filePath = fileEl.dataset.file;
          if (filePath) {
            vscode.postMessage({
              type: 'openFile',
              filePath: filePath
            });
          }
        });
      });

      // Re-attach edit actions - opens task in editor
      document.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const taskEl = e.target.closest('.task');
          const taskId = taskEl.dataset.taskId;

          // Send message to open task in editor
          vscode.postMessage({
            type: 'editTask',
            taskId: taskId
          });
        });
      });

      document.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const taskEl = e.target.closest('.task');
          const taskId = taskEl.dataset.taskId;
          const columnId = taskEl.dataset.columnId;

          vscode.postMessage({
            type: 'deleteTask',
            columnId: columnId,
            taskId: taskId
          });
        });
      });

      // Archive action
      document.querySelectorAll('[data-action="archive"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const taskEl = e.target.closest('.task');
          const taskId = taskEl.dataset.taskId;
          const columnId = taskEl.dataset.columnId;

          vscode.postMessage({
            type: 'archiveTask',
            columnId: columnId,
            taskId: taskId
          });
        });
      });

      // Complete action - moves task to done
      document.querySelectorAll('[data-action="complete"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const taskEl = e.target.closest('.task');
          const taskId = taskEl.dataset.taskId;
          const columnId = taskEl.dataset.columnId;

          vscode.postMessage({
            type: 'completeTask',
            columnId: columnId,
            taskId: taskId
          });
        });
      });

      // Agent split button - primary action (send to default agent)
      document.querySelectorAll('[data-action="send-agent-default"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const taskEl = e.target.closest('.task');
          const taskId = taskEl.dataset.taskId;
          vscode.postMessage({
            type: 'sendToAgent',
            taskId: taskId
          });
        });
      });

      // Agent split button - dropdown toggle
      document.querySelectorAll('[data-action="agent-dropdown"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const splitBtn = e.target.closest('.agent-split-btn');
          const menu = splitBtn.querySelector('.agent-dropdown-menu');
          const isVisible = menu.style.display !== 'none';
          document.querySelectorAll('.agent-dropdown-menu').forEach(m => {
            m.style.display = 'none';
          });
          if (!isVisible) {
            menu.style.display = 'block';
          }
        });
      });

      // Agent dropdown options
      document.querySelectorAll('.agent-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const agentType = e.target.dataset.agent;
          const taskEl = e.target.closest('.task');
          const taskId = taskEl.dataset.taskId;
          const menu = e.target.closest('.agent-dropdown-menu');
          menu.style.display = 'none';
          vscode.postMessage({
            type: 'sendToAgent',
            taskId: taskId,
            agentType: agentType
          });
        });
      });

      // Re-attach add task buttons
      document.querySelectorAll('.add-task-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const columnId = btn.dataset.columnId;
          vscode.postMessage({
            type: 'addTaskToColumn',
            columnId: columnId
          });
        });
      });

      // Re-attach column collapse listeners
      document.querySelectorAll('.column-header').forEach(header => {
        header.addEventListener('click', (e) => {
          // Don't collapse if clicking on add button
          if (e.target.closest('.add-task-btn')) {
            return;
          }
          const columnSection = header.closest('.column-section');
          columnSection.classList.toggle('collapsed');
        });
      });

      // Reset drag and drop state
      initDragAndDrop();
    }

    function attachSearchEventListeners() {
      // Search input handler
      const searchInput = document.getElementById('searchInput');
      const searchClear = document.getElementById('searchClear');

      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          searchTerm = e.target.value;
          searchClear.style.display = e.target.value ? 'block' : 'none';
          applySearch();
        });
      }

      if (searchClear) {
        searchClear.addEventListener('click', () => {
          searchInput.value = '';
          searchTerm = '';
          searchClear.style.display = 'none';
          applySearch();
        });
      }
    }
  </script>
</body>
</html>`;
  }

  private renderMarkdown(text: string | undefined): string {
    if (!text) return "";

    // Configure marked for safe rendering
    marked.setOptions({
      breaks: true,
      gfm: true,
    });

    // Parse markdown and sanitize
    const html = marked.parse(text) as string;
    return html;
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
