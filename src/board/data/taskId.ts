/**
 * Task ID generation utilities
 */

import type { Board, Column, Task } from "@brainfile/core";

/**
 * Extract numeric ID from task ID string
 * @param taskId - Task ID like "task-123"
 * @returns Numeric portion or 0 if not parseable
 */
export function extractTaskIdNumber(taskId: string): number {
  const match = taskId.match(/task-(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Get the highest task ID number from a board
 * @param board - Board to scan
 * @returns Highest task ID number found, or 0 if no tasks
 */
export function getMaxTaskIdNumber(board: Board): number {
  const allTaskIds = board.columns.flatMap((col) =>
    col.tasks.map((t) => extractTaskIdNumber(t.id))
  );
  return Math.max(0, ...allTaskIds);
}

/**
 * Generate the next task ID for a board
 * @param board - Board to generate ID for
 * @returns Next task ID like "task-42"
 */
export function generateNextTaskId(board: Board): string {
  const maxId = getMaxTaskIdNumber(board);
  return `task-${maxId + 1}`;
}

/**
 * Check if a task ID already exists in a board
 * @param board - Board to check
 * @param taskId - Task ID to look for
 * @returns True if task ID exists
 */
export function taskIdExists(board: Board, taskId: string): boolean {
  return board.columns.some((col) => col.tasks.some((t) => t.id === taskId));
}

/**
 * Find a task by ID across all columns
 * @param board - Board to search
 * @param taskId - Task ID to find
 * @returns Task and column info, or undefined if not found
 */
export function findTaskById(
  board: Board,
  taskId: string
): { task: Task; column: Column; index: number } | undefined {
  for (const column of board.columns) {
    const index = column.tasks.findIndex((t) => t.id === taskId);
    if (index !== -1) {
      return { task: column.tasks[index], column, index };
    }
  }
  return undefined;
}

/**
 * Find a column by ID
 * @param board - Board to search
 * @param columnId - Column ID to find
 * @returns Column or undefined
 */
export function findColumnById(board: Board, columnId: string): Column | undefined {
  return board.columns.find((col) => col.id === columnId);
}
