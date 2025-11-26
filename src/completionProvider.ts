import { BUILT_IN_TEMPLATES } from "@brainfile/core"
import * as vscode from "vscode"

export class BrainfileCompletionProvider implements vscode.CompletionItemProvider {
	provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken,
		_context: vscode.CompletionContext,
	): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
		const linePrefix = document.lineAt(position).text.substr(0, position.character)
		const completions: vscode.CompletionItem[] = []

		// Get context - are we in frontmatter?
		const text = document.getText()
		const inFrontmatter = this.isInFrontmatter(text, document.offsetAt(position))

		if (!inFrontmatter) {
			return completions
		}

		// Detect current context
		const _indent = this.getIndentation(linePrefix)
		const context_type = this.detectContext(document, position)

		// Field name completions (when starting a new line with proper indent)
		if (linePrefix.trim() === "" || linePrefix.endsWith("-") || linePrefix.match(/^\s*$/)) {
			completions.push(...this.getFieldCompletions(context_type))
		}

		// Value completions for specific fields
		if (linePrefix.includes("priority:")) {
			completions.push(...this.getPriorityCompletions())
		}

		if (linePrefix.includes("status:")) {
			completions.push(...this.getStatusCompletions())
		}

		if (linePrefix.includes("template:")) {
			completions.push(...this.getTemplateNameCompletions())
		}

		// Template task completions (insert full task from template)
		if (context_type === "tasks-array" && (linePrefix.trim() === "-" || linePrefix.trim() === "")) {
			completions.push(...this.getFullTemplateCompletions())
		}

		return completions
	}

	private isInFrontmatter(text: string, offset: number): boolean {
		const beforeCursor = text.substring(0, offset)
		const frontmatterStart = beforeCursor.indexOf("---")
		if (frontmatterStart === -1) return false

		const afterStart = beforeCursor.substring(frontmatterStart + 3)
		const frontmatterEnd = afterStart.indexOf("---") || afterStart.indexOf("...")

		// If we haven't found the end, we're still in frontmatter
		return frontmatterEnd === -1
	}

	private getIndentation(line: string): number {
		const match = line.match(/^(\s*)/)
		return match ? match[1].length : 0
	}

	private detectContext(document: vscode.TextDocument, position: vscode.Position): string {
		// Look backwards to find context
		let currentLine = position.line

		while (currentLine >= 0) {
			const line = document.lineAt(currentLine).text

			if (line.match(/^\s*tasks:\s*$/)) {
				return "tasks-array"
			}
			if (line.match(/^\s*columns:\s*$/)) {
				return "columns-array"
			}
			if (line.match(/^\s*subtasks:\s*$/)) {
				return "subtasks-array"
			}
			if (line.match(/^\s*-\s+id:.*task/)) {
				return "task-object"
			}
			if (line.match(/^\s*rules:\s*$/)) {
				return "rules"
			}

			currentLine--
		}

		return "root"
	}

	private getFieldCompletions(context_type: string): vscode.CompletionItem[] {
		const completions: vscode.CompletionItem[] = []

		if (context_type === "task-object" || context_type === "tasks-array") {
			// Task fields
			completions.push(
				this.createSnippetCompletion(
					"id",
					"id: ${1:task-id}",
					"Unique identifier for the task",
					vscode.CompletionItemKind.Field,
				),
				this.createSnippetCompletion(
					"title",
					"title: ${1:Task title}",
					"The task title",
					vscode.CompletionItemKind.Field,
				),
				this.createSnippetCompletion(
					"description",
					"description: |\n  ${1:Task description}",
					"Detailed task description (multiline)",
					vscode.CompletionItemKind.Field,
				),
				this.createSnippetCompletion(
					"priority",
					"priority: ${1|high,medium,low,critical|}",
					"Task priority level",
					vscode.CompletionItemKind.Field,
				),
				this.createSnippetCompletion(
					"status",
					"status: ${1|todo,in-progress,done,blocked|}",
					"Task status",
					vscode.CompletionItemKind.Field,
				),
				this.createSnippetCompletion(
					"tags",
					"tags:\n  - ${1:tag}",
					"Task tags for organization",
					vscode.CompletionItemKind.Field,
				),
				this.createSnippetCompletion(
					"template",
					"template: ${1|bug,feature,refactor|}",
					"Task template type",
					vscode.CompletionItemKind.Field,
				),
				this.createSnippetCompletion(
					"relatedFiles",
					"relatedFiles:\n  - ${1:path/to/file}",
					"Files related to this task",
					vscode.CompletionItemKind.Field,
				),
				this.createSnippetCompletion(
					"subtasks",
					"subtasks:\n  - id: ${1:subtask-id}\n    title: ${2:Subtask title}\n    completed: ${3|false,true|}",
					"Subtasks for this task",
					vscode.CompletionItemKind.Field,
				),
			)
		}

		if (context_type === "columns-array") {
			completions.push(
				this.createSnippetCompletion(
					"id",
					"id: ${1:column-id}",
					"Unique identifier for the column",
					vscode.CompletionItemKind.Field,
				),
				this.createSnippetCompletion(
					"title",
					"title: ${1:Column Title}",
					"Display title for the column",
					vscode.CompletionItemKind.Field,
				),
				this.createSnippetCompletion(
					"tasks",
					"tasks: []",
					"Array of tasks in this column",
					vscode.CompletionItemKind.Field,
				),
			)
		}

		if (context_type === "root") {
			completions.push(
				this.createSnippetCompletion(
					"schema",
					"schema: https://brainfile.md/v1/board.json",
					"Brainfile schema URL",
					vscode.CompletionItemKind.Field,
				),
				this.createSnippetCompletion(
					"title",
					"title: ${1:Project Title}",
					"Project title",
					vscode.CompletionItemKind.Field,
				),
				this.createSnippetCompletion(
					"columns",
					"columns:\n  - id: ${1:todo}\n    title: ${2:To Do}\n    tasks: []",
					"Kanban columns",
					vscode.CompletionItemKind.Field,
				),
				this.createSnippetCompletion(
					"rules",
					"rules:\n  always: []\n  never: []\n  prefer: []\n  context: []",
					"Project rules",
					vscode.CompletionItemKind.Field,
				),
			)
		}

		return completions
	}

	private getPriorityCompletions(): vscode.CompletionItem[] {
		return [
			this.createValueCompletion(
				"critical",
				"🔴 Highest priority - urgent issues",
				"constant.language.priority.critical",
			),
			this.createValueCompletion("high", "🟠 High priority - important tasks", "constant.language.priority.high"),
			this.createValueCompletion("medium", "🟡 Medium priority - standard tasks", "constant.language.priority.medium"),
			this.createValueCompletion("low", "🟢 Low priority - can be deferred", "constant.language.priority.low"),
		]
	}

	private getStatusCompletions(): vscode.CompletionItem[] {
		return [
			this.createValueCompletion("todo", "📋 Not started", "constant.language.status.todo"),
			this.createValueCompletion("in-progress", "🚧 Currently working on", "constant.language.status.in-progress"),
			this.createValueCompletion("done", "✅ Completed", "constant.language.status.completed"),
			this.createValueCompletion("blocked", "🚫 Blocked by dependencies", "constant.language.status.blocked"),
		]
	}

	private getTemplateNameCompletions(): vscode.CompletionItem[] {
		return [
			this.createValueCompletion("bug", "🐛 Bug report template", "string.template.bug"),
			this.createValueCompletion("feature", "✨ Feature request template", "string.template.feature"),
			this.createValueCompletion("refactor", "🔧 Code refactor template", "string.template.refactor"),
		]
	}

	private getFullTemplateCompletions(): vscode.CompletionItem[] {
		const completions: vscode.CompletionItem[] = []

		// Find templates by name
		const bugTemplate = BUILT_IN_TEMPLATES.find((t) => t.name === "Bug Report")
		const featureTemplate = BUILT_IN_TEMPLATES.find((t) => t.name === "Feature Request")
		const refactorTemplate = BUILT_IN_TEMPLATES.find((t) => t.name === "Code Refactor")

		// Bug template
		if (bugTemplate) {
			const bugCompletion = new vscode.CompletionItem("🐛 Bug Report", vscode.CompletionItemKind.Snippet)
			bugCompletion.detail = "Insert bug report task from template"
			bugCompletion.documentation = new vscode.MarkdownString(
				`Creates a new bug report task with:\n- High priority\n- Bug and needs-triage tags\n- Reproduction steps structure`,
			)
			bugCompletion.insertText = new vscode.SnippetString(
				`- id: \${1:bug-\${2:description}}\n` +
					`  title: \${3:${bugTemplate.template.title || "Bug title"}}\n` +
					`  description: |\n    \${4:Bug description}\n` +
					`  template: bug\n` +
					`  priority: ${bugTemplate.template.priority || "high"}\n` +
					`  tags:\n${bugTemplate.template.tags?.map((t: string) => `    - ${t}`).join("\n") || "    - bug"}`,
			)
			completions.push(bugCompletion)
		}

		// Feature template
		if (featureTemplate) {
			const featureCompletion = new vscode.CompletionItem("✨ Feature Request", vscode.CompletionItemKind.Snippet)
			featureCompletion.detail = "Insert feature request task from template"
			featureCompletion.documentation = new vscode.MarkdownString(
				`Creates a new feature request task with:\n- Medium priority\n- Feature and enhancement tags\n- Use cases structure`,
			)
			featureCompletion.insertText = new vscode.SnippetString(
				`- id: \${1:feature-\${2:name}}\n` +
					`  title: \${3:${featureTemplate.template.title || "Feature title"}}\n` +
					`  description: |\n    \${4:Feature description}\n` +
					`  template: feature\n` +
					`  priority: ${featureTemplate.template.priority || "medium"}\n` +
					`  tags:\n${featureTemplate.template.tags?.map((t: string) => `    - ${t}`).join("\n") || "    - feature"}`,
			)
			completions.push(featureCompletion)
		}

		// Refactor template
		if (refactorTemplate) {
			const refactorCompletion = new vscode.CompletionItem("🔧 Code Refactor", vscode.CompletionItemKind.Snippet)
			refactorCompletion.detail = "Insert code refactor task from template"
			refactorCompletion.documentation = new vscode.MarkdownString(
				`Creates a new refactor task with:\n- Low priority\n- Refactor and technical-debt tags\n- Analysis structure`,
			)
			refactorCompletion.insertText = new vscode.SnippetString(
				`- id: \${1:refactor-\${2:component}}\n` +
					`  title: \${3:${refactorTemplate.template.title || "Refactor title"}}\n` +
					`  description: |\n    \${4:Refactor description}\n` +
					`  template: refactor\n` +
					`  priority: ${refactorTemplate.template.priority || "low"}\n` +
					`  tags:\n${refactorTemplate.template.tags?.map((t: string) => `    - ${t}`).join("\n") || "    - refactor"}`,
			)
			completions.push(refactorCompletion)
		}

		return completions
	}

	private createSnippetCompletion(
		label: string,
		snippet: string,
		documentation: string,
		kind: vscode.CompletionItemKind,
	): vscode.CompletionItem {
		const completion = new vscode.CompletionItem(label, kind)
		completion.insertText = new vscode.SnippetString(snippet)
		completion.documentation = new vscode.MarkdownString(documentation)
		completion.sortText = `0_${label}` // Sort field names first
		return completion
	}

	private createValueCompletion(value: string, documentation: string, _scope: string): vscode.CompletionItem {
		const completion = new vscode.CompletionItem(value, vscode.CompletionItemKind.Value)
		completion.insertText = value
		completion.documentation = new vscode.MarkdownString(documentation)
		completion.sortText = `1_${value}` // Sort values after fields
		return completion
	}
}
