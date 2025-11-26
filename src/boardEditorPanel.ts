import * as fs from "node:fs"
import * as path from "node:path"
import {
	type Board,
	BrainfileLinter,
	BrainfileParser,
	BrainfileSerializer,
	type Column,
	discover,
	findPrimaryBrainfile,
	hashBoardContent,
	type Rule,
	type Task,
} from "@brainfile/core"
import * as vscode from "vscode"
import {
	type AgentType,
	addTask,
	buildAgentPrompt,
	createParseWarningMessage,
	deleteTask,
	findColumnById,
	generateErrorHtml,
	getAgentRegistry,
	getPriorityClassName,
	moveTask,
	toggleSubtask,
	updateBoardTitle,
	updateStatsConfig,
	updateTask,
} from "./board"
import { log } from "./extension"

/**
 * BoardEditorPanel - Opens the Brainfile board as an editor tab
 * Uses WebviewPanel API to create a tab in the editor area
 */
export class BoardEditorPanel {
	public static readonly viewType = "brainfile.editorPanel"

	private static currentPanel: BoardEditorPanel | undefined

	private readonly _panel: vscode.WebviewPanel
	private readonly _extensionUri: vscode.Uri
	private readonly _context: vscode.ExtensionContext

	private _boardFilePath?: string
	private _fileWatcher?: vscode.FileSystemWatcher
	private _archiveWatcher?: vscode.FileSystemWatcher
	private _textDocumentListener?: vscode.Disposable
	private _refreshTimer?: NodeJS.Timeout
	private _lastContentHash?: string
	private _lastValidBoard?: Board
	private _parseErrorCount: number = 0
	private _lastUsedAgent: AgentType = "copilot"
	private _webviewReady: boolean = false
	private _pendingBoard?: Board | null
	private _disposables: vscode.Disposable[] = []

	/**
	 * Create or show the editor panel
	 * @param extensionUri Extension URI for resource loading
	 * @param context Extension context
	 * @param filePath Optional specific brainfile path to open
	 */
	public static createOrShow(
		extensionUri: vscode.Uri,
		context: vscode.ExtensionContext,
		filePath?: string,
	): BoardEditorPanel {
		const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : vscode.ViewColumn.One

		// If panel already exists, reveal it and optionally switch file
		if (BoardEditorPanel.currentPanel) {
			BoardEditorPanel.currentPanel._panel.reveal(column)
			if (filePath && filePath !== BoardEditorPanel.currentPanel._boardFilePath) {
				BoardEditorPanel.currentPanel._switchToFile(filePath)
			}
			return BoardEditorPanel.currentPanel
		}

		// Create new panel
		const panel = vscode.window.createWebviewPanel(
			BoardEditorPanel.viewType,
			"Brainfile Board",
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [extensionUri],
			},
		)

		BoardEditorPanel.currentPanel = new BoardEditorPanel(panel, extensionUri, context, filePath)
		return BoardEditorPanel.currentPanel
	}

	/**
	 * Revive panel from serialized state (for persistence across restarts)
	 */
	public static revive(
		panel: vscode.WebviewPanel,
		extensionUri: vscode.Uri,
		context: vscode.ExtensionContext,
	): BoardEditorPanel {
		BoardEditorPanel.currentPanel = new BoardEditorPanel(panel, extensionUri, context)
		return BoardEditorPanel.currentPanel
	}

	private constructor(
		panel: vscode.WebviewPanel,
		extensionUri: vscode.Uri,
		context: vscode.ExtensionContext,
		filePath?: string,
	) {
		this._panel = panel
		this._extensionUri = extensionUri
		this._context = context
		this._boardFilePath = filePath // Use provided path if given

		// Load last-used agent from workspace state
		const saved = context.workspaceState.get<AgentType>("brainfile.lastUsedAgent")
		if (saved) {
			this._lastUsedAgent = saved
		}

		// Set panel icon
		this._panel.iconPath = {
			light: vscode.Uri.joinPath(extensionUri, "icon.png"),
			dark: vscode.Uri.joinPath(extensionUri, "icon.png"),
		}

		// Initialize the panel
		this._initializePanel()
	}

	/**
	 * Switch to a different brainfile
	 */
	private _switchToFile(filePath: string) {
		if (!fs.existsSync(filePath)) {
			log(`Editor panel: File not found: ${filePath}`)
			return
		}

		log(`Editor panel: Switching to file: ${filePath}`)
		this._boardFilePath = filePath
		this._lastContentHash = undefined
		this._lastValidBoard = undefined
		this._disposeWatchers()
		this._watchFile()
		this._updateView(true)

		// Update panel title
		const fileName = path.basename(filePath)
		this._panel.title = `Brainfile: ${fileName}`
	}

	private async _initializePanel() {
		// Find brainfile if not already provided
		if (!this._boardFilePath) {
			await this._findBrainfileFile()
		}

		if (this._boardFilePath) {
			log("Editor panel: Board file found:", this._boardFilePath)
			this._updateView()
			this._watchFile()

			// Update panel title with filename
			const fileName = path.basename(this._boardFilePath)
			this._panel.title = `Brainfile: ${fileName}`
		}

		// Handle messages from webview
		this._panel.webview.onDidReceiveMessage((data) => this._handleMessage(data), null, this._disposables)

		// Handle panel disposal
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables)

		// Handle visibility changes
		this._panel.onDidChangeViewState(
			(e) => {
				if (e.webviewPanel.visible) {
					this._updateView()
				}
			},
			null,
			this._disposables,
		)

		// Listen for settings changes
		vscode.workspace.onDidChangeConfiguration(
			(e) => {
				if (e.affectsConfiguration("brainfile.priorities")) {
					log("Priority settings changed, refreshing editor panel")
					this._updateView(false)
				}
			},
			null,
			this._disposables,
		)
	}

	private async _findBrainfileFile() {
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders) return

		const rootPath = workspaceFolders[0].uri.fsPath

		// Use core's findPrimaryBrainfile for consistent discovery
		// Priority: brainfile.md > .brainfile.md > .bb.md > brainfile.*.md
		const primary = findPrimaryBrainfile(rootPath)
		if (primary) {
			this._boardFilePath = primary.absolutePath
		}
	}

	private _watchFile() {
		if (!this._boardFilePath) return

		this._disposeWatchers()

		const boardUri = vscode.Uri.file(this._boardFilePath)
		const boardFolder = vscode.workspace.getWorkspaceFolder(boardUri)
		if (!boardFolder) return

		const rootPath = boardFolder.uri.fsPath
		const boardRelative = path.relative(rootPath, this._boardFilePath)
		const boardPattern = new vscode.RelativePattern(rootPath, boardRelative)

		this._fileWatcher = vscode.workspace.createFileSystemWatcher(boardPattern, false, false, false)

		this._fileWatcher.onDidChange(() => {
			this._scheduleBoardRefresh("file-change")
		})

		this._fileWatcher.onDidCreate((uri) => {
			this._boardFilePath = uri.fsPath
			this._scheduleBoardRefresh("file-create")
		})

		this._fileWatcher.onDidDelete(() => {
			this._boardFilePath = undefined
			this._updateView(true)
		})

		// Watch for text document changes
		this._textDocumentListener = vscode.workspace.onDidChangeTextDocument((event) => {
			if (event.document.uri.fsPath === this._boardFilePath) {
				this._scheduleBoardRefresh("document-change")
			}
		})

		// Also watch archive file
		const archivePath = this._getArchivePath()
		if (archivePath) {
			const archiveRelative = path.relative(rootPath, archivePath)
			const archivePattern = new vscode.RelativePattern(rootPath, archiveRelative)
			this._archiveWatcher = vscode.workspace.createFileSystemWatcher(archivePattern, false, false, false)
			this._archiveWatcher.onDidChange(() => {
				this._scheduleBoardRefresh("archive-change")
			})
		}
	}

	private _scheduleBoardRefresh(reason: string) {
		if (this._refreshTimer) {
			clearTimeout(this._refreshTimer)
		}

		const debounceTime = reason === "document-change" ? 500 : 150

		this._refreshTimer = setTimeout(() => {
			this._refreshBoardFromSource(reason)
		}, debounceTime)
	}

	private async _refreshBoardFromSource(reason: string) {
		if (!this._boardFilePath) return

		try {
			const content = await this._readBoardContent()
			const currentHash = hashBoardContent(content)

			if (currentHash === this._lastContentHash) {
				return
			}

			log(`Editor panel: Refreshing due to ${reason}`)
			this._lastContentHash = currentHash
			this._updateView(false, content)
		} catch (error) {
			log("Editor panel: Error refreshing:", error)
		}
	}

	private async _readBoardContent(): Promise<string> {
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

	private _updateView(forceFullRefresh: boolean = false, contentOverride?: string) {
		if (!this._boardFilePath) {
			log("Editor panel: No board file")
			return
		}

		try {
			const content = contentOverride ?? fs.readFileSync(this._boardFilePath, "utf8")
			const board = BrainfileParser.parse(content)

			if (!board) {
				this._parseErrorCount++

				if (this._lastValidBoard && this._parseErrorCount <= 3) {
					if (this._webviewReady) {
						const lintResult = BrainfileLinter.lint(content)
						const firstIssue = lintResult.issues[0]
						const summary = firstIssue
							? `${firstIssue.message}${firstIssue.line ? ` (line ${firstIssue.line})` : ""}`
							: "Syntax error in brainfile.md"
						this._panel.webview.postMessage(
							createParseWarningMessage(`Parse error: ${summary} - showing last valid state`, lintResult),
						)
						this._postBoardUpdate(this._lastValidBoard)
					}
					return
				}

				const lintResult = BrainfileLinter.lint(content)
				this._panel.webview.html = generateErrorHtml({
					message: "Failed to parse brainfile.md",
					details: "Check for YAML syntax errors in the frontmatter.",
					lintResult,
				})
				this._webviewReady = false
				return
			}

			this._parseErrorCount = 0
			this._loadArchive(board)
			const newHash = hashBoardContent(content)

			this._lastValidBoard = board
			this._lastContentHash = newHash

			this._ensureWebviewHtml(forceFullRefresh)
			this._postBoardUpdate(board)
		} catch (error) {
			log("Editor panel: Error updating view:", error)
		}
	}

	private _ensureWebviewHtml(forceFullRefresh: boolean) {
		if (!this._webviewReady || forceFullRefresh) {
			this._webviewReady = false
			this._pendingBoard = this._lastValidBoard ?? null
			this._panel.webview.html = this._getWebviewHtml()
		}
	}

	private _postBoardUpdate(board: Board | null) {
		const payload = {
			type: "boardUpdate",
			board,
			priorityStyles: this._getDynamicPriorityCSS(),
		}

		if (this._webviewReady) {
			this._panel.webview.postMessage(payload)
		} else {
			this._pendingBoard = board
		}
	}

	private _handleMessage(data: any) {
		log("Editor panel received message:", data.type)

		switch (data.type) {
			case "webviewReady":
				this._webviewReady = true
				if (this._pendingBoard !== undefined) {
					this._postBoardUpdate(this._pendingBoard)
					this._pendingBoard = undefined
				} else if (this._lastValidBoard) {
					this._postBoardUpdate(this._lastValidBoard)
				}
				this._postAvailableAgents()
				break
			case "updateTask":
				this._handleUpdateTask(data.columnId, data.taskId, data.title, data.description)
				break
			case "editTask":
				this._handleEditTask(data.taskId)
				break
			case "editPriority":
				this._handleEditPriority(data.taskId)
				break
			case "deleteTask":
				this._handleDeleteTask(data.columnId, data.taskId)
				break
			case "moveTask":
				this._handleMoveTask(data.taskId, data.fromColumn, data.toColumn, data.toIndex)
				break
			case "updateTitle":
				this._handleUpdateTitle(data.title)
				break
			case "openFile":
				this._handleOpenFile(data.filePath)
				break
			case "openSettings":
				vscode.commands.executeCommand("workbench.action.openSettings", "brainfile")
				break
			case "archiveTask":
				this._handleArchiveTask(data.columnId, data.taskId)
				break
			case "completeTask":
				this._handleCompleteTask(data.taskId, data.columnId)
				break
			case "addTaskToColumn":
				this._handleAddTaskToColumn(data.columnId)
				break
			case "addRuleInline":
				this._handleAddRuleInline(data.ruleType, data.ruleText)
				break
			case "updateRule":
				this._handleUpdateRule(data.ruleId, data.ruleType, data.ruleText)
				break
			case "deleteRule":
				this._handleDeleteRule(data.ruleId, data.ruleType)
				break
			case "toggleSubtask":
				this._handleToggleSubtask(data.taskId, data.subtaskId)
				break
			case "saveStatsConfig":
				this._handleSaveStatsConfig(data.columns)
				break
			case "fix-issues":
				this._handleFixIssues()
				break
			case "refresh":
				this._updateView()
				break
			case "sendToAgent":
				this._handleSendToAgent(data.taskId, data.agentType)
				break
			case "getAvailableAgents":
				this._postAvailableAgents()
				break
		}
	}

	// Agent detection methods - using AgentRegistry
	private _postAvailableAgents() {
		const registry = getAgentRegistry()

		// Sync last used from workspace state
		if (this._lastUsedAgent) {
			registry.setLastUsed(this._lastUsedAgent)
		}

		const agents = registry.getAvailableAgents()
		const defaultAgent = registry.getDefaultAgent()
		this._panel.webview.postMessage({
			type: "agentsDetected",
			agents,
			defaultAgent,
			lastUsed: registry.getLastUsed() || defaultAgent,
		})
	}

	// Board operation handlers
	private _persistAndRefresh(board: Board, logMessage: string) {
		if (!this._boardFilePath) return

		const newContent = BrainfileSerializer.serialize(board)
		fs.writeFileSync(this._boardFilePath, newContent, "utf8")
		log(logMessage)

		this._lastContentHash = hashBoardContent(newContent)
		this._updateView(false, newContent)
	}

	private _handleUpdateTask(columnId: string, taskId: string, newTitle: string, newDescription: string) {
		if (!this._boardFilePath) return

		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		const result = updateTask(board, columnId, taskId, newTitle, newDescription)
		if (!result.success || !result.board) return

		this._persistAndRefresh(result.board, "Task updated")
	}

	private _handleDeleteTask(columnId: string, taskId: string) {
		if (!this._boardFilePath) return

		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		const result = deleteTask(board, columnId, taskId)
		if (!result.success || !result.board) return

		this._persistAndRefresh(result.board, "Task deleted")
	}

	private _handleMoveTask(taskId: string, fromColumnId: string, toColumnId: string, toIndex: number) {
		if (!this._boardFilePath) return

		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		const result = moveTask(board, taskId, fromColumnId, toColumnId, toIndex)
		if (!result.success || !result.board) return

		this._persistAndRefresh(result.board, "Task moved")
	}

	/**
	 * Find the "completion" column - the column tasks should move to when marked complete.
	 * Looks for columns with names like "done", "complete", "finished", etc.
	 * Falls back to the last column if no match is found.
	 */
	private _findCompletionColumn(board: Board): Column | undefined {
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

	private _handleCompleteTask(taskId: string, fromColumnId: string) {
		if (!this._boardFilePath) return

		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		// Find the completion column
		const completionColumn = this._findCompletionColumn(board)

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
			vscode.window.showErrorMessage(`Failed to complete task: ${result.error}`)
			return
		}

		this._persistAndRefresh(result.board, `Task moved to ${completionColumn.title}`)
	}

	private _handleUpdateTitle(newTitle: string) {
		if (!this._boardFilePath) return

		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		const result = updateBoardTitle(board, newTitle)
		if (!result.success || !result.board) return

		this._persistAndRefresh(result.board, "Title updated")
	}

	private async _handleEditTask(taskId: string) {
		if (!this._boardFilePath) return

		try {
			const content = fs.readFileSync(this._boardFilePath, "utf8")
			const location = BrainfileParser.findTaskLocation(content, taskId)

			if (!location) {
				vscode.window.showErrorMessage(`Could not find task ${taskId}`)
				return
			}

			const uri = vscode.Uri.file(this._boardFilePath)
			const document = await vscode.workspace.openTextDocument(uri)
			const position = new vscode.Position(location.line - 1, location.column)
			const range = new vscode.Range(position, position)

			await vscode.window.showTextDocument(document, {
				selection: range,
				viewColumn: vscode.ViewColumn.Beside,
				preserveFocus: false,
			})
		} catch (error) {
			log("Error opening task:", error)
		}
	}

	private async _handleEditPriority(taskId: string) {
		if (!this._boardFilePath) return

		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		let targetTask: { task: Task; columnId: string } | null = null
		for (const col of board.columns) {
			const task = col.tasks.find((t: Task) => t.id === taskId)
			if (task) {
				targetTask = { task, columnId: col.id }
				break
			}
		}

		if (!targetTask) return

		const priorities = [
			{ label: "critical", description: "Highest priority" },
			{ label: "high", description: "High priority" },
			{ label: "medium", description: "Medium priority" },
			{ label: "low", description: "Low priority" },
			{ label: "$(edit) Custom...", description: "Enter a custom priority" },
			{ label: "$(close) Remove priority", description: "Remove priority" },
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

		;(targetTask.task as any).priority = newPriority
		this._persistAndRefresh(board, `Priority updated to: ${newPriority || "none"}`)
	}

	private async _handleSendToAgent(taskId: string, agentType?: AgentType) {
		if (!this._boardFilePath) return

		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

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

		if (!targetTask) return

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
		this._context.workspaceState.update("brainfile.lastUsedAgent", agent)

		const result = await registry.sendToAgent(agent, prompt)
		if (!result.success) {
			vscode.window.showErrorMessage(result.message || "Failed to send to agent")
		} else if (result.copiedToClipboard && result.message) {
			vscode.window.showInformationMessage(result.message)
		}
	}

	private async _handleOpenFile(filePath: string) {
		try {
			const match = filePath.match(/^(.+):(\d+)$/)
			let actualPath = filePath
			let lineNumber = 0

			if (match) {
				actualPath = match[1]
				lineNumber = parseInt(match[2], 10) - 1
			}

			const workspaceFolders = vscode.workspace.workspaceFolders
			if (!workspaceFolders) return

			const absolutePath = path.isAbsolute(actualPath)
				? actualPath
				: path.join(workspaceFolders[0].uri.fsPath, actualPath)

			const uri = vscode.Uri.file(absolutePath)
			const document = await vscode.workspace.openTextDocument(uri)
			const editor = await vscode.window.showTextDocument(document)

			if (lineNumber > 0) {
				const position = new vscode.Position(lineNumber, 0)
				editor.selection = new vscode.Selection(position, position)
				editor.revealRange(new vscode.Range(position, position))
			}
		} catch (error) {
			log("Error opening file:", error)
			vscode.window.showErrorMessage(`Failed to open file: ${filePath}`)
		}
	}

	private _handleArchiveTask(columnId: string, taskId: string) {
		if (!this._boardFilePath) return

		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

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

		if (!taskToArchive) return

		// Save main board
		const newContent = BrainfileSerializer.serialize(board)
		fs.writeFileSync(this._boardFilePath, newContent, "utf8")
		this._lastContentHash = hashBoardContent(newContent)

		// Save to archive file
		const archivePath = this._getArchivePath()
		if (archivePath) {
			let archiveBoard: Board
			if (fs.existsSync(archivePath)) {
				const archiveContent = fs.readFileSync(archivePath, "utf8")
				archiveBoard = BrainfileParser.parse(archiveContent) || this._createEmptyArchiveBoard()
			} else {
				archiveBoard = this._createEmptyArchiveBoard()
			}

			if (!archiveBoard.archive) archiveBoard.archive = []
			archiveBoard.archive.unshift(taskToArchive)

			const archiveContent = BrainfileSerializer.serialize(archiveBoard)
			fs.writeFileSync(archivePath, archiveContent, "utf8")
		}

		vscode.window.showInformationMessage(`Task "${taskToArchive.title}" archived`)
		this._updateView(false, newContent)
	}

	private async _handleAddTaskToColumn(columnId: string) {
		if (!this._boardFilePath) return

		const title = await vscode.window.showInputBox({
			prompt: "Task title",
			placeHolder: "Enter task title",
			validateInput: (value) => (!value?.trim() ? "Task title is required" : null),
		})

		if (!title) return

		const description = await vscode.window.showInputBox({
			prompt: "Task description (optional)",
			placeHolder: "Enter task description",
		})

		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		const result = addTask(board, columnId, { title, description: description || "" })
		if (!result.success || !result.board) return

		const column = findColumnById(board, columnId)
		this._persistAndRefresh(result.board, `Added task to ${column?.title || columnId}`)
		vscode.window.showInformationMessage(`Added task "${title}"`)
	}

	private _handleToggleSubtask(taskId: string, subtaskId: string) {
		if (!this._boardFilePath) return

		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		const result = toggleSubtask(board, taskId, subtaskId)
		if (!result.success || !result.board) return

		this._persistAndRefresh(result.board, `Subtask ${subtaskId} toggled`)
	}

	private _handleAddRuleInline(ruleType: string, ruleText: string) {
		if (!this._boardFilePath) return

		const validType = ruleType as "always" | "never" | "prefer" | "context"
		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		if (!board.rules) {
			board.rules = { always: [], never: [], prefer: [], context: [] }
		}
		if (!board.rules[validType]) {
			board.rules[validType] = []
		}

		const existingIds = board.rules[validType].map((r: Rule) => r.id)
		const maxId = Math.max(0, ...existingIds)
		board.rules[validType].push({ id: maxId + 1, rule: ruleText.trim() })

		this._persistAndRefresh(board, `Added ${validType} rule`)
	}

	private _handleUpdateRule(ruleId: number, ruleType: string, ruleText: string) {
		if (!this._boardFilePath) return

		const validType = ruleType as "always" | "never" | "prefer" | "context"
		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board?.rules?.[validType]) return

		const rule = board.rules[validType].find((r: Rule) => r.id === ruleId)
		if (!rule) return

		rule.rule = ruleText.trim()
		this._persistAndRefresh(board, `Updated ${validType} rule ${ruleId}`)
	}

	private async _handleDeleteRule(ruleId: string, ruleType: "always" | "never" | "prefer" | "context") {
		if (!this._boardFilePath) return

		const confirm = await vscode.window.showWarningMessage(`Delete ${ruleType} rule ${ruleId}?`, "Delete", "Cancel")
		if (confirm !== "Delete") return

		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board?.rules?.[ruleType]) return

		const ruleIdNum = parseInt(ruleId, 10)
		const ruleIndex = board.rules[ruleType].findIndex((r: Rule) => r.id === ruleIdNum)
		if (ruleIndex !== -1) {
			board.rules[ruleType].splice(ruleIndex, 1)
			this._persistAndRefresh(board, `Deleted ${ruleType} rule ${ruleId}`)
		}
	}

	private _handleSaveStatsConfig(columns: string[]) {
		if (!this._boardFilePath) return

		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const board = BrainfileParser.parse(content)
		if (!board) return

		let updatedBoard: Board
		if (columns.length > 0) {
			const result = updateStatsConfig(board, columns.slice(0, 4))
			if (!result.success || !result.board) return
			updatedBoard = result.board
		} else {
			updatedBoard = { ...board }
			delete updatedBoard.statsConfig
		}

		this._persistAndRefresh(updatedBoard, "Stats config saved")
		vscode.window.showInformationMessage("Stats configuration saved")
	}

	private async _handleFixIssues() {
		if (!this._boardFilePath) return

		const content = fs.readFileSync(this._boardFilePath, "utf8")
		const result = BrainfileLinter.lint(content, { autoFix: true })

		if (!result.fixedContent) {
			vscode.window.showInformationMessage("No fixable issues found")
			return
		}

		const choice = await vscode.window.showInformationMessage(
			`Found ${result.issues.filter((i) => i.fixable).length} fixable issue(s). Apply fixes?`,
			{ modal: true },
			"Apply Fixes",
			"Preview Changes",
		)

		if (choice === "Preview Changes") {
			const fixedDoc = await vscode.workspace.openTextDocument({
				content: result.fixedContent,
				language: "markdown",
			})
			await vscode.commands.executeCommand(
				"vscode.diff",
				vscode.Uri.file(this._boardFilePath),
				fixedDoc.uri,
				"brainfile.md: Original ↔ Fixed",
			)

			const applyChoice = await vscode.window.showInformationMessage("Apply these fixes?", "Apply Fixes", "Cancel")
			if (applyChoice !== "Apply Fixes") return
		} else if (choice !== "Apply Fixes") {
			return
		}

		fs.writeFileSync(this._boardFilePath, result.fixedContent, "utf8")
		this._lastContentHash = hashBoardContent(result.fixedContent)
		vscode.window.showInformationMessage(`Fixed ${result.issues.filter((i) => i.fixable).length} issue(s)!`)
		this._updateView()
	}

	// Helper methods
	private _getArchivePath(): string | undefined {
		if (!this._boardFilePath) return

		// Archive file lives in the same directory as the board file
		const boardDir = path.dirname(this._boardFilePath)
		const mainFilename = path.basename(this._boardFilePath)
		const archiveFilename = mainFilename.replace(/\.md$/, "-archive.md")
		return path.join(boardDir, archiveFilename)
	}

	private _loadArchive(board: Board) {
		const archivePath = this._getArchivePath()
		if (!archivePath || !fs.existsSync(archivePath)) {
			board.archive = []
			return
		}

		try {
			const archiveContent = fs.readFileSync(archivePath, "utf8")
			const archiveBoard = BrainfileParser.parse(archiveContent)
			board.archive = archiveBoard?.archive || []
		} catch {
			board.archive = []
		}
	}

	private _createEmptyArchiveBoard(): Board {
		return { title: "Archive", columns: [], archive: [] }
	}

	private _getNonce(): string {
		let text = ""
		const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length))
		}
		return text
	}

	private _getDynamicPriorityCSS(): string {
		const config = vscode.workspace.getConfiguration("brainfile.priorities")

		const criticalColor = config.get<string>("criticalColor", "#ffffff")
		const highColor = config.get<string>("highColor", "#cccccc")
		const mediumColor = config.get<string>("mediumColor", "#999999")
		const lowColor = config.get<string>("lowColor", "#666666")
		const customPriorities = config.get<Record<string, string>>("custom", {})

		let css = "/* Priority colors from settings */\n"
		css += `    .task.priority-critical { border-left-color: ${criticalColor}; }\n`
		css += `    .task-priority-label.priority-critical { color: ${criticalColor}; }\n`
		css += `    .task.priority-high { border-left-color: ${highColor}; }\n`
		css += `    .task-priority-label.priority-high { color: ${highColor}; }\n`
		css += `    .task.priority-medium { border-left-color: ${mediumColor}; }\n`
		css += `    .task-priority-label.priority-medium { color: ${mediumColor}; }\n`
		css += `    .task.priority-low { border-left-color: ${lowColor}; }\n`
		css += `    .task-priority-label.priority-low { color: ${lowColor}; }\n`

		for (const [priority, color] of Object.entries(customPriorities)) {
			const className = getPriorityClassName(priority)
			css += `    .task.${className} { border-left-color: ${color}; }\n`
			css += `    .task-priority-label.${className} { color: ${color}; }\n`
		}

		return css
	}

	private _getWebviewHtml(): string {
		const webview = this._panel.webview
		const nonce = this._getNonce()
		const distPath = path.join(this._extensionUri.fsPath, "media", "webview")
		const manifestInVite = path.join(distPath, ".vite", "manifest.json")
		const manifestPath = fs.existsSync(manifestInVite) ? manifestInVite : path.join(distPath, "manifest.json")

		if (!fs.existsSync(manifestPath)) {
			return `<html><body><p>Webview assets not found. Run npm run webview:build.</p></body></html>`
		}

		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
		const entry = manifest["index.html"] ?? manifest["src/main.ts"]

		if (!entry?.file) {
			return `<html><body><p>Invalid Vite manifest for webview.</p></body></html>`
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

	private _disposeWatchers() {
		if (this._fileWatcher) {
			this._fileWatcher.dispose()
			this._fileWatcher = undefined
		}
		if (this._archiveWatcher) {
			this._archiveWatcher.dispose()
			this._archiveWatcher = undefined
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

	public dispose() {
		BoardEditorPanel.currentPanel = undefined

		this._disposeWatchers()
		this._panel.dispose()

		while (this._disposables.length) {
			const disposable = this._disposables.pop()
			if (disposable) disposable.dispose()
		}

		log("BoardEditorPanel disposed")
	}
}

/**
 * Serializer to restore editor panels across VS Code restarts
 */
export class BoardEditorPanelSerializer implements vscode.WebviewPanelSerializer {
	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _context: vscode.ExtensionContext,
	) {}

	async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, _state: any): Promise<void> {
		log("Reviving BoardEditorPanel from saved state")
		BoardEditorPanel.revive(webviewPanel, this._extensionUri, this._context)
	}
}
