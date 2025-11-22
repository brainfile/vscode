/**
 * Message handling for webview <-> extension communication
 */

import type { WebviewToExtensionMessage, ExtensionToWebviewMessage } from "./types";

// =============================================================================
// Message Type Constants
// =============================================================================

/** All incoming message types from webview */
export const WEBVIEW_MESSAGE_TYPES = {
  UPDATE_TASK: "updateTask",
  EDIT_TASK: "editTask",
  EDIT_PRIORITY: "editPriority",
  DELETE_TASK: "deleteTask",
  MOVE_TASK: "moveTask",
  UPDATE_TITLE: "updateTitle",
  OPEN_FILE: "openFile",
  CLEAR_CACHE: "clearCache",
  OPEN_SETTINGS: "openSettings",
  ARCHIVE_TASK: "archiveTask",
  COMPLETE_TASK: "completeTask",
  ADD_TASK_TO_COLUMN: "addTaskToColumn",
  ADD_RULE: "addRule",
  EDIT_RULE: "editRule",
  DELETE_RULE: "deleteRule",
  TOGGLE_SUBTASK: "toggleSubtask",
  SAVE_STATS_CONFIG: "saveStatsConfig",
  FIX_ISSUES: "fix-issues",
  REFRESH: "refresh",
  SEND_TO_AGENT: "sendToAgent",
  GET_AVAILABLE_AGENTS: "getAvailableAgents",
} as const;

/** All outgoing message types to webview */
export const EXTENSION_MESSAGE_TYPES = {
  AGENTS_DETECTED: "agentsDetected",
  PARSE_WARNING: "parseWarning",
  BOARD_UPDATE: "boardUpdate",
} as const;

// =============================================================================
// Message Type Extraction
// =============================================================================

/** Extract message type from a message */
export function getMessageType(message: WebviewToExtensionMessage): string {
  return message.type;
}

/** Type guard to check if message is of specific type */
export function isMessageType<T extends WebviewToExtensionMessage["type"]>(
  message: WebviewToExtensionMessage,
  type: T
): message is Extract<WebviewToExtensionMessage, { type: T }> {
  return message.type === type;
}

// =============================================================================
// Message Validation
// =============================================================================

/** Validate that a message has required fields */
export function validateMessage(data: unknown): data is WebviewToExtensionMessage {
  if (!data || typeof data !== "object") {
    return false;
  }

  const msg = data as Record<string, unknown>;
  if (typeof msg.type !== "string") {
    return false;
  }

  // Check if type is one of the known message types
  const validTypes = Object.values(WEBVIEW_MESSAGE_TYPES);
  return validTypes.includes(msg.type as typeof validTypes[number]);
}

/** Get list of missing required fields for a message type */
export function getMissingFields(message: WebviewToExtensionMessage): string[] {
  const missing: string[] = [];

  switch (message.type) {
    case "updateTask":
      if (!message.columnId) missing.push("columnId");
      if (!message.taskId) missing.push("taskId");
      if (message.title === undefined) missing.push("title");
      if (message.description === undefined) missing.push("description");
      break;
    case "deleteTask":
    case "archiveTask":
    case "completeTask":
      if (!message.columnId) missing.push("columnId");
      if (!message.taskId) missing.push("taskId");
      break;
    case "moveTask":
      if (!message.taskId) missing.push("taskId");
      if (!message.fromColumn) missing.push("fromColumn");
      if (!message.toColumn) missing.push("toColumn");
      if (message.toIndex === undefined) missing.push("toIndex");
      break;
    case "editTask":
    case "editPriority":
    case "sendToAgent":
      if (!message.taskId) missing.push("taskId");
      break;
    case "toggleSubtask":
      if (!message.taskId) missing.push("taskId");
      if (!message.subtaskId) missing.push("subtaskId");
      break;
    case "addTaskToColumn":
      if (!message.columnId) missing.push("columnId");
      break;
    case "addRule":
      if (!message.ruleType) missing.push("ruleType");
      break;
    case "editRule":
    case "deleteRule":
      if (message.ruleId === undefined) missing.push("ruleId");
      if (!message.ruleType) missing.push("ruleType");
      break;
    case "updateTitle":
      if (message.title === undefined) missing.push("title");
      break;
    case "openFile":
      if (!message.filePath) missing.push("filePath");
      break;
    case "saveStatsConfig":
      if (!message.columns) missing.push("columns");
      break;
    // These have no required fields beyond type
    case "clearCache":
    case "openSettings":
    case "fix-issues":
    case "refresh":
    case "getAvailableAgents":
      break;
  }

  return missing;
}

// =============================================================================
// Message Factory Functions
// =============================================================================

/** Create an agentsDetected message */
export function createAgentsDetectedMessage(
  agents: ExtensionToWebviewMessage extends { type: "agentsDetected"; agents: infer A } ? A : never,
  defaultAgent: string,
  lastUsed: string
): ExtensionToWebviewMessage {
  return {
    type: "agentsDetected",
    agents,
    defaultAgent: defaultAgent as ExtensionToWebviewMessage extends { type: "agentsDetected"; defaultAgent: infer D } ? D : never,
    lastUsed: lastUsed as ExtensionToWebviewMessage extends { type: "agentsDetected"; lastUsed: infer L } ? L : never,
  };
}

/** Create a parseWarning message */
export function createParseWarningMessage(message: string): ExtensionToWebviewMessage {
  return {
    type: "parseWarning",
    message,
  };
}
