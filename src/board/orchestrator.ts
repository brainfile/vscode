/**
 * Slim board orchestrator
 * Coordinates between VS Code APIs and pure board operations
 */

import * as fs from "fs";
import { BrainfileParser, BrainfileSerializer, Board, BrainfileLinter } from "@brainfile/core";
import { routeMessage, HandlerResult, getActionName } from "./handlers";
import { generateNextTaskId, findTaskById } from "./data";
import { generateErrorHtml, ErrorPageOptions } from "./html";

// Re-export for convenience
export { routeMessage, HandlerResult };

/**
 * Result of a board file operation
 */
export interface FileOperationResult {
  success: boolean;
  board?: Board;
  error?: string;
}

/**
 * Read and parse a brainfile from disk
 */
export function readBoardFromDisk(filePath: string): FileOperationResult {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const board = BrainfileParser.parse(content);
    if (!board) {
      return { success: false, error: "Failed to parse brainfile" };
    }
    return { success: true, board };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Write a board to disk
 */
export function writeBoardToDisk(filePath: string, board: Board): FileOperationResult {
  try {
    const content = BrainfileSerializer.serialize(board);
    fs.writeFileSync(filePath, content, "utf8");
    return { success: true, board };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Hash content for change detection
 */
export function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Lint a brainfile and return results
 */
export function lintBrainfile(content: string) {
  return BrainfileLinter.lint(content);
}

/**
 * Process a webview message and apply it to the board
 * Returns the handler result and any side effects needed
 */
export function processMessage(
  board: Board,
  message: { type: string; [key: string]: unknown }
): {
  result: HandlerResult;
  actionName: string;
} {
  const result = routeMessage(board, message);
  const actionName = getActionName(message.type);
  return { result, actionName };
}

/**
 * Options for the board update workflow
 */
export interface UpdateWorkflowOptions {
  filePath: string;
  message: { type: string; [key: string]: unknown };
  onBeforeWrite?: (board: Board) => void;
  onAfterWrite?: (board: Board) => void;
  log?: (message: string) => void;
}

/**
 * Execute the standard board update workflow:
 * 1. Read board from disk
 * 2. Process the message
 * 3. Write updated board back to disk
 *
 * Returns the handler result for further processing
 */
export function executeUpdateWorkflow(options: UpdateWorkflowOptions): HandlerResult {
  const { filePath, message, onBeforeWrite, onAfterWrite, log } = options;

  // Read current board
  const readResult = readBoardFromDisk(filePath);
  if (!readResult.success || !readResult.board) {
    return { type: "error", message: readResult.error || "Failed to read board" };
  }

  // Process the message
  const { result, actionName } = processMessage(readResult.board, message);
  log?.(`Processing ${actionName}`);

  // Handle the result
  if (result.type === "board-updated") {
    onBeforeWrite?.(result.board);

    const writeResult = writeBoardToDisk(filePath, result.board);
    if (!writeResult.success) {
      return { type: "error", message: writeResult.error || "Failed to write board" };
    }

    onAfterWrite?.(result.board);
    log?.(`${actionName} completed successfully`);
  }

  return result;
}

/**
 * Generate error page HTML with lint results
 */
export function generateErrorPage(
  message: string,
  content?: string,
  details?: string
): string {
  const options: ErrorPageOptions = { message, details };

  if (content) {
    const lintResult = lintBrainfile(content);
    if (!lintResult.valid) {
      options.lintResult = lintResult;
    }
  }

  return generateErrorHtml(options);
}

/**
 * Helpers for common board queries
 */
export const BoardQueries = {
  getNextTaskId: generateNextTaskId,
  findTask: findTaskById,
};
