import * as vscode from "vscode"

/**
 * Provides file decorations for brainfile.md files in the file explorer.
 * Adds a visual badge to make brainfiles easily recognizable.
 */
export class BrainfileDecorationProvider implements vscode.FileDecorationProvider {
	private readonly _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>()
	readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event

	provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
		if (this.isBrainfile(uri)) {
			return {
				badge: "🧠",
				tooltip: "Brainfile Board",
				color: new vscode.ThemeColor("charts.yellow"),
			}
		}
		return undefined
	}

	private isBrainfile(uri: vscode.Uri): boolean {
		const path = uri.fsPath.toLowerCase()
		return path.endsWith("brainfile.md") || path.endsWith(".brainfile.md")
	}

	refresh(uri?: vscode.Uri): void {
		this._onDidChangeFileDecorations.fire(uri)
	}

	dispose(): void {
		this._onDidChangeFileDecorations.dispose()
	}
}
