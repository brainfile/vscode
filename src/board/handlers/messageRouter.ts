/**
 * Message routing and handler dispatch
 * Maps webview messages to board operations
 */

import type { Board } from "@brainfile/core";
import {
  updateTask,
  deleteTask,
  moveTask,
  addTask,
  updateBoardTitle,
  toggleSubtask,
  updateStatsConfig,
  BoardOperationResult,
} from "../data/boardOperations";
import { WEBVIEW_MESSAGE_TYPES } from "../messages";

/**
 * Handler result indicating what action to take
 */
export type HandlerResult =
  | { type: "board-updated"; board: Board }
  | { type: "error"; message: string }
  | { type: "no-op" }
  | { type: "external-action"; action: string; payload?: unknown };

/**
 * Message data from webview
 */
export interface MessageData {
  type: string;
  [key: string]: unknown;
}

/**
 * Route a message to the appropriate handler and return the result
 * @param board - Current board state
 * @param message - Message from webview
 * @returns HandlerResult indicating what happened
 */
export function routeMessage(board: Board, message: MessageData): HandlerResult {
  switch (message.type) {
    case WEBVIEW_MESSAGE_TYPES.UPDATE_TASK:
      return handleBoardOp(
        updateTask(
          board,
          message.columnId as string,
          message.taskId as string,
          message.title as string,
          message.description as string
        )
      );

    case WEBVIEW_MESSAGE_TYPES.DELETE_TASK:
      return handleBoardOp(
        deleteTask(board, message.columnId as string, message.taskId as string)
      );

    case WEBVIEW_MESSAGE_TYPES.MOVE_TASK:
      return handleBoardOp(
        moveTask(
          board,
          message.taskId as string,
          message.fromColumn as string,
          message.toColumn as string,
          message.toIndex as number
        )
      );

    case WEBVIEW_MESSAGE_TYPES.ADD_TASK_TO_COLUMN:
      return handleBoardOp(
        addTask(
          board,
          message.columnId as string,
          message.title as string,
          message.description as string | undefined
        )
      );

    case WEBVIEW_MESSAGE_TYPES.UPDATE_TITLE:
      return handleBoardOp(updateBoardTitle(board, message.title as string));

    case WEBVIEW_MESSAGE_TYPES.TOGGLE_SUBTASK:
      return handleBoardOp(
        toggleSubtask(
          board,
          message.taskId as string,
          message.subtaskId as string
        )
      );

    case WEBVIEW_MESSAGE_TYPES.SAVE_STATS_CONFIG:
      return handleBoardOp(
        updateStatsConfig(board, message.columns as string[])
      );

    // External actions that require VS Code API
    case WEBVIEW_MESSAGE_TYPES.EDIT_TASK:
      return { type: "external-action", action: "editTask", payload: message };

    case WEBVIEW_MESSAGE_TYPES.EDIT_PRIORITY:
      return { type: "external-action", action: "editPriority", payload: message };

    case WEBVIEW_MESSAGE_TYPES.OPEN_FILE:
      return { type: "external-action", action: "openFile", payload: message };

    case WEBVIEW_MESSAGE_TYPES.ARCHIVE_TASK:
      return { type: "external-action", action: "archiveTask", payload: message };

    case WEBVIEW_MESSAGE_TYPES.COMPLETE_TASK:
      return { type: "external-action", action: "completeTask", payload: message };

    case WEBVIEW_MESSAGE_TYPES.CLEAR_CACHE:
      return { type: "external-action", action: "clearCache", payload: message };

    case WEBVIEW_MESSAGE_TYPES.OPEN_SETTINGS:
      return { type: "external-action", action: "openSettings", payload: message };

    case WEBVIEW_MESSAGE_TYPES.REFRESH:
      return { type: "external-action", action: "refresh", payload: message };

    case WEBVIEW_MESSAGE_TYPES.FIX_ISSUES:
      return { type: "external-action", action: "fixIssues", payload: message };

    case WEBVIEW_MESSAGE_TYPES.SEND_TO_AGENT:
      return { type: "external-action", action: "sendToAgent", payload: message };

    case WEBVIEW_MESSAGE_TYPES.GET_AVAILABLE_AGENTS:
      return { type: "external-action", action: "getAvailableAgents", payload: message };

    case WEBVIEW_MESSAGE_TYPES.ADD_RULE:
      return { type: "external-action", action: "addRule", payload: message };

    case WEBVIEW_MESSAGE_TYPES.EDIT_RULE:
      return { type: "external-action", action: "editRule", payload: message };

    case WEBVIEW_MESSAGE_TYPES.DELETE_RULE:
      return { type: "external-action", action: "deleteRule", payload: message };

    default:
      return { type: "no-op" };
  }
}

/**
 * Convert BoardOperationResult to HandlerResult
 */
function handleBoardOp(result: BoardOperationResult): HandlerResult {
  if (result.success && result.board) {
    return { type: "board-updated", board: result.board };
  }
  return { type: "error", message: result.error || "Unknown error" };
}

/**
 * Check if a message type results in a board mutation
 */
export function isBoardMutatingMessage(type: string): boolean {
  const mutatingTypes: string[] = [
    WEBVIEW_MESSAGE_TYPES.UPDATE_TASK,
    WEBVIEW_MESSAGE_TYPES.DELETE_TASK,
    WEBVIEW_MESSAGE_TYPES.MOVE_TASK,
    WEBVIEW_MESSAGE_TYPES.ADD_TASK_TO_COLUMN,
    WEBVIEW_MESSAGE_TYPES.UPDATE_TITLE,
    WEBVIEW_MESSAGE_TYPES.TOGGLE_SUBTASK,
    WEBVIEW_MESSAGE_TYPES.SAVE_STATS_CONFIG,
  ];
  return mutatingTypes.includes(type);
}

/**
 * Get handler action name for logging
 */
export function getActionName(type: string): string {
  const actionNames: Record<string, string> = {
    [WEBVIEW_MESSAGE_TYPES.UPDATE_TASK]: "Update Task",
    [WEBVIEW_MESSAGE_TYPES.DELETE_TASK]: "Delete Task",
    [WEBVIEW_MESSAGE_TYPES.MOVE_TASK]: "Move Task",
    [WEBVIEW_MESSAGE_TYPES.ADD_TASK_TO_COLUMN]: "Add Task",
    [WEBVIEW_MESSAGE_TYPES.UPDATE_TITLE]: "Update Board Title",
    [WEBVIEW_MESSAGE_TYPES.TOGGLE_SUBTASK]: "Toggle Subtask",
    [WEBVIEW_MESSAGE_TYPES.SAVE_STATS_CONFIG]: "Save Stats Config",
    [WEBVIEW_MESSAGE_TYPES.EDIT_TASK]: "Edit Task",
    [WEBVIEW_MESSAGE_TYPES.EDIT_PRIORITY]: "Edit Priority",
    [WEBVIEW_MESSAGE_TYPES.OPEN_FILE]: "Open File",
    [WEBVIEW_MESSAGE_TYPES.ARCHIVE_TASK]: "Archive Task",
    [WEBVIEW_MESSAGE_TYPES.COMPLETE_TASK]: "Complete Task",
    [WEBVIEW_MESSAGE_TYPES.CLEAR_CACHE]: "Clear Cache",
    [WEBVIEW_MESSAGE_TYPES.OPEN_SETTINGS]: "Open Settings",
    [WEBVIEW_MESSAGE_TYPES.REFRESH]: "Refresh",
    [WEBVIEW_MESSAGE_TYPES.FIX_ISSUES]: "Fix Issues",
    [WEBVIEW_MESSAGE_TYPES.SEND_TO_AGENT]: "Send to Agent",
    [WEBVIEW_MESSAGE_TYPES.GET_AVAILABLE_AGENTS]: "Get Available Agents",
  };
  return actionNames[type] || type;
}
