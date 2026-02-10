import * as fs from "node:fs"
import {
	BrainfileLinter,
	BrainfileParser,
	BrainfileSerializer,
	type Column,
	type DiscoveredFile,
	discover,
	type Task,
} from "@brainfile/core"
import * as vscode from "vscode"
import { buildAgentPrompt, getAgentRegistry } from "./board"
import { BoardEditorPanel, BoardEditorPanelSerializer } from "./boardEditorPanel"
import { BoardViewProvider } from "./boardViewProvider"
import { BrainfileCodeLensProvider } from "./codeLensProvider"
import { BrainfileCompletionProvider } from "./completionProvider"
import { BrainfileDecorationProvider } from "./fileDecorationProvider"
import { BrainfileHoverProvider } from "./hoverProvider"

const LOG_PREFIX = "[Brainfile]"
let outputChannel: vscode.OutputChannel | undefined

export function log(...args: any[]) {
	const message = args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(" ")

	console.log(LOG_PREFIX, ...args)

	if (outputChannel) {
		outputChannel.appendLine(`${new Date().toISOString()} ${message}`)
	}
}

/**
 * Check if a filename matches brainfile patterns:
 * - brainfile.md, .brainfile.md, .bb.md, brainfile.*.md
 */
export function isBrainfile(fileName: string): boolean {
	const basename = fileName.split(/[/\\]/).pop() || ""
	return (
		basename === "brainfile.md" ||
		basename === ".brainfile.md" ||
		basename === ".bb.md" ||
		/^brainfile\..+\.md$/.test(basename)
	)
}

export function activate(context: vscode.ExtensionContext) {
	// Create output channel for logging
	outputChannel = vscode.window.createOutputChannel("Brainfile")
	context.subscriptions.push(outputChannel)

	log("Extension activated")

	try {
		// Register the tasks view provider
		const provider = new BoardViewProvider(context.extensionUri, context)

		// Register webview provider with proper options
		const webviewDisposable = vscode.window.registerWebviewViewProvider(BoardViewProvider.viewType, provider, {
			// Ensure webview content is retained when hidden
			webviewOptions: {
				retainContextWhenHidden: true,
			},
		})
		context.subscriptions.push(webviewDisposable)

		// Add provider to subscriptions for proper disposal
		context.subscriptions.push(provider as any)

		// Register quick switch command (Cmd+Shift+B)
		context.subscriptions.push(
			vscode.commands.registerCommand("brainfile.quickSwitch", async () => {
				const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
				if (!workspaceRoot) {
					vscode.window.showInformationMessage("No workspace folder open")
					return
				}

				const result = discover(workspaceRoot)
				if (result.files.length === 0) {
					vscode.window.showInformationMessage("No brainfiles found in workspace")
					return
				}

				const items = result.files.map((file: DiscoveredFile) => ({
					label: file.name,
					description: `${file.itemCount} items`,
					detail: file.relativePath,
					file,
				}))

				const selected = await vscode.window.showQuickPick(items, {
					placeHolder: "Select a brainfile to open (Cmd+Shift+B)",
					matchOnDescription: true,
					matchOnDetail: true,
				})

				if (selected) {
					await provider.switchFile(selected.file.absolutePath)
				}
			}),
		)
		log("Quick switch command registered")

		// Register commands
		context.subscriptions.push(
			vscode.commands.registerCommand("brainfile.refresh", () => {
				log("Refreshing tasks")
				provider.refresh()
			}),
		)

		context.subscriptions.push(
			vscode.commands.registerCommand("brainfile.createBoard", () => {
				log("Creating new Brainfile board")
				provider.createBoard()
			}),
		)

		context.subscriptions.push(
			vscode.commands.registerCommand("brainfile.addTask", () => {
				log("Quick adding task")
				provider.quickAddTask()
			}),
		)

		// Register "Open in Editor Tab" command
		context.subscriptions.push(
			vscode.commands.registerCommand("brainfile.openInEditor", (uri?: vscode.Uri) => {
				// Get file path from URI, active editor, or sidebar
				let filePath: string | undefined
				if (uri) {
					filePath = uri.fsPath
				} else if (vscode.window.activeTextEditor && isBrainfile(vscode.window.activeTextEditor.document.fileName)) {
					filePath = vscode.window.activeTextEditor.document.fileName
				} else {
					filePath = provider.getBoardFilePath()
				}

				log("Opening board in editor tab:", filePath || "auto-discover")
				BoardEditorPanel.createOrShow(context.extensionUri, context, filePath)
			}),
		)

		// Register serializer for editor panel persistence across restarts
		context.subscriptions.push(
			vscode.window.registerWebviewPanelSerializer(
				BoardEditorPanel.viewType,
				new BoardEditorPanelSerializer(context.extensionUri, context),
			),
		)

		// Register completion provider for all brainfile patterns
		const completionProvider = new BrainfileCompletionProvider()
		context.subscriptions.push(
			vscode.languages.registerCompletionItemProvider(
				[
					{ pattern: "**/brainfile.md", scheme: "file" },
					{ pattern: "**/.brainfile.md", scheme: "file" },
					{ pattern: "**/.bb.md", scheme: "file" },
					{ pattern: "**/brainfile.*.md", scheme: "file" },
				],
				completionProvider,
				" ", // Trigger on space
				":", // Trigger on colon
				"-", // Trigger on dash (for arrays)
			),
		)
		log("Completion provider registered")

		// Register CodeLens provider if enabled
		const config = vscode.workspace.getConfiguration("brainfile")
		if (config.get("enableCodeLens", true)) {
			const codeLensProvider = new BrainfileCodeLensProvider()
			// Register for all brainfile patterns: brainfile.md, .brainfile.md, .bb.md, brainfile.*.md
			context.subscriptions.push(
				vscode.languages.registerCodeLensProvider(
					[
						{ pattern: "**/brainfile.md", scheme: "file" },
						{ pattern: "**/.brainfile.md", scheme: "file" },
						{ pattern: "**/.bb.md", scheme: "file" },
						{ pattern: "**/brainfile.*.md", scheme: "file" },
					],
					codeLensProvider,
				),
			)
			log("CodeLens provider registered")

			// Register CodeLens commands
			registerCodeLensCommands(context, provider)
		}

		// Register Hover provider for all brainfile patterns
		const hoverProvider = new BrainfileHoverProvider()
		context.subscriptions.push(
			vscode.languages.registerHoverProvider(
				[
					{ pattern: "**/brainfile.md", scheme: "file" },
					{ pattern: "**/.brainfile.md", scheme: "file" },
					{ pattern: "**/.bb.md", scheme: "file" },
					{ pattern: "**/brainfile.*.md", scheme: "file" },
				],
				hoverProvider,
			),
		)
		log("Hover provider registered")

		// Register File Decoration provider
		const decorationProvider = new BrainfileDecorationProvider()
		context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorationProvider))
		context.subscriptions.push(decorationProvider)
		log("File decoration provider registered")

		// Set context for keybinding
		vscode.commands.executeCommand("setContext", "brainfile.boardActive", true)

		log("All providers and commands registered")
	} catch (error) {
		log("Error activating extension:", error)
		vscode.window.showErrorMessage("Failed to activate Brainfile extension")
	}
}

/**
 * Write content to file and update the editor if the document is open
 */
async function writeAndRefreshDocument(uri: vscode.Uri, content: string): Promise<void> {
	// Write to file system
	fs.writeFileSync(uri.fsPath, content)

	// If the document is open in an editor, update it
	const openDoc = vscode.workspace.textDocuments.find((doc) => doc.uri.fsPath === uri.fsPath)
	if (openDoc) {
		const edit = new vscode.WorkspaceEdit()
		const fullRange = new vscode.Range(openDoc.positionAt(0), openDoc.positionAt(openDoc.getText().length))
		edit.replace(uri, fullRange, content)
		await vscode.workspace.applyEdit(edit)
	}
}

function registerCodeLensCommands(context: vscode.ExtensionContext, boardProvider: BoardViewProvider) {
	// Open Board command - opens sidebar and switches to the file
	context.subscriptions.push(
		vscode.commands.registerCommand("brainfile.codelens.openBoard", (uri?: vscode.Uri) => {
			// If URI provided, switch sidebar to that file
			if (uri) {
				boardProvider.switchToFile(uri.fsPath)
			}
			vscode.commands.executeCommand("brainfile.tasksView.focus")
		}),
	)

	// Validate command
	context.subscriptions.push(
		vscode.commands.registerCommand("brainfile.codelens.validate", async (uri: vscode.Uri) => {
			try {
				const content = fs.readFileSync(uri.fsPath, "utf8")
				const board = BrainfileParser.parse(content)
				if (board) {
					vscode.window.showInformationMessage("Brainfile is valid!")
				} else {
					vscode.window.showErrorMessage("Brainfile has validation errors.")
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Validation failed: ${error}`)
			}
		}),
	)

	// Add Task to Column command
	context.subscriptions.push(
		vscode.commands.registerCommand("brainfile.codelens.addTaskToColumn", async (uri: vscode.Uri, columnId: string) => {
			const title = await vscode.window.showInputBox({
				prompt: "Enter task title",
				placeHolder: "New task title...",
			})
			if (!title) return

			try {
				const content = fs.readFileSync(uri.fsPath, "utf8")
				const board = BrainfileParser.parse(content)
				if (!board) return

				const column = board.columns.find((c: Column) => c.id === columnId)
				if (!column) return

				// Generate new task ID
				const allTaskIds = board.columns.flatMap((c: Column) => c.tasks.map((t: Task) => t.id))
				const maxNum = Math.max(
					0,
					...allTaskIds.map((id: string) => {
						const match = id.match(/task-(\d+)/)
						return match ? parseInt(match[1], 10) : 0
					}),
				)
				const newId = `task-${maxNum + 1}`

				column.tasks.push({
					id: newId,
					title,
					description: "",
					priority: "medium",
					tags: [],
				})

				const newContent = BrainfileSerializer.serialize(board)
				await writeAndRefreshDocument(uri, newContent)
				boardProvider.refresh()
				vscode.window.showInformationMessage(`Task "${title}" added to ${column.title}`)
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to add task: ${error}`)
			}
		}),
	)

	// Archive Task command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"brainfile.codelens.archiveTask",
			async (uri: vscode.Uri, columnId: string, taskId: string) => {
				const confirm = await vscode.window.showQuickPick(["Yes", "No"], {
					placeHolder: `Archive task ${taskId}?`,
				})
				if (confirm !== "Yes") return

				try {
					const content = fs.readFileSync(uri.fsPath, "utf8")
					const board = BrainfileParser.parse(content)
					if (!board) return

					const column = board.columns.find((c: Column) => c.id === columnId)
					if (!column) return

					const taskIndex = column.tasks.findIndex((t: Task) => t.id === taskId)
					if (taskIndex === -1) return

					const [task] = column.tasks.splice(taskIndex, 1)
					if (!board.archive) board.archive = []
					board.archive.push(task)

					const newContent = BrainfileSerializer.serialize(board)
					await writeAndRefreshDocument(uri, newContent)
					boardProvider.refresh()
					vscode.window.showInformationMessage(`Task "${task.title}" archived`)
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to archive task: ${error}`)
				}
			},
		),
	)

	// Delete Task command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"brainfile.codelens.deleteTask",
			async (uri: vscode.Uri, columnId: string, taskId: string) => {
				const confirm = await vscode.window.showQuickPick(["Yes", "No"], {
					placeHolder: `Delete task ${taskId}? This cannot be undone.`,
				})
				if (confirm !== "Yes") return

				try {
					const content = fs.readFileSync(uri.fsPath, "utf8")
					const board = BrainfileParser.parse(content)
					if (!board) return

					const column = board.columns.find((c: Column) => c.id === columnId)
					if (!column) return

					const taskIndex = column.tasks.findIndex((t: Task) => t.id === taskId)
					if (taskIndex === -1) return

					const [task] = column.tasks.splice(taskIndex, 1)
					const newContent = BrainfileSerializer.serialize(board)
					await writeAndRefreshDocument(uri, newContent)
					boardProvider.refresh()
					vscode.window.showInformationMessage(`Task "${task.title}" deleted`)
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to delete task: ${error}`)
				}
			},
		),
	)

	// Move Task command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"brainfile.codelens.moveTask",
			async (uri: vscode.Uri, fromColumnId: string, taskId: string, columns: { id: string; title: string }[]) => {
				const targetColumn = await vscode.window.showQuickPick(
					columns
						.filter((c) => c.id !== fromColumnId)
						.map((c) => ({
							label: c.title,
							description: c.id,
							columnId: c.id,
						})),
					{ placeHolder: "Move to which column?" },
				)
				if (!targetColumn) return

				try {
					const content = fs.readFileSync(uri.fsPath, "utf8")
					const board = BrainfileParser.parse(content)
					if (!board) return

					const fromColumn = board.columns.find((c: Column) => c.id === fromColumnId)
					const toColumn = board.columns.find((c: Column) => c.id === targetColumn.columnId)
					if (!fromColumn || !toColumn) return

					const taskIndex = fromColumn.tasks.findIndex((t: Task) => t.id === taskId)
					if (taskIndex === -1) return

					const [task] = fromColumn.tasks.splice(taskIndex, 1)
					toColumn.tasks.push(task)

					const newContent = BrainfileSerializer.serialize(board)
					await writeAndRefreshDocument(uri, newContent)
					boardProvider.refresh()
					vscode.window.showInformationMessage(`Task moved to ${toColumn.title}`)
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to move task: ${error}`)
				}
			},
		),
	)

	// Change Priority command
	context.subscriptions.push(
		vscode.commands.registerCommand("brainfile.codelens.changePriority", async (uri: vscode.Uri, taskId: string) => {
			const priorities = ["critical", "high", "medium", "low"]
			const selected = await vscode.window.showQuickPick(priorities, {
				placeHolder: "Select new priority",
			})
			if (!selected) return

			try {
				const content = fs.readFileSync(uri.fsPath, "utf8")
				const board = BrainfileParser.parse(content)
				if (!board) return

				for (const column of board.columns) {
					const task = column.tasks.find((t: Task) => t.id === taskId)
					if (task) {
						task.priority = selected as "critical" | "high" | "medium" | "low"
						const newContent = BrainfileSerializer.serialize(board)
						await writeAndRefreshDocument(uri, newContent)
						boardProvider.refresh()
						vscode.window.showInformationMessage(`Priority changed to ${selected}`)
						return
					}
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to change priority: ${error}`)
			}
		}),
	)

	// Send to Agent command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"brainfile.codelens.sendToAgent",
			async (uri: vscode.Uri, taskId: string, columnTitle: string, boardTitle: string) => {
				try {
					const content = fs.readFileSync(uri.fsPath, "utf8")
					const board = BrainfileParser.parse(content)
					if (!board) return

					// Find the task
					let targetTask = null
					for (const column of board.columns) {
						const task = column.tasks.find((t: Task) => t.id === taskId)
						if (task) {
							targetTask = task
							break
						}
					}

					if (!targetTask) {
						vscode.window.showErrorMessage(`Task ${taskId} not found`)
						return
					}

					// Build the prompt
					const prompt = buildAgentPrompt({
						boardTitle,
						columnTitle,
						task: targetTask,
					})

					const registry = getAgentRegistry()
					const availableAgents = registry.getAvailableAgents()
					const defaultAgentId = registry.getDefaultAgent()

					const agentItems: vscode.QuickPickItem[] = availableAgents.map((agent) => ({
						label: `$(${agent.icon ?? "debug-start"}) ${agent.label}`,
						description: agent.id === defaultAgentId ? "Default" : undefined,
						detail: agent.id,
					}))
					agentItems.push({
						label: "$(clippy) Copy to Clipboard",
						description: "Copy prompt to clipboard",
						detail: "copy",
					})

					const selected = await vscode.window.showQuickPick(agentItems, {
						placeHolder: "Choose where to send the task",
					})

					if (!selected || !selected.detail) return

					const agentId = selected.detail

					// Claude Code: send to terminal (legacy CodeLens behavior)
					if (agentId === "claude-code") {
						const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, "\\n")
						const terminal = vscode.window.createTerminal("Claude Code")
						terminal.show()
						terminal.sendText(`claude "${escapedPrompt}"`)
						return
					}

					const result = await registry.sendToAgent(agentId, prompt)
					if (!result.success) {
						vscode.window.showErrorMessage(result.message || "Failed to send to agent")
					} else if (result.copiedToClipboard && result.message) {
						vscode.window.showInformationMessage(result.message)
					}
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to send to agent: ${error}`)
				}
			},
		),
	)

	// Lint & Sort command
	context.subscriptions.push(
		vscode.commands.registerCommand("brainfile.codelens.lintAndSort", async (uri?: vscode.Uri) => {
			try {
				// If no URI provided, use the active editor's document
				if (!uri) {
					const activeEditor = vscode.window.activeTextEditor
					if (!activeEditor) {
						vscode.window.showErrorMessage("No active editor found")
						return
					}
					uri = activeEditor.document.uri
				}

				const content = fs.readFileSync(uri.fsPath, "utf8")
				const _board = BrainfileParser.parse(content)

				// Run linter first
				const lintResult = BrainfileLinter.lint(content, { autoFix: true })

				// Sort columns by order property
				let sortedContent = lintResult.fixedContent || content
				const sortedBoard = BrainfileParser.parse(sortedContent)

				if (sortedBoard && sortedBoard.columns.length > 0) {
					// Sort columns by order property (ascending)
					sortedBoard.columns.sort((a: Column, b: Column) => {
						const orderA = a.order ?? Number.MAX_SAFE_INTEGER
						const orderB = b.order ?? Number.MAX_SAFE_INTEGER
						return orderA - orderB
					})
					sortedContent = BrainfileSerializer.serialize(sortedBoard)
				}

				// Check if anything changed
				if (sortedContent === content) {
					vscode.window.showInformationMessage("No changes needed - file is already sorted and lint-free.")
					return
				}

				// Show diff preview
				const fixedDoc = await vscode.workspace.openTextDocument({
					content: sortedContent,
					language: "markdown",
				})

				await vscode.commands.executeCommand("vscode.diff", uri, fixedDoc.uri, "brainfile.md: Original ↔ Lint & Sort")

				const choice = await vscode.window.showInformationMessage(
					"Apply lint fixes and sort columns?",
					"Apply Changes",
					"Cancel",
				)

				if (choice !== "Apply Changes") return

				await writeAndRefreshDocument(uri, sortedContent)
				boardProvider.refresh()

				const fixCount = lintResult.issues.filter((i) => i.fixable).length
				const message =
					fixCount > 0 ? `Applied ${fixCount} lint fix(es) and sorted columns.` : "Columns sorted by order."
				vscode.window.showInformationMessage(message)
			} catch (error) {
				vscode.window.showErrorMessage(`Lint & Sort failed: ${error}`)
			}
		}),
	)

	// Lint on Save feature
	const diagnosticCollection = vscode.languages.createDiagnosticCollection("brainfile")
	context.subscriptions.push(diagnosticCollection)

	// Validate and optionally fix brainfile on save
	context.subscriptions.push(
		vscode.workspace.onWillSaveTextDocument(async (event) => {
			const document = event.document

			// Only process brainfile files
			if (!isBrainfile(document.fileName)) {
				return
			}

			const config = vscode.workspace.getConfiguration("brainfile")
			const lintOnSave = config.get<boolean>("lintOnSave", false)
			const autoFixOnSave = config.get<boolean>("autoFixOnSave", false)

			if (!lintOnSave) {
				return
			}

			const content = document.getText()
			const lintResult = BrainfileLinter.lint(content, { autoFix: autoFixOnSave })

			// Convert lint issues to VS Code diagnostics
			// Only create diagnostics for issues with line numbers (YAML syntax errors)
			// Validation errors without line numbers are logged but not shown inline
			const diagnostics: vscode.Diagnostic[] = lintResult.issues
				.filter((issue) => issue.line !== undefined && issue.line > 0)
				.map((issue) => {
					const line = Math.max(0, issue.line! - 1) // Convert to 0-based
					const range = new vscode.Range(line, 0, line, document.lineAt(line).text.length)
					const severity = issue.type === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning

					const diagnostic = new vscode.Diagnostic(range, issue.message, severity)

					diagnostic.source = "brainfile"
					if (issue.fixable) {
						diagnostic.code = "fixable"
					}

					return diagnostic
				})

			// Log validation errors (without line numbers) to output channel
			const validationErrors = lintResult.issues.filter((issue) => !issue.line)
			if (validationErrors.length > 0) {
				log(`Validation errors in ${document.fileName}:`)
				validationErrors.forEach((issue) => {
					log(`  ${issue.type.toUpperCase()}: ${issue.message}`)
				})
			}

			diagnosticCollection.set(document.uri, diagnostics)

			// Auto-fix if enabled and there are fixable issues
			if (autoFixOnSave && lintResult.fixedContent && lintResult.fixedContent !== content) {
				const edit = new vscode.WorkspaceEdit()
				const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(content.length))
				edit.replace(document.uri, fullRange, lintResult.fixedContent)

				// Wait for the edit to complete
				event.waitUntil(vscode.workspace.applyEdit(edit))

				log(`Auto-fixed ${lintResult.issues.filter((i) => i.fixable).length} issue(s) on save`)
			} else if (diagnostics.length > 0) {
				log(`Found ${diagnostics.length} lint issue(s) in ${document.fileName}`)
			}
		}),
	)

	// Clear diagnostics when document is closed
	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument((document) => {
			if (isBrainfile(document.fileName)) {
				diagnosticCollection.delete(document.uri)
			}
		}),
	)
}

export function deactivate() {
	log("Extension deactivating...")
	// All cleanup will be handled by disposal of subscriptions
	log("Extension deactivated")
}
