/**
 * Agent Registry - Command-based detection and dispatch
 *
 * This module handles:
 * 1. Detecting which AI agents are installed
 * 2. Sending prompts to agents using their registered commands
 * 3. Graceful fallback to clipboard when commands fail
 */

import * as vscode from "vscode"
import { log } from "../../extension"
import type { DetectedAgent } from "../types"
import { AGENT_PROVIDERS, type AgentProvider, getProvider } from "./providers"

/** Result of sending a prompt to an agent */
export interface SendResult {
	success: boolean
	message?: string
	/** If true, prompt was copied to clipboard */
	copiedToClipboard?: boolean
	/** The agent that handled the prompt */
	agentId?: string
}

/**
 * Check if an agent provider is available
 */
function isProviderAvailable(provider: AgentProvider): boolean {
	// Copy fallback is always available
	if (provider.id === "copy") {
		return true
	}

	// Check by extension ID
	if (provider.extensionId) {
		const ext = vscode.extensions.getExtension(provider.extensionId)
		if (ext) return true
	}

	// Check by app name match
	if (provider.appNameMatch) {
		const appName = vscode.env.appName.toLowerCase()
		if (appName.includes(provider.appNameMatch.toLowerCase())) {
			return true
		}
	}

	return false
}

/**
 * Execute a VS Code command safely
 */
async function tryCommand(command: string, ...args: unknown[]): Promise<boolean> {
	try {
		await vscode.commands.executeCommand(command, ...args)
		return true
	} catch {
		return false
	}
}

/**
 * Wait for a specified duration
 */
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Send prompt using native VS Code chat (openWithPrompt command)
 */
async function sendViaNativeChat(provider: AgentProvider, prompt: string): Promise<SendResult> {
	const { commands } = provider

	// Start new chat first if available
	if (commands.newTask) {
		await tryCommand(commands.newTask)
		await delay(100)
	}

	// Open chat with prompt
	if (commands.openWithPrompt) {
		const success = await tryCommand(commands.openWithPrompt, prompt)
		if (success) {
			return { success: true, agentId: provider.id }
		}
	}

	return { success: false }
}

/**
 * Send prompt using addToContext command (Cline-family)
 * This requires creating a temp document with the prompt as content
 */
async function sendViaAddToContext(provider: AgentProvider, prompt: string): Promise<SendResult> {
	const { commands, focusDelay = 100 } = provider

	// Copy to clipboard as backup
	await vscode.env.clipboard.writeText(prompt)

	// Create a temporary document with the prompt
	const doc = await vscode.workspace.openTextDocument({
		content: prompt,
		language: "markdown",
	})

	const editor = await vscode.window.showTextDocument(doc, {
		preview: true,
		preserveFocus: false,
	})

	// Select all text in the document
	const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length))
	editor.selection = new vscode.Selection(fullRange.start, fullRange.end)

	// Small delay for selection to register
	await delay(50)

	// Try addToContext command
	if (commands.addToContext) {
		const success = await tryCommand(commands.addToContext)
		if (success) {
			// Close the temp document
			await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
			return {
				success: true,
				agentId: provider.id,
				message: `Sent to ${provider.label}`,
			}
		}
	}

	// Fallback: try newTask + focusInput + paste
	if (commands.newTask) {
		await tryCommand(commands.newTask)
	}

	if (commands.focusInput) {
		await tryCommand(commands.focusInput)
		await delay(focusDelay)

		// Try to paste from clipboard
		const pasteSuccess = await tryCommand("editor.action.clipboardPasteAction")

		// Close the temp document
		await vscode.commands.executeCommand("workbench.action.closeActiveEditor")

		if (pasteSuccess) {
			return {
				success: true,
				agentId: provider.id,
				message: `Sent to ${provider.label}`,
				copiedToClipboard: true,
			}
		}
	}

	// Close temp doc and return with clipboard fallback
	await vscode.commands.executeCommand("workbench.action.closeActiveEditor")

	return {
		success: true,
		message: `Prompt copied. Open ${provider.label} and paste.`,
		copiedToClipboard: true,
		agentId: provider.id,
	}
}

/**
 * Send prompt using focus + paste method
 */
async function sendViaFocusPaste(provider: AgentProvider, prompt: string): Promise<SendResult> {
	const { commands, focusDelay = 100 } = provider

	// Copy to clipboard
	await vscode.env.clipboard.writeText(prompt)

	// Open new task if available
	if (commands.newTask) {
		const success = await tryCommand(commands.newTask)
		if (!success) {
			return {
				success: true,
				message: `Prompt copied. Open ${provider.label} and paste.`,
				copiedToClipboard: true,
				agentId: provider.id,
			}
		}
	}

	// Focus input if available
	if (commands.focusInput) {
		await tryCommand(commands.focusInput)
	}

	await delay(focusDelay)

	// Try to paste
	const pasteSuccess = await tryCommand("editor.action.clipboardPasteAction")

	if (pasteSuccess) {
		return {
			success: true,
			agentId: provider.id,
			message: `Sent to ${provider.label}`,
			copiedToClipboard: true,
		}
	}

	return {
		success: true,
		message: `Prompt copied. ${provider.label} opened - paste to submit.`,
		copiedToClipboard: true,
		agentId: provider.id,
	}
}

/**
 * Copy prompt to clipboard (fallback)
 */
async function sendViaClipboard(prompt: string): Promise<SendResult> {
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
		agentId: "copy",
	}
}

/**
 * Agent Registry class for managing agent detection and dispatch
 */
export class AgentRegistry {
	private lastUsedAgentId: string | null = null

	/**
	 * Detect all available agents
	 * Note: Returns 'type' field for webview compatibility (webview expects 'type', not 'id')
	 */
	detectAgents(): DetectedAgent[] {
		return AGENT_PROVIDERS.map((provider) => ({
			id: provider.id,
			type: provider.id, // Webview uses 'type' field
			label: provider.label,
			icon: provider.icon,
			available: isProviderAvailable(provider),
			priority: provider.priority,
		}))
	}

	/**
	 * Get available agents (excluding copy unless it's the only option)
	 */
	getAvailableAgents(): DetectedAgent[] {
		const available = this.detectAgents().filter((a) => a.available)

		// If only copy is available, return it
		if (available.length === 1 && available[0].id === "copy") {
			return available
		}

		// Otherwise exclude copy from the list
		return available.filter((a) => a.id !== "copy").sort((a, b) => a.priority - b.priority)
	}

	/**
	 * Get the default/preferred agent
	 */
	getDefaultAgent(): string {
		// Use last used if still available
		if (this.lastUsedAgentId) {
			const provider = getProvider(this.lastUsedAgentId)
			if (provider && isProviderAvailable(provider)) {
				return this.lastUsedAgentId
			}
		}

		// Find first available agent (excluding copy)
		const available = this.getAvailableAgents()
		return available[0]?.id || "copy"
	}

	/**
	 * Set last used agent
	 */
	setLastUsed(agentId: string): void {
		this.lastUsedAgentId = agentId
	}

	/**
	 * Get last used agent
	 */
	getLastUsed(): string | null {
		return this.lastUsedAgentId
	}

	/**
	 * Send prompt to a specific agent
	 */
	async sendToAgent(agentId: string, prompt: string): Promise<SendResult> {
		log(`[AgentRegistry] sendToAgent called with agentId: ${agentId}`)

		const provider = getProvider(agentId)
		log(`[AgentRegistry] provider found: ${provider?.id} ${provider?.label}`)

		if (!provider) {
			return { success: false, message: `Unknown agent: ${agentId}` }
		}

		if (!isProviderAvailable(provider)) {
			log(`[AgentRegistry] provider ${provider.id} not available`)
			return { success: false, message: `${provider.label} is not available` }
		}

		this.setLastUsed(agentId)

		// Handle copy fallback
		if (agentId === "copy") {
			log(`[AgentRegistry] Using clipboard fallback`)
			return sendViaClipboard(prompt)
		}

		// Try native chat first (openWithPrompt)
		if (provider.commands.openWithPrompt) {
			log(`[AgentRegistry] Trying openWithPrompt: ${provider.commands.openWithPrompt}`)
			const result = await sendViaNativeChat(provider, prompt)
			log(`[AgentRegistry] openWithPrompt result: ${result.success}`)
			if (result.success) return result
		}

		// Try addToContext for Cline-family extensions
		if (provider.commands.addToContext && provider.needsTempDocument) {
			log(`[AgentRegistry] Trying addToContext: ${provider.commands.addToContext}`)
			const result = await sendViaAddToContext(provider, prompt)
			log(`[AgentRegistry] addToContext result: ${result.success}`)
			if (result.success) return result
		}

		// Try focus + paste method
		if (provider.commands.newTask || provider.commands.focusInput) {
			log(`[AgentRegistry] Trying focus+paste with newTask: ${provider.commands.newTask}`)
			const result = await sendViaFocusPaste(provider, prompt)
			log(`[AgentRegistry] focus+paste result: ${result.success}`)
			if (result.success) return result
		}

		// Final fallback: clipboard
		log(`[AgentRegistry] Falling back to clipboard`)
		return sendViaClipboard(prompt)
	}

	/**
	 * Send prompt to the default/best available agent
	 */
	async sendToDefaultAgent(prompt: string): Promise<SendResult> {
		const defaultAgentId = this.getDefaultAgent()
		return this.sendToAgent(defaultAgentId, prompt)
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
