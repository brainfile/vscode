/**
 * Agent adapters for "Send to Agent" feature
 *
 * Each adapter handles detection and prompt sending for a specific AI assistant.
 * Priority order (highest capability first):
 * 1. Copilot/Cursor - workbench.action.chat.open accepts prompts
 * 2. Cline - Focus + paste integration
 * 3. Kilo Code - Similar to Cline (fork)
 * 4. Claude Code - Terminal integration (TODO: research VSCode interface)
 * 5. Continue - Limited
 * 6. Copy - Fallback clipboard
 *
 * TODO: Research needed for:
 * - Roo Code: API signature issues (historyItem vs task/images params)
 * - Codex/OpenAI: No public API documented
 * - Claude Code: Has VSCode interface mode with "New" command
 */

import * as vscode from "vscode"

/** Agent type identifier */
export type AgentType = "copilot" | "cursor" | "claude-code" | "cline" | "kilo-code" | "continue" | "copy"

/** Result of sending a prompt to an agent */
export interface SendResult {
	success: boolean
	message?: string
	/** If true, prompt was copied to clipboard as fallback */
	copiedToClipboard?: boolean
}

/** Detected agent information */
export interface DetectedAgent {
	type: AgentType
	label: string
	available: boolean
	/** Capability level: full, partial, or minimal */
	capability: "full" | "partial" | "minimal"
}

/** Agent adapter interface */
export interface AgentAdapter {
	/** Unique identifier */
	readonly type: AgentType
	/** Display label */
	readonly label: string
	/** VS Code extension ID (if applicable) */
	readonly extensionId?: string
	/** Capability level */
	readonly capability: "full" | "partial" | "minimal"
	/** Priority (lower = higher priority) */
	readonly priority: number

	/** Check if this agent is available */
	detect(): boolean
	/** Send a prompt to this agent */
	sendPrompt(prompt: string): Promise<SendResult>
}

// =============================================================================
// Copilot Adapter - Chat commands
// =============================================================================

export class CopilotAdapter implements AgentAdapter {
	readonly type: AgentType = "copilot"
	readonly label = "Copilot"
	readonly extensionId = "github.copilot-chat"
	readonly capability = "partial" as const
	readonly priority = 2

	detect(): boolean {
		return vscode.extensions.getExtension(this.extensionId) !== undefined
	}

	async sendPrompt(prompt: string): Promise<SendResult> {
		try {
			// Start a new chat session first
			await vscode.commands.executeCommand("workbench.action.chat.newChat")
			// Small delay to ensure chat is ready
			await new Promise((resolve) => setTimeout(resolve, 100))
			// Open chat with the prompt
			await vscode.commands.executeCommand("workbench.action.chat.open", prompt)
			return { success: true }
		} catch (_error) {
			// Fallback to clipboard
			await vscode.env.clipboard.writeText(prompt)
			return {
				success: true,
				message: "Prompt copied to clipboard",
				copiedToClipboard: true,
			}
		}
	}
}

// =============================================================================
// Cursor Adapter - Uses same commands as Copilot
// =============================================================================

export class CursorAdapter implements AgentAdapter {
	readonly type: AgentType = "cursor"
	readonly label = "Cursor"
	readonly extensionId = undefined // Detected by app name
	readonly capability = "partial" as const
	readonly priority = 2

	detect(): boolean {
		return vscode.env.appName.toLowerCase().includes("cursor")
	}

	async sendPrompt(prompt: string): Promise<SendResult> {
		try {
			await vscode.commands.executeCommand("workbench.action.chat.newChat")
			await new Promise((resolve) => setTimeout(resolve, 100))
			await vscode.commands.executeCommand("workbench.action.chat.open", prompt)
			return { success: true }
		} catch (_error) {
			await vscode.env.clipboard.writeText(prompt)
			return {
				success: true,
				message: "Prompt copied to clipboard",
				copiedToClipboard: true,
			}
		}
	}
}

// =============================================================================
// Claude Code Adapter - VSCode interface with terminal fallback
// Command: claude-vscode.editor.open
// =============================================================================

export class ClaudeCodeAdapter implements AgentAdapter {
	readonly type: AgentType = "claude-code"
	readonly label = "Claude Code"
	readonly extensionId = "anthropic.claude-code"
	readonly capability = "partial" as const
	readonly priority = 4

	detect(): boolean {
		return vscode.extensions.getExtension(this.extensionId) !== undefined
	}

	async sendPrompt(prompt: string): Promise<SendResult> {
		// Copy to clipboard first
		await vscode.env.clipboard.writeText(prompt)

		try {
			// Open Claude Code in editor tab
			await vscode.commands.executeCommand("claude-vscode.editor.open")

			// Wait for UI to paint
			await new Promise((resolve) => setTimeout(resolve, 400))

			// Focus the input
			try {
				await vscode.commands.executeCommand("claude-vscode.focus")
			} catch {
				// Focus command not available
			}

			// Attempt paste
			await new Promise((resolve) => setTimeout(resolve, 100))
			try {
				await vscode.commands.executeCommand("editor.action.clipboardPasteAction")
				return {
					success: true,
					message: "Prompt sent to Claude Code",
					copiedToClipboard: true,
				}
			} catch {
				return {
					success: true,
					message: "Prompt copied. Claude Code opened - paste to submit.",
					copiedToClipboard: true,
				}
			}
		} catch {
			// Fallback to terminal mode
			try {
				const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, "\\n")
				const terminal = vscode.window.createTerminal("Claude Code")
				terminal.show()
				terminal.sendText(`claude "${escapedPrompt}"`)
				return { success: true, message: "Sent to Claude Code terminal" }
			} catch {
				return {
					success: true,
					message: "Prompt copied to clipboard. Open Claude Code to paste.",
					copiedToClipboard: true,
				}
			}
		}
	}
}

// =============================================================================
// Cline Adapter - Limited (focus + clipboard)
// =============================================================================

export class ClineAdapter implements AgentAdapter {
	readonly type: AgentType = "cline"
	readonly label = "Cline"
	readonly extensionId = "saoudrizwan.claude-dev"
	readonly capability = "minimal" as const
	readonly priority = 5

	detect(): boolean {
		return vscode.extensions.getExtension(this.extensionId) !== undefined
	}

	async sendPrompt(prompt: string): Promise<SendResult> {
		// Copy to clipboard first
		await vscode.env.clipboard.writeText(prompt)

		try {
			// Open new task and focus chat input
			await vscode.commands.executeCommand("cline.plusButtonClicked")
			await vscode.commands.executeCommand("cline.focusChatInput")

			// Wait for UI to paint before attempting paste
			await new Promise((resolve) => setTimeout(resolve, 400))
			try {
				await vscode.commands.executeCommand("editor.action.clipboardPasteAction")
				return {
					success: true,
					message: "Prompt sent to Cline",
					copiedToClipboard: true,
				}
			} catch {
				// Paste failed, but prompt is in clipboard
				return {
					success: true,
					message: "Prompt copied. Cline opened - paste to submit.",
					copiedToClipboard: true,
				}
			}
		} catch {
			return {
				success: true,
				message: "Prompt copied to clipboard. Open Cline to paste.",
				copiedToClipboard: true,
			}
		}
	}
}

// =============================================================================
// Kilo Code Adapter - Similar to Cline (fork)
// =============================================================================

export class KiloCodeAdapter implements AgentAdapter {
	readonly type: AgentType = "kilo-code"
	readonly label = "Kilo Code"
	readonly extensionId = "kilocode.kilo-code"
	readonly capability = "minimal" as const
	readonly priority = 6

	detect(): boolean {
		return vscode.extensions.getExtension(this.extensionId) !== undefined
	}

	async sendPrompt(prompt: string): Promise<SendResult> {
		await vscode.env.clipboard.writeText(prompt)

		try {
			// Kilo Code is a fork of Cline/Roo - try similar commands
			// Try plusButtonClicked first (Cline-style), fallback to focus
			try {
				await vscode.commands.executeCommand("kilo-code.plusButtonClicked")
			} catch {
				await vscode.commands.executeCommand("kilo-code.SidebarProvider.focus")
			}

			// Try to focus chat input
			try {
				await vscode.commands.executeCommand("kilo-code.focusChatInput")
			} catch {
				// Command may not exist in all versions
			}

			// Wait for UI to paint before attempting paste
			await new Promise((resolve) => setTimeout(resolve, 400))
			try {
				await vscode.commands.executeCommand("editor.action.clipboardPasteAction")
				return {
					success: true,
					message: "Prompt sent to Kilo Code",
					copiedToClipboard: true,
				}
			} catch {
				return {
					success: true,
					message: "Prompt copied. Kilo Code opened - paste to submit.",
					copiedToClipboard: true,
				}
			}
		} catch {
			return {
				success: true,
				message: "Prompt copied to clipboard. Open Kilo Code to paste.",
				copiedToClipboard: true,
			}
		}
	}
}

// =============================================================================
// Continue Adapter - Limited
// =============================================================================

export class ContinueAdapter implements AgentAdapter {
	readonly type: AgentType = "continue"
	readonly label = "Continue"
	readonly extensionId = "continue.continue"
	readonly capability = "minimal" as const
	readonly priority = 7

	detect(): boolean {
		return vscode.extensions.getExtension(this.extensionId) !== undefined
	}

	async sendPrompt(prompt: string): Promise<SendResult> {
		await vscode.env.clipboard.writeText(prompt)

		try {
			// Try Continue's focus command
			await vscode.commands.executeCommand("continue.focusContinueInput")

			// Wait for UI to paint before attempting paste
			await new Promise((resolve) => setTimeout(resolve, 400))
			try {
				await vscode.commands.executeCommand("editor.action.clipboardPasteAction")
				return {
					success: true,
					message: "Prompt sent to Continue",
					copiedToClipboard: true,
				}
			} catch {
				return {
					success: true,
					message: "Prompt copied. Continue opened - paste to submit.",
					copiedToClipboard: true,
				}
			}
		} catch {
			return {
				success: true,
				message: "Prompt copied to clipboard. Open Continue to paste.",
				copiedToClipboard: true,
			}
		}
	}
}

// =============================================================================
// Copy Adapter - Fallback clipboard
// =============================================================================

export class CopyAdapter implements AgentAdapter {
	readonly type: AgentType = "copy"
	readonly label = "Copy"
	readonly extensionId = undefined
	readonly capability = "minimal" as const
	readonly priority = 99 // Always last

	detect(): boolean {
		return true // Always available
	}

	async sendPrompt(prompt: string): Promise<SendResult> {
		await vscode.env.clipboard.writeText(prompt)

		// Also show in a document for easy viewing
		const doc = await vscode.workspace.openTextDocument({
			content: prompt,
			language: "markdown",
		})
		await vscode.window.showTextDocument(doc, { preview: true })

		return {
			success: true,
			message: "Prompt copied to clipboard",
			copiedToClipboard: true,
		}
	}
}

// =============================================================================
// Agent Registry
// =============================================================================

/** All available adapters in priority order */
const ALL_ADAPTERS: AgentAdapter[] = [
	new CopilotAdapter(),
	new CursorAdapter(),
	new ClineAdapter(),
	new KiloCodeAdapter(),
	new ClaudeCodeAdapter(),
	new ContinueAdapter(),
	new CopyAdapter(),
]

export class AgentRegistry {
	private adapters: AgentAdapter[] = ALL_ADAPTERS
	private lastUsedAgent: AgentType | null = null

	/** Get all adapters */
	getAllAdapters(): AgentAdapter[] {
		return this.adapters
	}

	/** Get adapter by type */
	getAdapter(type: AgentType): AgentAdapter | undefined {
		return this.adapters.find((a) => a.type === type)
	}

	/** Detect all available agents */
	detectAgents(): DetectedAgent[] {
		return this.adapters.map((adapter) => ({
			type: adapter.type,
			label: adapter.label,
			available: adapter.detect(),
			capability: adapter.capability,
		}))
	}

	/** Get available agents only (excluding copy unless it's the only option) */
	getAvailableAgents(): DetectedAgent[] {
		const detected = this.detectAgents().filter((a) => a.available)
		// If only copy is available, return it
		if (detected.length === 1 && detected[0].type === "copy") {
			return detected
		}
		// Otherwise, exclude copy from the list (it's always available in menu separately)
		return detected.filter((a) => a.type !== "copy")
	}

	/** Get the default/preferred agent */
	getDefaultAgent(): AgentType {
		// Use last used if still available
		if (this.lastUsedAgent) {
			const last = this.adapters.find((a) => a.type === this.lastUsedAgent && a.detect())
			if (last) return last.type
		}

		// Find first available agent (excluding copy)
		const available = this.adapters.find((a) => a.type !== "copy" && a.detect())
		return available?.type || "copy"
	}

	/** Set last used agent */
	setLastUsed(type: AgentType): void {
		this.lastUsedAgent = type
	}

	/** Get last used agent */
	getLastUsed(): AgentType | null {
		return this.lastUsedAgent
	}

	/** Send prompt to a specific agent */
	async sendToAgent(type: AgentType, prompt: string): Promise<SendResult> {
		const adapter = this.getAdapter(type)
		if (!adapter) {
			return { success: false, message: `Unknown agent type: ${type}` }
		}

		if (!adapter.detect()) {
			return { success: false, message: `${adapter.label} is not available` }
		}

		this.setLastUsed(type)
		return adapter.sendPrompt(prompt)
	}

	/** Send prompt to the default/best available agent */
	async sendToDefaultAgent(prompt: string): Promise<SendResult> {
		const defaultType = this.getDefaultAgent()
		return this.sendToAgent(defaultType, prompt)
	}
}

/** Singleton instance */
let registryInstance: AgentRegistry | null = null

/** Get the global agent registry */
export function getAgentRegistry(): AgentRegistry {
	if (!registryInstance) {
		registryInstance = new AgentRegistry()
	}
	return registryInstance
}
