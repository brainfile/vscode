import * as fs from "node:fs"
import * as path from "node:path"
import {
	type Board,
	BrainfileLinter,
	BrainfileParser,
	BrainfileSerializer,
	BUILT_IN_TEMPLATES,
	type Column,
	type DiscoveredFile,
	discover,
	findPrimaryBrainfile,
	hashBoardContent,
	type Rule,
	type Task,
	type TaskTemplate,
} from "@brainfile/core"
import * as vscode from "vscode"
// Import modular board components
import {
	// Types
	type AgentType,
	addTask,
	archiveTasks,
	// Agent utilities
	buildAgentPrompt,
	createParseWarningMessage,
	deleteTask,
	deleteTasks,
	findColumnById,
	generateErrorHtml,
	getAgentRegistry,
	// HTML utilities
	getPriorityClassName,
	moveTask,
	// Bulk operations
	moveTasks,
	patchTasks,
	toggleSubtask,
	updateBoardTitle,
	updateStatsConfig,
	// Board operations
	updateTask,
} from "./board"
import { log } from "./extension"

export class BoardViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "brainfile.tasksView"

	private _view?: vscode.WebviewView
	private _boardFilePath?: string
	private _fileWatcher?: vscode.FileSystemWatcher
	private _archiveWatcher?: vscode.FileSystemWatcher
	private _discoveryWatcher?: vscode.FileSystemWatcher
	private _textDocumentListener?: vscode.Disposable
	private _refreshTimer?: NodeJS.Timeout
	private _isFirstRender: boolean = true
	private _disposables: vscode.Disposable[] = []
	private _lastContentHash?: string
	private _lastValidBoard?: Board
	private _parseErrorCount: number = 0
	private _lastUsedAgent: AgentType = "copilot"
	private _context?: vscode.ExtensionContext
	private _webviewReady: boolean = false
	private _pendingBoard?: Board | null

	constructor(
		private readonly _extensionUri: vscode.Uri,
		context?: vscode.ExtensionContext,
	) {
		this._context = context
		// Load last-used agent from workspace state
		if (context) {
			const saved = context.workspaceState.get<AgentType>("brainfile.lastUsedAgent")
			if (saved) {
				this._lastUsedAgent = saved
			}
		}
	}

	/**
	 * Get the current board file path
	 */
	public getBoardFilePath(): string | undefined {
		return this._boardFilePath
	}

	/**
	 * Switch to a different brainfile (public API for commands)
	 */
	public switchToFile(filePath: string): void {
		this.switchFile(filePath)
	}

	/**
	 * Send available agents to the webview
	 */
	private postAvailableAgents() {
		if (!this._view) return
		const registry = getAgentRegistry()

		// Sync last used from workspace state
		if (this._lastUsedAgent) {
			registry.setLastUsed(this._lastUsedAgent)
		}

		const agents = registry.getAvailableAgents()
		const defaultAgent = registry.getDefaultAgent()
		this._view.webview.postMessage({
			type: "agentsDetected",
			agents,
			defaultAgent,
			lastUsed: registry.getLastUsed() || defaultAgent,
		})
	}

	/**
	 * Send available brainfiles to the webview for the switcher dropdown
	 */
	private postAvailableBrainfiles() {
		if (!this._view) return
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
		if (!workspaceRoot) return

		const result = discover(workspaceRoot)
		const currentFile = this._boardFilePath

		this._view.webview.postMessage({
			type: "availableFiles",
			files: result.files.map((f: DiscoveredFile) => {
				// Check if file is blank (needs initialization)
				let isBlank = false
				try {
					const content = fs.readFileSync(f.absolutePath, "utf8")
					isBlank = this.isBlankContent(content)
				} catch {
					// If we can't read, assume not blank
				}

				return {
					name: f.name,
					relativePath: f.relativePath,
					absolutePath: f.absolutePath,
					itemCount: f.itemCount,
					isPrivate: f.isPrivate,
					isCurrent: f.absolutePath === currentFile,
					isBlank,
				}
			}),
		})
	}

	/**
	 * Handle opening the native file picker for brainfiles
	 */
	private async handleOpenFilePicker() {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
		if (!workspaceRoot) return

		const result = discover(workspaceRoot)
		const currentFile = this._boardFilePath

		const items = result.files.map((f) => {
			const isCurrent = f.absolutePath === currentFile
			return {
				label: f.name,
				description: f.relativePath,
				detail: isCurrent ? "Current" : (f.isPrivate ? "Private" : undefined),
				absolutePath: f.absolutePath,
			}
		})

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: "Select a brainfile to switch to",
		})

		if (selected) {
			this.switchFile(selected.absolutePath)
		}
	}

	/**
	 * Handle switching to a different brainfile
	 */
	public async switchFile(absolutePath: string) {
		if (!absolutePath || !fs.existsSync(absolutePath)) {
			log(`Cannot switch to file: ${absolutePath}`)
			return
		}

		log(`Switching to brainfile: ${absolutePath}`)

		// Check if file is blank and needs initialization
		const content = fs.readFileSync(absolutePath, "utf8")
		if (this.isBlankContent(content)) {
			log(`Detected blank brainfile, auto-initializing: ${absolutePath}`)
			await this.initializeBlankBrainfile(absolutePath)
		}

		this._boardFilePath = absolutePath
		this._lastContentHash = undefined
		this._lastValidBoard = undefined
		this.refresh()
		this.postAvailableBrainfiles()
	}

	/**
	 * Check if content is blank (empty or whitespace only)
	 */
	private isBlankContent(content: string): boolean {
		return content.trim().length === 0
	}

	/**
	 * Initialize a blank brainfile with default template
	 */
	private async initializeBlankBrainfile(filePath: string) {
		const fileName = path.basename(filePath, ".md")
		// Extract a readable title from filename (e.g., "brainfile.feature" -> "Feature")
		const titleMatch = fileName.match(/brainfile\.(.+)/i)
		const title = titleMatch ? titleMatch[1].charAt(0).toUpperCase() + titleMatch[1].slice(1) : "My Project"

		const defaultContent = `---
title: ${title}
schema: https://brainfile.md/v1/board.json
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
`

		try {
			fs.writeFileSync(filePath, defaultContent, "utf8")
			log(`Initialized blank brainfile: ${filePath}`)
			vscode.window.showInformationMessage(`Initialized ${path.basename(filePath)} with starter template`)
		} catch (error) {
			log(`Error initializing blank brainfile:`, error)
			vscode.window.showErrorMessage(`Failed to initialize ${path.basename(filePath)}`)
		}
	}

	public refresh() {
		this.updateView()
	}

	/**
	 * Persist board changes to disk and refresh the view
	 * Common pattern for all board-mutating operations
	 */
	private persistAndRefresh(board: Board, logMessage: string) {
		if (!this._boardFilePath) return

		const newContent = BrainfileSerializer.serialize(board)
		fs.writeFileSync(this._boardFilePath, newContent, "utf8")
		log(logMessage)

		// Update hash to prevent double update from file watcher
		this._lastContentHash = this.hashContent(newContent)

		// Immediately update the view with the new content
		this.updateView(false, newContent)
	}

	public async createBoard() {
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders) {
			vscode.window.showErrorMessage("No workspace folder open")
			return
		}

		const rootPath = workspaceFolders[0].uri.fsPath
		const brainfilePath = path.join(rootPath, "brainfile.md")

		// Check if file already exists
		if (fs.existsSync(brainfilePath)) {
			const answer = await vscode.window.showWarningMessage("brainfile.md already exists. Overwrite?", "Yes", "No")
			if (answer !== "Yes") {
				return
			}
		}

		await this.createDefaultBrainfileFile(brainfilePath)
		this.updateView()
	}

	public async quickAddTask() {
		if (!this._boardFilePath) {
			vscode.window.showErrorMessage("No Brainfile board found")
			return
		}

		// Get column options
		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) {
			vscode.window.showErrorMessage("Failed to parse board")
			return
		}

		// Quick input for task title
		const title = await vscode.window.showInputBox({
			prompt: "Task title",
			placeHolder: "Enter task title",
			validateInput: (value) => {
				if (!value || value.trim().length === 0) {
					return "Task title is required"
				}
				return null
			},
		})

		if (!title) {
			return
		}

		// Quick pick for column selection
		const columnOptions = board.columns.map((col: Column) => ({
			label: col.title,
			description: `${col.tasks.length} tasks`,
			id: col.id,
		}))

		const selectedColumn = await vscode.window.showQuickPick(columnOptions, {
			placeHolder: "Select column",
			canPickMany: false,
		})

		// Use selected column, or first column as fallback
		const columnId = (selectedColumn as { id: string } | undefined)?.id || board.columns[0]?.id
		if (!columnId) {
			vscode.window.showErrorMessage("No columns available")
			return
		}

		// Optional description
		const description = await vscode.window.showInputBox({
			prompt: "Task description (optional)",
			placeHolder: "Enter task description (supports markdown)",
		})

		// Generate next task ID
		const allTaskIds = board.columns.flatMap((col: Column) =>
			col.tasks.map((t: Task) => parseInt(t.id.replace("task-", ""), 10) || 0),
		)
		const maxId = Math.max(0, ...allTaskIds)
		const newTaskId = `task-${maxId + 1}`

		// Add task to the selected column
		const column = board.columns.find((col: Column) => col.id === columnId)
		if (column) {
			column.tasks.push({
				id: newTaskId,
				title: title.trim(),
				description: description?.trim() || "",
			})

			// Save the updated board
			const newContent = BrainfileSerializer.serialize(board)
			fs.writeFileSync(this._boardFilePath, newContent, "utf8")
			log(`Quick added task ${newTaskId} to column ${columnId}`)
			vscode.window.showInformationMessage(`Added task "${title}" to ${column.title}`)

			// Update hash to prevent double update from file watcher
			this._lastContentHash = this.hashContent(newContent)

			// Update the view with the new content
			this.updateView(false, newContent)
		}
	}

	// Template Management Methods
	private getTemplateStorageKey(): string {
		return "brainfile.userTemplates"
	}

	public getUserTemplates(): TaskTemplate[] {
		const config = vscode.workspace.getConfiguration()
		const templates = config.get<TaskTemplate[]>(this.getTemplateStorageKey())
		return templates || []
	}

	public async saveUserTemplates(templates: TaskTemplate[]): Promise<void> {
		const config = vscode.workspace.getConfiguration()
		await config.update(this.getTemplateStorageKey(), templates, vscode.ConfigurationTarget.Workspace)
	}

	public getAllTemplates(): TaskTemplate[] {
		const userTemplates = this.getUserTemplates()
		return [...BUILT_IN_TEMPLATES, ...userTemplates]
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		log("Resolving webview view")
		this._view = webviewView

		// When webview is moved between panes, it gets recreated
		// Reset first render flag to ensure full HTML is set
		this._isFirstRender = true

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri],
		}

		// Find brainfile.md file
		this.findBrainfileFile().then(() => {
			log("Board file found:", this._boardFilePath)
			this.updateView()
			this.watchFile()
		})

		// Listen for settings changes to update priority colors immediately
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("brainfile.priorities")) {
				log("Priority settings changed, refreshing webview styles")
				this.updateView(false)
			}
		})

		// Handle messages from webview
		webviewView.webview.onDidReceiveMessage((data) => {
			log("Received message from webview:", data.type, data)
			switch (data.type) {
				case "webviewReady":
					this._webviewReady = true
					if (this._pendingBoard !== undefined) {
						this.postBoardUpdate(this._pendingBoard)
						this._pendingBoard = undefined
					} else if (this._lastValidBoard) {
						this.postBoardUpdate(this._lastValidBoard)
					} else {
						this.refresh()
					}
					this.postAvailableAgents()
					break
				case "updateTask":
					this.handleUpdateTask(data.columnId, data.taskId, data.title, data.description)
					break
				case "editTask":
					this.handleEditTask(data.taskId)
					break
				case "editPriority":
					this.handleEditPriority(data.taskId)
					break
				case "deleteTask":
					this.handleDeleteTask(data.columnId, data.taskId)
					break
				case "moveTask":
					this.handleMoveTask(data.taskId, data.fromColumn, data.toColumn, data.toIndex)
					break
				case "updateTitle":
					this.handleUpdateTitle(data.title)
					break
				case "updateTaskTitle":
					this.handleUpdateTaskTitle(data.taskId, data.title)
					break
				case "openFile":
					this.handleOpenFile(data.filePath)
					break
				case "clearCache":
					this.handleClearCache()
					break
				case "openSettings":
					vscode.commands.executeCommand("workbench.action.openSettings", "brainfile")
					break
				case "archiveTask":
					this.handleArchiveTask(data.columnId, data.taskId)
					break
				case "restoreTask":
					this.handleRestoreTask(data.taskId)
					break
				case "deleteArchivedTask":
					this.handleDeleteArchivedTask(data.taskId)
					break
				case "completeTask":
					this.handleCompleteTask(data.taskId, data.columnId)
					break
				case "addTaskToColumn":
					this.handleAddTaskToColumn(data.columnId)
					break
				case "addRuleInline":
					this.handleAddRuleInline(data.ruleType, data.ruleText)
					break
				case "updateRule":
					this.handleUpdateRule(data.ruleId, data.ruleType, data.ruleText)
					break
				case "deleteRule":
					this.handleDeleteRule(data.ruleId, data.ruleType)
					break
				case "toggleSubtask":
					this.handleToggleSubtask(data.taskId, data.subtaskId)
					break
				case "saveStatsConfig":
					this.handleSaveStatsConfig(data.columns)
					break
				case "fix-issues":
					this.handleFixIssues()
					break
				case "refresh":
					this.handleRefresh()
					break
				case "sendToAgent":
					this.handleSendToAgent(data.taskId, data.agentType)
					break
				case "getAvailableAgents":
					this.postAvailableAgents()
					break
				case "switchFile":
					this.switchFile(data.absolutePath as string)
					break
				case "triggerQuickPick":
					vscode.commands.executeCommand("brainfile.quickSwitch")
					break
				case "triggerTaskActionQuickPick":
					this.handleTaskActionQuickPick(data.columnId as string, data.taskId as string)
					break
				case "openFilePicker":
					this.handleOpenFilePicker()
					break
				case "getAvailableFiles":
					this.postAvailableBrainfiles()
					break
				// Bulk operations
				case "bulkMoveTasks":
					this.handleBulkMoveTasks(data.taskIds as string[], data.toColumnId as string)
					break
				case "bulkArchiveTasks":
					this.handleBulkArchiveTasks(data.taskIds as string[])
					break
				case "bulkDeleteTasks":
					this.handleBulkDeleteTasks(data.taskIds as string[])
					break
				case "bulkPatchTasks":
					this.handleBulkPatchTasks(
						data.taskIds as string[],
						data.patch as { priority?: string; tags?: string[]; assignee?: string },
					)
					break
			}
		})
	}

	private async findBrainfileFile() {
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders) {
			return
		}

		const rootPath = workspaceFolders[0].uri.fsPath

		// Use core's findPrimaryBrainfile for consistent discovery
		// Priority: brainfile.md > .brainfile.md > .bb.md > brainfile.*.md
		const primary = findPrimaryBrainfile(rootPath)
		if (primary) {
			this._boardFilePath = primary.absolutePath
			return
		}

		// If no file exists, create default brainfile.md (non-hidden)
		const defaultPath = path.join(rootPath, "brainfile.md")
		await this.createDefaultBrainfileFile(defaultPath)
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
`

			fs.writeFileSync(filePath, defaultContent, "utf8")
			this._boardFilePath = filePath

			const fileName = path.basename(filePath)
			log(`Created default ${fileName} file`)
			vscode.window.showInformationMessage(`Created ${fileName} with starter template`)
		} catch (error) {
			const fileName = path.basename(filePath)
			log(`Error creating default ${fileName}:`, error)
			vscode.window.showErrorMessage(`Failed to create ${fileName} file`)
		}
	}

	private watchFile() {
		if (!this._boardFilePath) {
			log("No board file to watch")
			return
		}

		this.disposeWatchers()

		const boardUri = vscode.Uri.file(this._boardFilePath)
		const boardFolder = vscode.workspace.getWorkspaceFolder(boardUri)
		if (!boardFolder) {
			log("No workspace folder found for watcher")
			return
		}

		const rootPath = boardFolder.uri.fsPath
		const boardRelative = path.relative(rootPath, this._boardFilePath)
		const boardPattern = new vscode.RelativePattern(rootPath, boardRelative)

		log("Setting up file watchers for:", this._boardFilePath)

		this._fileWatcher = vscode.workspace.createFileSystemWatcher(boardPattern, false, false, false)
		this._fileWatcher.onDidChange((uri) => {
			log("Board file changed on disk:", uri.fsPath)
			this.scheduleBoardRefresh("file-change", uri)
		})
		this._fileWatcher.onDidCreate((uri) => {
			log("Board file created:", uri.fsPath)
			this._boardFilePath = uri.fsPath
			this.scheduleBoardRefresh("file-create", uri)
		})
		this._fileWatcher.onDidDelete(() => {
			log("Board file deleted")
			this._boardFilePath = undefined
			this.updateView(true)
		})

		const archivePath = this.getArchivePath()
		if (archivePath) {
			const archiveRelative = path.relative(rootPath, archivePath)
			const archivePattern = new vscode.RelativePattern(rootPath, archiveRelative)
			this._archiveWatcher = vscode.workspace.createFileSystemWatcher(archivePattern, false, false, false)
			this._archiveWatcher.onDidChange((uri) => {
				log("Archive file changed on disk:", uri.fsPath)
				this.scheduleBoardRefresh("archive-change", uri)
			})
			this._archiveWatcher.onDidCreate((uri) => {
				log("Archive file created:", uri.fsPath)
				this.scheduleBoardRefresh("archive-create", uri)
			})
			this._archiveWatcher.onDidDelete(() => {
				log("Archive file deleted")
				this.scheduleBoardRefresh("archive-delete")
			})
		}

		// Watch for any brainfile creation/deletion to update the switcher
		this._discoveryWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(rootPath, "**/*brainfile*.md"),
			false,
			true, // ignore changes, only care about create/delete
			false,
		)
		this._discoveryWatcher.onDidCreate(() => {
			log("New brainfile created, refreshing available files")
			this.postAvailableBrainfiles()
		})
		this._discoveryWatcher.onDidDelete(() => {
			log("Brainfile deleted, refreshing available files")
			this.postAvailableBrainfiles()
		})

		this._textDocumentListener = vscode.workspace.onDidChangeTextDocument((event) => {
			if (event.document.uri.fsPath === this._boardFilePath) {
				log("Board document changed in editor")
				this.scheduleBoardRefresh("document-change", event.document.uri)
			}
		})

		// Trigger an initial refresh to sync hash state
		this.scheduleBoardRefresh("initial-watch")
	}

	private scheduleBoardRefresh(reason: string, _uri?: vscode.Uri) {
		if (this._refreshTimer) {
			clearTimeout(this._refreshTimer)
		}

		// Use longer debounce for document changes to allow users to finish typing
		const debounceTime = reason === "document-change" ? 500 : 150

		this._refreshTimer = setTimeout(() => {
			this.refreshBoardFromSource(reason)
		}, debounceTime)
	}

	private async refreshBoardFromSource(reason: string) {
		if (!this._boardFilePath) {
			log("No board file to refresh from")
			return
		}

		try {
			const content = await this.readBoardContent()

			const currentHash = this.hashContent(content)
			if (currentHash === this._lastContentHash) {
				log("Refresh skipped - content hash unchanged")
				return
			}

			log(`Refreshing board due to ${reason}; new hash: ${currentHash}`)
			this._lastContentHash = currentHash
			this.updateView(false, content)
		} catch (error) {
			log("Error refreshing board from source:", error)
			// Only show error if it's not a file not found error (could be deleted)
			if (error instanceof Error && !error.message.includes("ENOENT")) {
				vscode.window.showErrorMessage(`Failed to refresh Brainfile board: ${error.message}`)
			}
		}
	}

	private async readBoardContent(): Promise<string> {
		if (!this._boardFilePath) {
			throw new Error("No board file path set")
		}

		const openDoc = vscode.workspace.textDocuments.find((doc) => doc.uri.fsPath === this._boardFilePath)
		if (openDoc) {
			return openDoc.getText()
		}

		const data = await vscode.workspace.fs.readFile(vscode.Uri.file(this._boardFilePath))
		return Buffer.from(data).toString("utf8")
	}

	private disposeWatchers() {
		if (this._fileWatcher) {
			this._fileWatcher.dispose()
			this._fileWatcher = undefined
		}

		if (this._archiveWatcher) {
			this._archiveWatcher.dispose()
			this._archiveWatcher = undefined
		}

		if (this._discoveryWatcher) {
			this._discoveryWatcher.dispose()
			this._discoveryWatcher = undefined
		}

		if (this._textDocumentListener) {
			this._textDocumentListener.dispose()
			this._textDocumentListener = undefined
		}

		if (this._refreshTimer) {
			clearTimeout(this._refreshTimer)
			this._refreshTimer = undefined
		}
	}

	private hashContent(content: string): string {
		return hashBoardContent(content)
	}

	private updateView(forceFullRefresh: boolean = false, contentOverride?: string) {
		if (!this._view || !this._boardFilePath) {
			log("Cannot update view - missing view or board file")
			return
		}

		try {
			log("Updating tasks view")
			const content = contentOverride ?? fs.readFileSync(this._boardFilePath, "utf8")
			const board = BrainfileParser.parse(content)

			if (!board) {
				log("Failed to parse board file")
				this._parseErrorCount++

				// Run linter to get detailed error info
				const lintResult = BrainfileLinter.lint(content)
				const firstIssue = lintResult.issues[0]
				const summary = firstIssue
					? `${firstIssue.message}${firstIssue.line ? ` (line ${firstIssue.line})` : ""}`
					: "Syntax error in brainfile.md"

				if (this._lastValidBoard && this._parseErrorCount <= 3) {
					log("Showing last valid board with warning")
					if (!this._isFirstRender && this._webviewReady) {
						this._view.webview.postMessage(
							createParseWarningMessage(`Parse error: ${summary} - showing last valid state`, lintResult),
						)
						this.postBoardUpdate(this._lastValidBoard)
					}
					return
				}

				this._view.webview.html = generateErrorHtml({
					message: "Failed to parse brainfile.md",
					details:
						"Check for YAML syntax errors in the frontmatter. Common issues:\n• Missing colons after keys\n• Incorrect indentation\n• Unclosed quotes or brackets",
					lintResult,
				})
				this._webviewReady = false
				this._isFirstRender = true
				return
			}

			// Successful parse - reset error count
			this._parseErrorCount = 0

			// Load archive from separate file if it exists
			this.loadArchive(board)
			const newHash = this.hashContent(content)

			log("Board parsed successfully:", board.title, `(${board.columns.length} columns)`)

			this._lastValidBoard = board
			this._lastContentHash = newHash

			this.ensureWebviewHtml(forceFullRefresh)
			this.postBoardUpdate(board)
		} catch (error) {
			log("Error updating view:", error)
			vscode.window.showErrorMessage("Failed to update Brainfile board view")
		}
	}

	private ensureWebviewHtml(forceFullRefresh: boolean) {
		if (!this._view) return

		if (this._isFirstRender || forceFullRefresh) {
			log("Loading Vue webview (force:", forceFullRefresh, ")")
			this._webviewReady = false
			this._pendingBoard = this._lastValidBoard ?? null
			this._view.webview.html = this.getWebviewHtml(this._view.webview)
			this._isFirstRender = false
		}
	}

	private postBoardUpdate(board: Board | null) {
		if (!this._view) return
		const payload = {
			type: "boardUpdate",
			board,
			priorityStyles: this.getDynamicPriorityCSS(),
		}

		if (this._webviewReady) {
			this._view.webview.postMessage(payload)
			// Also send available files for the switcher
			this.postAvailableBrainfiles()
		} else {
			this._pendingBoard = board
		}
	}

	private handleUpdateTask(columnId: string, taskId: string, newTitle: string, newDescription: string) {
		if (!this._boardFilePath) return

		log(`Updating task ${taskId} in column ${columnId}`)
		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		const result = updateTask(board, columnId, taskId, newTitle, newDescription)
		if (!result.success || !result.board) {
			log(`Failed to update task: ${result.error}`)
			return
		}

		this.persistAndRefresh(result.board, "Task updated successfully")
	}

	private async handleDeleteTask(columnId: string, taskId: string) {
		if (!this._boardFilePath) return

		// Get task title for confirmation dialog
		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		const column = board.columns.find((c: Column) => c.id === columnId)
		const task = column?.tasks.find((t: Task) => t.id === taskId)
		const taskTitle = task?.title ?? taskId

		// Show confirmation dialog
		const confirm = await vscode.window.showWarningMessage(
			`Delete "${taskTitle}"? This cannot be undone.`,
			"Delete",
			"Cancel"
		)

		if (confirm !== "Delete") return

		log(`Deleting task ${taskId} from column ${columnId}`)

		const result = deleteTask(board, columnId, taskId)
		if (!result.success || !result.board) {
			log(`Failed to delete task: ${result.error}`)
			return
		}

		this.persistAndRefresh(result.board, "Task deleted successfully")
	}

	private handleMoveTask(taskId: string, fromColumnId: string, toColumnId: string, toIndex: number) {
		if (!this._boardFilePath) return

		log(`Moving task ${taskId} from ${fromColumnId} to ${toColumnId} at index ${toIndex}`)
		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) {
			log("Failed to parse board")
			return
		}

		const result = moveTask(board, taskId, fromColumnId, toColumnId, toIndex)
		if (!result.success || !result.board) {
			log(`Failed to move task: ${result.error}`)
			return
		}

		this.persistAndRefresh(result.board, "Task moved successfully")
	}

	/**
	 * Find the "completion" column - the column tasks should move to when marked complete.
	 * Looks for columns with names like "done", "complete", "finished", etc.
	 * Falls back to the last column if no match is found.
	 */
	private findCompletionColumn(board: Board): Column | undefined {
		if (!board.columns || board.columns.length === 0) return undefined

		// Common completion column name patterns (case-insensitive)
		const completionPatterns = [/done/i, /complete/i, /finished/i, /closed/i]

		for (const pattern of completionPatterns) {
			const match = board.columns.find(
				(col: Column) => pattern.test(col.title) || pattern.test(col.id),
			)
			if (match) return match
		}

		// Fall back to the last column (common Kanban convention)
		return board.columns[board.columns.length - 1]
	}

	/**
	 * Check if a column is the "completion" column
	 */
	private isCompletionColumn(board: Board, columnId: string): boolean {
		const completionCol = this.findCompletionColumn(board)
		return completionCol?.id === columnId
	}

	private async handleCompleteTask(taskId: string, fromColumnId: string) {
		if (!this._boardFilePath) return

		log(`Completing task ${taskId} from ${fromColumnId}`)
		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) {
			log("Failed to parse board")
			return
		}

		// Find the completion column
		const completionColumn = this.findCompletionColumn(board)

		if (!completionColumn) {
			vscode.window.showErrorMessage("No columns available to complete the task to")
			return
		}

		// If already in completion column, show a message
		if (completionColumn.id === fromColumnId) {
			vscode.window.showInformationMessage("Task is already in the completion column")
			return
		}

		// Move to beginning of completion column
		const result = moveTask(board, taskId, fromColumnId, completionColumn.id, 0)
		if (!result.success || !result.board) {
			log(`Failed to complete task: ${result.error}`)
			vscode.window.showErrorMessage(`Failed to complete task: ${result.error}`)
			return
		}

		this.persistAndRefresh(result.board, `Task moved to ${completionColumn.title}`)
	}

	private handleUpdateTitle(newTitle: string) {
		if (!this._boardFilePath) return

		log(`Updating board title to: ${newTitle}`)
		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		const result = updateBoardTitle(board, newTitle)
		if (!result.success || !result.board) {
			log(`Failed to update title: ${result.error}`)
			return
		}

		this.persistAndRefresh(result.board, "Board title updated successfully")
	}

	private handleUpdateTaskTitle(taskId: string, newTitle: string) {
		if (!this._boardFilePath) return

		log(`Updating task ${taskId} title to: ${newTitle}`)
		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		// Find the task in any column and update its title
		for (const column of board.columns) {
			const task = column.tasks.find((t: Task) => t.id === taskId)
			if (task) {
				task.title = newTitle
				this.persistAndRefresh(board, "Task title updated")
				return
			}
		}

		log(`Task ${taskId} not found`)
	}

	private async handleEditTask(taskId: string) {
		if (!this._boardFilePath) return

		try {
			log(`Opening task ${taskId} in editor`)

			// Read the file content
			const content = fs.readFileSync(this._boardFilePath, "utf8")

			// Find the task location
			const location = BrainfileParser.findTaskLocation(content, taskId)

			if (!location) {
				vscode.window.showErrorMessage(`Could not find task ${taskId} in file`)
				return
			}

			// Check if the document is already open in a visible editor
			const uri = vscode.Uri.file(this._boardFilePath)
			let editor = vscode.window.visibleTextEditors.find((editor) => editor.document.uri.toString() === uri.toString())

			if (editor) {
				// Document is already open, just focus it and move cursor
				const position = new vscode.Position(location.line - 1, location.column)
				const range = new vscode.Range(position, position)

				editor.selection = new vscode.Selection(position, position)
				editor.revealRange(range, vscode.TextEditorRevealType.InCenter)

				// Focus the existing editor
				await vscode.window.showTextDocument(editor.document, {
					viewColumn: editor.viewColumn,
					preserveFocus: false,
				})
			} else {
				// Document is not open, open it in a new editor
				const document = await vscode.workspace.openTextDocument(uri)
				const position = new vscode.Position(location.line - 1, location.column)
				const range = new vscode.Range(position, position)

				editor = await vscode.window.showTextDocument(document, {
					selection: range,
					viewColumn: vscode.ViewColumn.Beside, // Open beside the webview
					preserveFocus: false, // Give focus to the editor
				})
			}

			// Highlight the task temporarily
			if (editor) {
				await this.highlightTask(editor, taskId, content)
			}

			log(`Opened editor at line ${location.line} for task ${taskId}`)
		} catch (error) {
			log("Error opening task in editor:", error)
			vscode.window.showErrorMessage("Failed to open task in editor")
		}
	}

	private async handleEditPriority(taskId: string) {
		if (!this._boardFilePath) return

		try {
			const content = fs.readFileSync(this._boardFilePath, "utf8")
			const board = BrainfileParser.parse(content)
			if (!board) return

			// Find the task
			let targetTask: { task: Task; columnId: string } | null = null
			for (const col of board.columns) {
				const task = col.tasks.find((t: Task) => t.id === taskId)
				if (task) {
					targetTask = { task, columnId: col.id }
					break
				}
			}

			if (!targetTask) {
				vscode.window.showErrorMessage(`Could not find task ${taskId}`)
				return
			}

			const priorities = [
				{ label: "critical", description: "Highest priority" },
				{ label: "high", description: "High priority" },
				{ label: "medium", description: "Medium priority" },
				{ label: "low", description: "Low priority" },
				{ label: "$(edit) Custom...", description: "Enter a custom priority" },
				{ label: "$(close) Remove priority", description: "Remove priority from task" },
			]

			const selected = await vscode.window.showQuickPick(priorities, {
				placeHolder: `Current: ${targetTask.task.priority || "none"}`,
				title: "Select Priority",
			})

			if (!selected) return

			let newPriority: string | undefined

			if (selected.label === "$(close) Remove priority") {
				newPriority = undefined
			} else if (selected.label === "$(edit) Custom...") {
				const custom = await vscode.window.showInputBox({
					prompt: "Enter custom priority",
					value: targetTask.task.priority || "",
				})
				if (custom === undefined) return
				newPriority = custom || undefined
			} else {
				newPriority = selected.label
			}
			// Update the task priority (cast to any since we support custom priorities)
			;(targetTask.task as any).priority = newPriority

			const newContent = BrainfileSerializer.serialize(board)
			fs.writeFileSync(this._boardFilePath, newContent, "utf8")

			// Update hash to prevent double update
			this._lastContentHash = this.hashContent(newContent)

			log(`Updated priority for task ${taskId} to: ${newPriority || "none"}`)
			this.updateView(false, newContent)
		} catch (error) {
			log("Error updating priority:", error)
			vscode.window.showErrorMessage("Failed to update priority")
		}
	}

	private async handleSendToAgent(taskId: string, agentType?: AgentType) {
		if (!this._boardFilePath) {
			vscode.window.showErrorMessage("No Brainfile board found")
			return
		}

		try {
			const content = fs.readFileSync(this._boardFilePath, "utf8")
			const board = BrainfileParser.parse(content)
			if (!board) {
				vscode.window.showErrorMessage("Failed to parse board")
				return
			}

			// Find task and column
			let targetTask: Task | undefined
			let columnTitle = ""
			for (const col of board.columns) {
				const found = col.tasks.find((t: Task) => t.id === taskId)
				if (found) {
					targetTask = found
					columnTitle = col.title
					break
				}
			}

			if (!targetTask) {
				vscode.window.showErrorMessage(`Task ${taskId} not found`)
				return
			}

			const prompt = buildAgentPrompt({
				boardTitle: board.title,
				columnTitle,
				task: targetTask,
			})

			// Use the agent registry for sending
			const registry = getAgentRegistry()
			const agent = agentType || registry.getDefaultAgent()

			// Persist to workspace state
			this._lastUsedAgent = agent
			if (this._context) {
				this._context.workspaceState.update("brainfile.lastUsedAgent", agent)
			}

			const result = await registry.sendToAgent(agent, prompt)
			if (!result.success) {
				vscode.window.showErrorMessage(result.message || "Failed to send to agent")
			} else if (result.copiedToClipboard && result.message) {
				vscode.window.showInformationMessage(result.message)
			}
		} catch (error) {
			log("Error sending to agent:", error)
			vscode.window.showErrorMessage("Failed to build agent prompt.")
		}
	}

	private async highlightTask(editor: vscode.TextEditor, taskId: string, content: string) {
		// Create a decoration type for highlighting
		const highlightDecoration = vscode.window.createTextEditorDecorationType({
			backgroundColor: "rgba(255, 235, 59, 0.3)", // Yellow highlight
			border: "1px solid rgba(255, 235, 59, 0.5)",
			borderRadius: "2px",
			overviewRulerColor: "rgba(255, 235, 59, 0.8)",
			overviewRulerLane: vscode.OverviewRulerLane.Right,
		})

		// Find the task's full range (from task start to next task or end of tasks array)
		const lines = content.split("\n")
		const ranges: vscode.Range[] = []

		let taskStartLine = -1
		let taskEndLine = -1
		let foundTask = false
		let indentLevel = -1

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]

			if (line.includes(`id: ${taskId}`)) {
				// Found our task
				foundTask = true

				// Check if this line starts with a dash (compact format)
				if (line.match(/^\s*-\s+id:/)) {
					taskStartLine = i
					indentLevel = line.match(/^(\s*)/)?.[1].length || 0
				} else if (i > 0 && lines[i - 1].match(/^\s*-\s*$/)) {
					// Dash on previous line (expanded format)
					taskStartLine = i - 1
					indentLevel = lines[i - 1].match(/^(\s*)/)?.[1].length || 0
				} else {
					taskStartLine = i
					indentLevel = line.match(/^(\s*)/)?.[1].length || 0
				}
			} else if (foundTask) {
				// Check if we've reached the next task or end of this task's properties
				const currentIndent = line.match(/^(\s*)/)?.[1].length || 0

				// If we find another task dash at the same or lower indent level, we're done
				if (line.match(/^\s*-\s/) && currentIndent <= indentLevel) {
					taskEndLine = i - 1
					break
				}

				// If we've gone to a lower indent level (not counting empty lines), we're done
				if (line.trim() && currentIndent <= indentLevel) {
					taskEndLine = i - 1
					break
				}
			}
		}

		// If we didn't find an end, highlight to the end of the found content
		if (foundTask && taskEndLine === -1) {
			// Find the last non-empty line that belongs to this task
			for (let i = taskStartLine + 1; i < lines.length; i++) {
				const line = lines[i]
				if (!line.trim()) continue

				const currentIndent = line.match(/^(\s*)/)?.[1].length || 0
				if (currentIndent > indentLevel) {
					taskEndLine = i
				} else {
					break
				}
			}
		}

		if (taskStartLine !== -1 && taskEndLine !== -1) {
			const range = new vscode.Range(
				new vscode.Position(taskStartLine, 0),
				new vscode.Position(taskEndLine, lines[taskEndLine].length),
			)
			ranges.push(range)
		} else if (taskStartLine !== -1) {
			// Just highlight the single line if we couldn't find the end
			const range = new vscode.Range(
				new vscode.Position(taskStartLine, 0),
				new vscode.Position(taskStartLine, lines[taskStartLine].length),
			)
			ranges.push(range)
		}

		// Apply the decoration
		editor.setDecorations(highlightDecoration, ranges)

		// Remove the highlight after 3 seconds
		setTimeout(() => {
			highlightDecoration.dispose()
		}, 3000)
	}

	private async handleOpenFile(filePath: string) {
		try {
			log(`Opening file: ${filePath}`)

			// Check if filePath contains line number (e.g., "file.ts:42")
			const match = filePath.match(/^(.+):(\d+)$/)
			let actualPath = filePath
			let lineNumber = 0

			if (match) {
				actualPath = match[1]
				lineNumber = parseInt(match[2], 10) - 1 // VSCode uses 0-based line numbers
			}

			// Resolve relative paths from workspace root
			const workspaceFolders = vscode.workspace.workspaceFolders
			if (!workspaceFolders) {
				log("No workspace folder found")
				return
			}

			const absolutePath = path.isAbsolute(actualPath)
				? actualPath
				: path.join(workspaceFolders[0].uri.fsPath, actualPath)

			const uri = vscode.Uri.file(absolutePath)
			const document = await vscode.workspace.openTextDocument(uri)
			const editor = await vscode.window.showTextDocument(document)

			// Jump to line if specified
			if (lineNumber > 0) {
				const position = new vscode.Position(lineNumber, 0)
				editor.selection = new vscode.Selection(position, position)
				editor.revealRange(new vscode.Range(position, position))
			}

			log("File opened successfully")
		} catch (error) {
			log("Error opening file:", error)
			vscode.window.showErrorMessage(`Failed to open file: ${filePath}`)
		}
	}

	private handleClearCache() {
		try {
			log("Clearing cache and reloading window")

			// Dispose all resources
			this.dispose()

			// Reload the window
			vscode.commands.executeCommand("workbench.action.reloadWindow")
		} catch (error) {
			log("Error clearing cache:", error)
			vscode.window.showErrorMessage("Failed to clear cache")
		}
	}

	private handleSaveStatsConfig(columns: string[]) {
		if (!this._boardFilePath) return

		try {
			log(`Saving stats config with columns: ${columns.join(", ")}`)

			const content = fs.readFileSync(this._boardFilePath, "utf8")
			const board = BrainfileParser.parse(content)
			if (!board) return

			// Handle empty columns (remove config) or use updateStatsConfig
			let updatedBoard: Board
			if (columns.length > 0) {
				const result = updateStatsConfig(board, columns.slice(0, 4))
				if (!result.success || !result.board) {
					log(`Failed to update stats config: ${result.error}`)
					return
				}
				updatedBoard = result.board
			} else {
				// Remove statsConfig if no columns selected (use default)
				updatedBoard = { ...board }
				delete updatedBoard.statsConfig
			}

			this.persistAndRefresh(updatedBoard, "Stats config saved successfully")
			vscode.window.showInformationMessage("Stats configuration saved successfully")
		} catch (error) {
			log("Error saving stats config:", error)
			vscode.window.showErrorMessage("Failed to save stats configuration")
		}
	}

	private async handleFixIssues() {
		if (!this._boardFilePath) {
			vscode.window.showErrorMessage("No brainfile.md file found")
			return
		}

		try {
			log("Running auto-fix on brainfile.md")

			// Read current content
			const content = fs.readFileSync(this._boardFilePath, "utf8")

			// Run linter with auto-fix
			const result = BrainfileLinter.lint(content, { autoFix: true })

			if (!result.fixedContent) {
				vscode.window.showInformationMessage("No fixable issues found")
				return
			}

			// Show preview in diff editor
			const _fixedUri = vscode.Uri.parse(`untitled:${path.basename(this._boardFilePath)}.fixed`)
			const originalUri = vscode.Uri.file(this._boardFilePath)

			// Ask user to confirm
			const choice = await vscode.window.showInformationMessage(
				`Found ${result.issues.filter((i) => i.fixable).length} fixable issue(s). Apply fixes?`,
				{ modal: true },
				"Apply Fixes",
				"Preview Changes",
			)

			if (choice === "Preview Changes") {
				// Show diff
				const fixedDoc = await vscode.workspace.openTextDocument({
					content: result.fixedContent,
					language: "markdown",
				})

				await vscode.commands.executeCommand("vscode.diff", originalUri, fixedDoc.uri, "brainfile.md: Original ↔ Fixed")

				// Ask again after preview
				const applyChoice = await vscode.window.showInformationMessage("Apply these fixes?", "Apply Fixes", "Cancel")

				if (applyChoice !== "Apply Fixes") {
					return
				}
			} else if (choice !== "Apply Fixes") {
				return
			}

			// Apply the fixes
			fs.writeFileSync(this._boardFilePath, result.fixedContent, "utf8")
			this._lastContentHash = this.hashContent(result.fixedContent)

			vscode.window.showInformationMessage(
				`Fixed ${result.issues.filter((i) => i.fixable).length} issue(s) successfully!`,
			)

			// Refresh the view
			this.refresh()
		} catch (error) {
			log("Error fixing issues:", error)
			vscode.window.showErrorMessage(`Failed to fix issues: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	private handleRefresh() {
		log("Manual refresh triggered from error page")
		this.refresh()
	}

	private getArchivePath(): string | undefined {
		if (!this._boardFilePath) return

		// Archive file lives in the same directory as the board file
		const boardDir = path.dirname(this._boardFilePath)
		const mainFilename = path.basename(this._boardFilePath)
		const archiveFilename = mainFilename.replace(/\.md$/, "-archive.md")
		return path.join(boardDir, archiveFilename)
	}

	private loadArchive(board: Board) {
		const archivePath = this.getArchivePath()
		if (!archivePath || !this._boardFilePath) return

		if (!fs.existsSync(archivePath)) {
			log("No archive file found at:", archivePath)
			board.archive = []
			return
		}

		try {
			log("Loading archive from:", archivePath)
			const archiveContent = fs.readFileSync(archivePath, "utf8")
			const archiveBoard = BrainfileParser.parse(archiveContent)

			if (archiveBoard?.archive) {
				board.archive = archiveBoard.archive
				log(`Loaded ${archiveBoard.archive.length} archived tasks`)
			} else {
				board.archive = []
			}
		} catch (error) {
			log("Error loading archive:", error)
			board.archive = []
		}
	}

	private async handleAddTaskToColumn(columnId: string) {
		if (!this._boardFilePath) return

		// Show quick input for task title
		const title = await vscode.window.showInputBox({
			prompt: "Task title",
			placeHolder: "Enter task title",
			validateInput: (value) => {
				if (!value || value.trim().length === 0) {
					return "Task title is required"
				}
				return null
			},
		})

		if (!title) return

		// Optional description
		const description = await vscode.window.showInputBox({
			prompt: "Task description (optional)",
			placeHolder: "Enter task description (supports markdown)",
		})

		// Read current board
		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		// Use addTask from core (handles ID generation)
		const result = addTask(board, columnId, { title, description: description || "" })
		if (!result.success || !result.board) {
			log(`Failed to add task: ${result.error}`)
			return
		}

		const column = findColumnById(board, columnId)
		const columnTitle = column?.title || columnId

		this.persistAndRefresh(result.board, `Added task to column ${columnId}`)
		vscode.window.showInformationMessage(`Added task "${title}" to ${columnTitle}`)
	}

	private handleToggleSubtask(taskId: string, subtaskId: string) {
		if (!this._boardFilePath) return

		log(`Toggling subtask ${subtaskId} for task ${taskId}`)

		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		const result = toggleSubtask(board, taskId, subtaskId)
		if (!result.success || !result.board) {
			log(`Failed to toggle subtask: ${result.error}`)
			return
		}

		this.persistAndRefresh(result.board, `Subtask ${subtaskId} toggled`)
	}

	private handleAddRuleInline(ruleType: string, ruleText: string) {
		if (!this._boardFilePath) return

		const validType = ruleType as "always" | "never" | "prefer" | "context"

		// Read current board
		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		// Initialize rules if not present
		if (!board.rules) {
			board.rules = {
				always: [],
				never: [],
				prefer: [],
				context: [],
			}
		}

		// Ensure the rule type array exists
		if (!board.rules[validType]) {
			board.rules[validType] = []
		}

		// Generate next rule ID for this type
		const existingIds = board.rules[validType].map((r: Rule) => r.id)
		const maxId = Math.max(0, ...existingIds)
		const newRuleId = maxId + 1

		// Add the new rule
		board.rules[validType].push({
			id: newRuleId,
			rule: ruleText.trim(),
		})

		// Save the updated board
		const newContent = BrainfileSerializer.serialize(board)
		fs.writeFileSync(this._boardFilePath, newContent, "utf8")

		// Update hash to prevent double update
		this._lastContentHash = this.hashContent(newContent)

		log(`Added new ${validType} rule with id ${newRuleId}`)

		// Update the view with the new content
		this.updateView(false, newContent)
	}

	private handleUpdateRule(ruleId: number, ruleType: string, ruleText: string) {
		if (!this._boardFilePath) return

		const validType = ruleType as "always" | "never" | "prefer" | "context"

		// Read current board
		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board || !board.rules || !board.rules[validType]) return

		// Find and update the rule
		const rule = board.rules[validType].find((r: Rule) => r.id === ruleId)
		if (!rule) {
			log(`Rule ${ruleId} not found in ${validType}`)
			return
		}

		rule.rule = ruleText.trim()

		// Save the updated board
		const newContent = BrainfileSerializer.serialize(board)
		fs.writeFileSync(this._boardFilePath, newContent, "utf8")

		// Update hash to prevent double update
		this._lastContentHash = this.hashContent(newContent)

		log(`Updated ${validType} rule ${ruleId}`)

		// Update the view with the new content
		this.updateView(false, newContent)
	}

	private async handleDeleteRule(ruleId: string, ruleType: "always" | "never" | "prefer" | "context") {
		if (!this._boardFilePath) return

		// Show confirmation dialog
		const confirm = await vscode.window.showWarningMessage(`Delete ${ruleType} rule ${ruleId}?`, "Delete", "Cancel")

		if (confirm !== "Delete") return

		// Read current board
		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board || !board.rules) return

		// Check if the rule type exists
		if (!board.rules[ruleType]) return

		// Find and remove the rule (convert ruleId to number for comparison)
		const ruleIdNum = parseInt(ruleId, 10)
		const ruleIndex = board.rules[ruleType].findIndex((r: Rule) => r.id === ruleIdNum)
		if (ruleIndex !== -1) {
			board.rules[ruleType].splice(ruleIndex, 1)

			// Save the updated board
			const newContent = BrainfileSerializer.serialize(board)
			fs.writeFileSync(this._boardFilePath, newContent, "utf8")

			// Update hash to prevent double update
			this._lastContentHash = this.hashContent(newContent)

			log(`Deleted ${ruleType} rule ${ruleId}`)

			// Update the view with the new content
			this.updateView(false, newContent)
		}
	}

	private handleArchiveTask(columnId: string, taskId: string) {
		if (!this._boardFilePath) return

		log(`Archiving task ${taskId} from column ${columnId}`)

		// Read main board
		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		// Find and remove the task from the column
		let taskToArchive = null
		for (const col of board.columns) {
			if (col.id === columnId) {
				const taskIndex = col.tasks.findIndex((t: Task) => t.id === taskId)
				if (taskIndex !== -1) {
					taskToArchive = col.tasks.splice(taskIndex, 1)[0]
					break
				}
			}
		}

		if (!taskToArchive) {
			log("Task not found")
			return
		}

		// Save updated main board (without the archived task)
		const newContent = BrainfileSerializer.serialize(board)
		fs.writeFileSync(this._boardFilePath, newContent, "utf8")

		// Update hash to prevent double update
		this._lastContentHash = this.hashContent(newContent)

		// Get archive file path
		const archivePath = this.getArchivePath()
		if (!archivePath) return

		// Read or create archive file
		let archiveBoard: Board
		if (fs.existsSync(archivePath)) {
			const archiveContent = fs.readFileSync(archivePath, "utf8")
			const parsed = BrainfileParser.parse(archiveContent)
			if (parsed) {
				archiveBoard = parsed
			} else {
				archiveBoard = this.createEmptyArchiveBoard()
			}
		} else {
			archiveBoard = this.createEmptyArchiveBoard()
		}

		// Add task to archive
		if (!archiveBoard.archive) {
			archiveBoard.archive = []
		}
		archiveBoard.archive.unshift(taskToArchive) // Add to beginning

		// Save archive file
		const archiveContent = BrainfileSerializer.serialize(archiveBoard)
		fs.writeFileSync(archivePath, archiveContent, "utf8")

		log("Task archived successfully")
		vscode.window.showInformationMessage(`Task "${taskToArchive.title}" archived`)

		// Immediately update the view with the new content
		this.updateView(false, newContent)
	}

	private async handleRestoreTask(taskId: string) {
		if (!this._boardFilePath) return

		log(`Restoring task ${taskId} from archive`)

		// Archive is stored in a separate file
		const archivePath = this.getArchivePath()
		if (!archivePath || !fs.existsSync(archivePath)) {
			log("Archive file not found")
			vscode.window.showErrorMessage("No archive file found")
			return
		}

		// Read archive file to find the task
		const archiveContent = fs.readFileSync(archivePath, "utf8")
		const archiveBoard = BrainfileParser.parse(archiveContent)
		if (!archiveBoard?.archive) {
			log("No archive in archive file")
			return
		}

		// Find task in archive
		const archiveIndex = archiveBoard.archive.findIndex((t: Task) => t.id === taskId)
		if (archiveIndex === -1) {
			log("Task not found in archive")
			return
		}

		const taskToRestore = archiveBoard.archive[archiveIndex]

		// Read main board
		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		// No columns available
		if (!board.columns || board.columns.length === 0) {
			log("No columns available to restore to")
			vscode.window.showErrorMessage("No columns available to restore the task to")
			return
		}

		// Ask user which column to restore to
		interface ColumnQuickPickItem extends vscode.QuickPickItem {
			id: string
		}
		const columnItems: ColumnQuickPickItem[] = board.columns.map((col: Column) => ({
			label: col.title,
			description: `${col.tasks.length} task${col.tasks.length === 1 ? "" : "s"}`,
			id: col.id,
		}))

		const selectedColumn = await vscode.window.showQuickPick(columnItems, {
			placeHolder: `Restore "${taskToRestore.title}" to which column?`,
			title: "Restore Task",
		})

		if (!selectedColumn) {
			log("User cancelled restore")
			return
		}

		// Re-read both files in case they changed while Quick Pick was open
		const freshArchiveContent = fs.readFileSync(archivePath, "utf8")
		const freshArchiveBoard = BrainfileParser.parse(freshArchiveContent)
		if (!freshArchiveBoard?.archive) {
			log("Archive no longer available")
			return
		}

		const freshArchiveIndex = freshArchiveBoard.archive.findIndex((t: Task) => t.id === taskId)
		if (freshArchiveIndex === -1) {
			log("Task no longer in archive")
			vscode.window.showWarningMessage("Task is no longer in the archive")
			return
		}

		const freshContent = fs.readFileSync(this._boardFilePath, "utf8")
		const freshBoard = BrainfileParser.parse(freshContent)
		if (!freshBoard) return

		// Find target column
		const targetColumn = freshBoard.columns.find((c: Column) => c.id === selectedColumn.id)
		if (!targetColumn) {
			log("Target column no longer exists")
			vscode.window.showWarningMessage("The selected column no longer exists")
			return
		}

		// Remove from archive file
		const restoredTask = freshArchiveBoard.archive.splice(freshArchiveIndex, 1)[0]
		const newArchiveContent = BrainfileSerializer.serialize(freshArchiveBoard)
		fs.writeFileSync(archivePath, newArchiveContent, "utf8")

		// Add to target column in main board
		targetColumn.tasks.unshift(restoredTask)
		const newContent = BrainfileSerializer.serialize(freshBoard)
		fs.writeFileSync(this._boardFilePath, newContent, "utf8")

		// Update hash to prevent double update
		this._lastContentHash = this.hashContent(newContent)

		log("Task restored successfully")
		vscode.window.showInformationMessage(`Task "${restoredTask.title}" restored to ${targetColumn.title}`)

		// Immediately update the view with the new content
		this.updateView(false, newContent)
	}

	private handleDeleteArchivedTask(taskId: string) {
		if (!this._boardFilePath) return

		log(`Permanently deleting archived task ${taskId}`)

		// Archive is stored in separate file, update it directly
		const archivePath = this.getArchivePath()
		if (!archivePath || !fs.existsSync(archivePath)) {
			log("Archive file not found")
			return
		}

		const archiveContent = fs.readFileSync(archivePath, "utf8")
		const archiveBoard = BrainfileParser.parse(archiveContent)
		if (!archiveBoard?.archive) {
			log("No archive in archive file")
			return
		}

		// Find task in archive
		const archiveIndex = archiveBoard.archive.findIndex((t: Task) => t.id === taskId)
		if (archiveIndex === -1) {
			log("Task not found in archive")
			return
		}

		// Remove from archive
		const deletedTask = archiveBoard.archive.splice(archiveIndex, 1)[0]

		// Save the archive file
		const newArchiveContent = BrainfileSerializer.serialize(archiveBoard)
		fs.writeFileSync(archivePath, newArchiveContent, "utf8")

		log("Archived task deleted permanently")
		vscode.window.showInformationMessage(`Task "${deletedTask.title}" permanently deleted`)

		// Refresh the view to reflect the change
		this.updateView(false)
	}

	private handleBulkMoveTasks(taskIds: string[], toColumnId: string) {
		if (!this._boardFilePath || taskIds.length === 0) return

		log(`Bulk moving ${taskIds.length} tasks to column ${toColumnId}`)
		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		const result = moveTasks(board, taskIds, toColumnId)
		if (!result.board) {
			const firstError = result.results.find((r) => !r.success)?.error
			log(`Failed to bulk move tasks: ${firstError}`)
			vscode.window.showErrorMessage(`Failed to move tasks: ${firstError}`)
			return
		}

		this.persistAndRefresh(result.board, `Bulk moved ${result.successCount} tasks to ${toColumnId}`)

		if (result.failureCount > 0) {
			vscode.window.showWarningMessage(`Moved ${result.successCount} tasks, ${result.failureCount} failed`)
		} else {
			vscode.window.showInformationMessage(`Moved ${result.successCount} tasks`)
		}
	}

	private handleBulkArchiveTasks(taskIds: string[]) {
		if (!this._boardFilePath || taskIds.length === 0) return

		log(`Bulk archiving ${taskIds.length} tasks`)
		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		const result = archiveTasks(board, taskIds)
		if (!result.board) {
			const firstError = result.results.find((r) => !r.success)?.error
			log(`Failed to bulk archive tasks: ${firstError}`)
			vscode.window.showErrorMessage(`Failed to archive tasks: ${firstError}`)
			return
		}

		// Get the archived tasks from the result board's archive array
		const archivedTasks = result.board.archive ?? []

		// Remove archive from board before saving (VSCode stores archive separately)
		const boardToSave: Board = { ...result.board, archive: [] }
		const newContent = BrainfileSerializer.serialize(boardToSave)
		fs.writeFileSync(this._boardFilePath, newContent, "utf8")
		this._lastContentHash = this.hashContent(newContent)

		// Now save archived tasks to archive file
		const archivePath = this.getArchivePath()
		if (archivePath && archivedTasks.length > 0) {
			let archiveBoard: Board
			if (fs.existsSync(archivePath)) {
				const archiveContent = fs.readFileSync(archivePath, "utf8")
				const parsed = BrainfileParser.parse(archiveContent)
				archiveBoard = parsed ?? this.createEmptyArchiveBoard()
			} else {
				archiveBoard = this.createEmptyArchiveBoard()
			}

			if (!archiveBoard.archive) {
				archiveBoard.archive = []
			}

			// Add archived tasks
			archiveBoard.archive.unshift(...archivedTasks)

			const archiveContent = BrainfileSerializer.serialize(archiveBoard)
			fs.writeFileSync(archivePath, archiveContent, "utf8")
		}

		log(`Bulk archived ${result.successCount} tasks`)
		this.updateView(false, newContent)

		if (result.failureCount > 0) {
			vscode.window.showWarningMessage(`Archived ${result.successCount} tasks, ${result.failureCount} failed`)
		} else {
			vscode.window.showInformationMessage(`Archived ${result.successCount} tasks`)
		}
	}

	private handleBulkDeleteTasks(taskIds: string[]) {
		if (!this._boardFilePath || taskIds.length === 0) return

		log(`Bulk deleting ${taskIds.length} tasks`)
		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		const result = deleteTasks(board, taskIds)
		if (!result.board) {
			const firstError = result.results.find((r) => !r.success)?.error
			log(`Failed to bulk delete tasks: ${firstError}`)
			vscode.window.showErrorMessage(`Failed to delete tasks: ${firstError}`)
			return
		}

		this.persistAndRefresh(result.board, `Bulk deleted ${result.successCount} tasks`)

		if (result.failureCount > 0) {
			vscode.window.showWarningMessage(`Deleted ${result.successCount} tasks, ${result.failureCount} failed`)
		} else {
			vscode.window.showInformationMessage(`Deleted ${result.successCount} tasks`)
		}
	}



	private async handleBulkPatchTasks(taskIds: string[], patch: { priority?: string; tags?: string[]; assignee?: string }) {
		if (!this._boardFilePath || taskIds.length === 0) return

		log(`Bulk patching ${taskIds.length} tasks with:`, patch)
		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		// Convert string priority to proper type
		const typedPatch: { priority?: "critical" | "high" | "medium" | "low"; tags?: string[]; assignee?: string } = {
			...patch,
			priority: patch.priority as "critical" | "high" | "medium" | "low" | undefined,
		}

		const result = patchTasks(board, taskIds, typedPatch)
		if (!result.board) {
			const firstError = result.results.find((r) => !r.success)?.error
			log(`Failed to bulk patch tasks: ${firstError}`)
			vscode.window.showErrorMessage(`Failed to update tasks: ${firstError}`)
			return
		}

		this.persistAndRefresh(result.board, `Bulk patched ${result.successCount} tasks`)

		if (result.failureCount > 0) {
			vscode.window.showWarningMessage(`Updated ${result.successCount} tasks, ${result.failureCount} failed`)
		} else {
			vscode.window.showInformationMessage(`Updated ${result.successCount} tasks`)
		}
	}

	private async handleTaskActionQuickPick(columnId: string, taskId: string) {
		if (!this._boardFilePath) return

		try {
			const content = fs.readFileSync(this._boardFilePath, "utf8")
			const board = BrainfileParser.parse(content)
			if (!board) return

			const column = board.columns.find((c: Column) => c.id === columnId)
			if (!column) return

			const task = column.tasks.find((t: Task) => t.id === taskId)
			if (!task) return

			const agentRegistry = getAgentRegistry()
			const availableAgents = agentRegistry.getAvailableAgents().filter((a) => a.available)

			interface TaskActionQuickPickItem extends vscode.QuickPickItem {
				action: string
				agentType?: AgentType
				columnId: string
				taskId: string
			}

			const items: TaskActionQuickPickItem[] = []

			// Agent actions
			if (availableAgents.length > 0) {
				items.push({ kind: vscode.QuickPickItemKind.Separator, label: "Send to Agent" } as any) // Type assertion due to kind property
				availableAgents.forEach((agent) => {
					items.push({
						label: `$(debug-start) ${agent.label}`,
						description: agent.type === agentRegistry.getDefaultAgent() ? "Default" : undefined,
						action: "send-agent",
						agentType: agent.type,
						columnId,
						taskId,
					})
				})
			}
			items.push({
				label: `$(clippy) Copy Prompt`,
				action: "send-agent",
				agentType: "copy",
				columnId,
				taskId,
			})
			items.push({ kind: vscode.QuickPickItemKind.Separator, label: "Actions" } as any)

			// Edit actions
			items.push({ label: `$(edit) Edit in file`, action: "edit-task", columnId, taskId })
			items.push({ label: `$(tag) Change Priority`, action: "edit-priority", columnId, taskId })

			// State actions - show Archive if in completion column, otherwise show Complete
			if (this.isCompletionColumn(board, columnId)) {
				items.push({ label: `$(archive) Archive`, action: "archive-task", columnId, taskId })
			} else {
				items.push({ label: `$(check) Mark Complete`, action: "complete-task", columnId, taskId })
			}

			// Destructive
			items.push({ label: `$(trash) Delete`, action: "delete-task", columnId, taskId })

			const selected = await vscode.window.showQuickPick(items, {
				title: `Actions for ${task.title}`,
				placeHolder: "Select an action",
			})

			if (!selected) return

			// Execute the selected action
			switch (selected.action) {
				case "send-agent":
					this.handleSendToAgent(selected.taskId, selected.agentType)
					break
				case "edit-task":
					this.handleEditTask(selected.taskId)
					break
				case "edit-priority":
					this.handleEditPriority(selected.taskId)
					break
				case "archive-task":
					this.handleArchiveTask(selected.columnId, selected.taskId)
					break
				case "complete-task":
					this.handleCompleteTask(selected.taskId, selected.columnId)
					break
				case "delete-task":
					this.handleDeleteTask(selected.columnId, selected.taskId)
					break
				default:
					vscode.window.showErrorMessage(`Unknown action: ${selected.action}`)
			}
		} catch (error) {
			log("Error showing task action quick pick:", error)
			vscode.window.showErrorMessage("Failed to show task actions")
		}
	}

	private createEmptyArchiveBoard(): Board {
		return {
			title: "Archive",
			columns: [],
			archive: [],
		}
	}

	private getNonce(): string {
		let text = ""
		const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length))
		}
		return text
	}

	private getDynamicPriorityCSS(): string {
		const config = vscode.workspace.getConfiguration("brainfile.priorities")

		// Built-in priority colors from settings
		const criticalColor = config.get<string>("criticalColor", "#ffffff")
		const highColor = config.get<string>("highColor", "#cccccc")
		const mediumColor = config.get<string>("mediumColor", "#999999")
		const lowColor = config.get<string>("lowColor", "#666666")
		const customPriorities = config.get<Record<string, string>>("custom", {})

		let css = "/* Priority colors from settings */\n"

		// Override built-in priority colors
		css += `    .task.priority-critical { border-left-color: ${criticalColor}; }\n`
		css += `    .task-priority-label.priority-critical { color: ${criticalColor}; }\n`
		css += `    .task.priority-high { border-left-color: ${highColor}; }\n`
		css += `    .task-priority-label.priority-high { color: ${highColor}; }\n`
		css += `    .task.priority-medium { border-left-color: ${mediumColor}; }\n`
		css += `    .task-priority-label.priority-medium { color: ${mediumColor}; }\n`
		css += `    .task.priority-low { border-left-color: ${lowColor}; }\n`
		css += `    .task-priority-label.priority-low { color: ${lowColor}; }\n`

		// Custom priorities
		for (const [priority, color] of Object.entries(customPriorities)) {
			const className = getPriorityClassName(priority)
			css += `    .task.${className} { border-left-color: ${color}; }\n`
			css += `    .task-priority-label.${className} { color: ${color}; }\n`
		}

		return css
	}

	private getWebviewHtml(webview: vscode.Webview): string {
		const nonce = this.getNonce()
		const distPath = path.join(this._extensionUri.fsPath, "media", "webview")
		const manifestInVite = path.join(distPath, ".vite", "manifest.json")
		const manifestPath = fs.existsSync(manifestInVite) ? manifestInVite : path.join(distPath, "manifest.json")

		if (!fs.existsSync(manifestPath)) {
			const message = "Webview assets not found. Run npm run webview:build."
			log(message)
			return `<html><body><p>${message}</p></body></html>`
		}

		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
		const entry = manifest["index.html"] ?? manifest["src/main.ts"]

		if (!entry || !entry.file) {
			const message = "Invalid Vite manifest for webview."
			log(message)
			return `<html><body><p>${message}</p></body></html>`
		}

		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "webview", entry.file))

		const styles = (entry.css ?? []).map((cssPath: string) =>
			webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "webview", cssPath)),
		)

		const csp = [
			`default-src 'none';`,
			`img-src ${webview.cspSource} https: data:;`,
			`style-src ${webview.cspSource} 'unsafe-inline';`,
			`font-src ${webview.cspSource};`,
			`script-src 'nonce-${nonce}';`,
		].join(" ")

		const styleTags = styles.map((href: vscode.Uri) => `<link rel="stylesheet" href="${href}">`).join("\n")

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
</html>`
	}

	public dispose() {
		// Clean up all resources properly
		this.disposeWatchers()

		// Clear any pending timers
		if (this._refreshTimer) {
			clearTimeout(this._refreshTimer)
			this._refreshTimer = undefined
		}

		// Dispose all tracked disposables
		this._disposables.forEach((d) => {
			try {
				d.dispose()
			} catch (error) {
				log("Error disposing resource:", error)
			}
		})
		this._disposables = []

		// Clear view reference
		this._view = undefined

		log("BoardViewProvider disposed")
	}
}
