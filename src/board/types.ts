/**
 * Board module type definitions
 * Extracted from boardViewProvider.ts for modularity and testability
 */

import type { Board, LintResult } from "@brainfile/core"
import { AGENT_PROVIDERS } from "./agents/providers"

// =============================================================================
// Agent Types (manifest-driven)
// =============================================================================

/** Agent ID type - derived from the provider manifest */
export type AgentId = string

/** @deprecated Use AgentId instead */
export type AgentType = AgentId

/** Information about a detected agent */
export interface DetectedAgent {
	id: string
	type: string // Same as id, for webview compatibility
	label: string
	/** VS Code Codicon name for UI. Optional. */
	icon?: string
	available: boolean
	priority: number
}

/** All supported agent IDs (derived from manifest) */
export const AGENT_IDS: string[] = AGENT_PROVIDERS.map((p) => p.id)

/** @deprecated Use AGENT_IDS instead */
export const AGENT_TYPES = AGENT_IDS

/** Agent display labels (derived from manifest) */
export const AGENT_LABELS: Record<string, string> = Object.fromEntries(AGENT_PROVIDERS.map((p) => [p.id, p.label]))

// =============================================================================
// Message Types (Webview <-> Extension communication)
// =============================================================================

/** Messages sent FROM webview TO extension */
export type WebviewToExtensionMessage =
	| { type: "webviewReady" }
	| { type: "updateTask"; columnId: string; taskId: string; title: string; description: string }
	| { type: "editTask"; taskId: string }
	| { type: "editPriority"; taskId: string }
	| { type: "deleteTask"; columnId: string; taskId: string }
	| { type: "moveTask"; taskId: string; fromColumn: string; toColumn: string; toIndex: number }
	| { type: "updateTitle"; title: string }
	| { type: "openFile"; filePath: string }
	| { type: "clearCache" }
	| { type: "openSettings" }
	| { type: "archiveTask"; columnId: string; taskId: string }
	| { type: "completeTask"; columnId: string; taskId: string }
	| { type: "addTaskToColumn"; columnId: string }
	| { type: "addRule"; ruleType: RuleType }
	| { type: "editRule"; ruleId: number; ruleType: RuleType }
	| { type: "deleteRule"; ruleId: number; ruleType: RuleType }
	| { type: "toggleSubtask"; taskId: string; subtaskId: string }
	| { type: "saveStatsConfig"; columns: string[] }
	| { type: "fix-issues" }
	| { type: "refresh" }
	| { type: "sendToAgent"; taskId: string; agentType?: AgentType }
	| { type: "getAvailableAgents" }
	// Bulk operations
	| { type: "bulkMoveTasks"; taskIds: string[]; toColumnId: string }
	| { type: "bulkArchiveTasks"; taskIds: string[] }
	| { type: "bulkDeleteTasks"; taskIds: string[] }
	| { type: "bulkPatchTasks"; taskIds: string[]; patch: { priority?: string; tags?: string[]; assignee?: string } }

/** Messages sent FROM extension TO webview */
export type ExtensionToWebviewMessage =
	| { type: "agentsDetected"; agents: DetectedAgent[]; defaultAgent: AgentType; lastUsed: AgentType }
	| { type: "parseWarning"; message: string; lintResult?: LintResult }
	| { type: "boardUpdate"; board: Board | null; priorityStyles?: string }

/** Rule types for agent instructions */
export type RuleType = "always" | "never" | "prefer" | "context"

/** All rule types as array */
export const RULE_TYPES: RuleType[] = ["always", "never", "prefer", "context"]

// =============================================================================
// Board State Types
// =============================================================================

/** Internal state for the board view provider */
export interface BoardState {
	boardFilePath?: string
	lastContentHash?: string
	lastValidBoard?: Board
	parseErrorCount: number
	isFirstRender: boolean
	lastUsedAgent: AgentType
}

/** Initial board state factory */
export function createInitialBoardState(): BoardState {
	return {
		boardFilePath: undefined,
		lastContentHash: undefined,
		lastValidBoard: undefined,
		parseErrorCount: 0,
		isFirstRender: true,
		lastUsedAgent: "copilot",
	}
}

// =============================================================================
// HTML Generation Types
// =============================================================================

/** Options for HTML generation */
export interface HtmlGenerationOptions {
	nonce: string
	extensionUri: string
	cspSource: string
}

/** Error page data */
export interface ErrorPageData {
	message: string
	details?: string
	lintResult?: LintResult
}

// =============================================================================
// Priority Types
// =============================================================================

/** Built-in priority levels */
export type BuiltInPriority = "critical" | "high" | "medium" | "low"

/** Priority configuration from VS Code settings */
export interface PriorityConfig {
	criticalColor: string
	highColor: string
	mediumColor: string
	lowColor: string
	custom: Record<string, string>
}

/** Default priority colors */
export const DEFAULT_PRIORITY_COLORS: Record<BuiltInPriority, string> = {
	critical: "#d64933",
	high: "#867530",
	medium: "#37505C",
	low: "#bac1b8",
}

// =============================================================================
// Type Guards
// =============================================================================

/** Check if a string is a valid AgentType */
export function isAgentType(value: unknown): value is AgentType {
	return typeof value === "string" && AGENT_TYPES.includes(value as AgentType)
}

/** Check if a string is a valid RuleType */
export function isRuleType(value: unknown): value is RuleType {
	return typeof value === "string" && RULE_TYPES.includes(value as RuleType)
}

/** Check if a string is a valid BuiltInPriority */
export function isBuiltInPriority(value: unknown): value is BuiltInPriority {
	return typeof value === "string" && ["critical", "high", "medium", "low"].includes(value)
}

// =============================================================================
// Utility Types
// =============================================================================

/** Pending write operation for debounced file writes */
export interface PendingWrite {
	content: string
	callback?: () => void
}

/** Task location in file (for editor navigation) */
export interface TaskLocation {
	line: number
	column: number
}

/** Stats configuration */
export interface StatsConfig {
	columns: string[]
}
