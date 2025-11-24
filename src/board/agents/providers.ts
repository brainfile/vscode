/**
 * Agent Provider Manifest
 *
 * This file defines all supported AI agent integrations using a declarative manifest.
 * To add a new agent, add an entry to AGENT_PROVIDERS below.
 *
 * PRs welcome! See the AgentProvider interface for required fields.
 *
 * ## How It Works
 * 1. Detection: Check if extension is installed (extensionId) or app name matches (appNameMatch)
 * 2. Commands: Try commands in order of preference (openWithPrompt → addToContext → focusInput)
 * 3. Fallback: If no commands work, copy to clipboard
 *
 * ## Command Types
 * - openWithPrompt: Opens chat with prompt as argument (native VS Code chat)
 * - addToContext: Adds current selection to chat context
 * - newTask: Starts a new task/conversation
 * - focusInput: Focuses the chat input field
 */

/**
 * Defines how to integrate with an AI agent extension
 */
export interface AgentProvider {
  /** Unique identifier for this provider */
  id: string;

  /** Display name shown in UI */
  label: string;

  /** VS Code extension ID for detection */
  extensionId?: string;

  /** Alternative detection: match against vscode.env.appName (e.g., "cursor") */
  appNameMatch?: string;

  /** Priority for default selection (lower = higher priority) */
  priority: number;

  /** Commands to execute, tried in order of preference */
  commands: {
    /**
     * Opens chat panel with prompt as argument
     * Used by native VS Code chat (Copilot, Cursor)
     * Example: workbench.action.chat.open
     */
    openWithPrompt?: string;

    /**
     * Adds current editor selection to chat context
     * Used by Cline-family extensions
     * Example: cline.addToChat
     */
    addToContext?: string;

    /**
     * Starts a new task/conversation
     * Example: cline.plusButtonClicked
     */
    newTask?: string;

    /**
     * Focuses the chat input field
     * Example: cline.focusChatInput
     */
    focusInput?: string;
  };

  /**
   * Whether this provider needs a temp document for addToContext commands
   * If true, we create a temp doc, select all, execute command, then close
   */
  needsTempDocument?: boolean;

  /**
   * Delay in ms after opening/focusing before paste (for UI to render)
   * Default: 100
   */
  focusDelay?: number;
}

/**
 * All supported AI agent providers
 *
 * Ordered by priority (lower number = tried first when multiple are available)
 *
 * Currently supported (Tier 1 - reliable native APIs):
 * - GitHub Copilot (native VS Code chat API)
 * - Claude Code (native VS Code chat API)
 *
 * Future consideration (Tier 2 - requires more research):
 * - Cline, Roo Code, Kilo Code (Cline forks)
 * - Continue, Cursor
 */
export const AGENT_PROVIDERS: AgentProvider[] = [
  // ============================================================================
  // Tier 1: Native VS Code Chat API (reliable)
  // ============================================================================
  {
    id: "copilot",
    label: "GitHub Copilot",
    extensionId: "github.copilot-chat",
    priority: 1,
    commands: {
      openWithPrompt: "workbench.action.chat.open",
      newTask: "workbench.action.chat.newChat",
    },
  },
  {
    id: "claude-code",
    label: "Claude Code",
    extensionId: "anthropic.claude-code",
    priority: 2,
    commands: {
      newTask: "claude-vscode.editor.open",
      focusInput: "claude-vscode.focus",
    },
    focusDelay: 400,
  },

  // ============================================================================
  // Fallback - Always available
  // ============================================================================
  {
    id: "copy",
    label: "Copy to Clipboard",
    priority: 99,
    commands: {},
  },
];

/**
 * Get a provider by ID
 */
export function getProvider(id: string): AgentProvider | undefined {
  return AGENT_PROVIDERS.find((p) => p.id === id);
}

/**
 * Get all provider IDs
 */
export function getProviderIds(): string[] {
  return AGENT_PROVIDERS.map((p) => p.id);
}
