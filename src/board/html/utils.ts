/**
 * Pure utility functions for HTML generation
 * These functions have no dependencies and are easily testable
 */

import type { Subtask } from "@brainfile/core";

/**
 * Generate a cryptographically random nonce for CSP
 * @returns 32-character alphanumeric string
 */
export function generateNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * Escape HTML special characters to prevent XSS
 * @param text - Raw text to escape
 * @returns HTML-safe string
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Convert priority string to CSS class name
 * @param priority - Priority value (e.g., "high", "giga-urgent")
 * @returns CSS-safe class name (e.g., "priority-high", "priority-giga-urgent")
 */
export function getPriorityClassName(priority: string): string {
  return `priority-${priority.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
}

/**
 * Calculate subtask completion percentage
 * @param subtasks - Array of subtasks
 * @returns Percentage (0-100) of completed subtasks
 */
export function getSubtaskProgress(subtasks: Subtask[] | undefined): number {
  if (!subtasks || subtasks.length === 0) return 0;
  const completed = subtasks.filter((st) => st.completed).length;
  return Math.round((completed / subtasks.length) * 100);
}

/**
 * Count completed subtasks
 * @param subtasks - Array of subtasks
 * @returns Number of completed subtasks
 */
export function getCompletedSubtaskCount(subtasks: Subtask[] | undefined): number {
  if (!subtasks) return 0;
  return subtasks.filter((st) => st.completed).length;
}

/**
 * Calculate total tasks across all columns
 * @param columns - Board columns with tasks
 * @returns Total task count
 */
export function getTotalTaskCount(columns: { tasks: unknown[] }[]): number {
  return columns.reduce((sum, col) => sum + col.tasks.length, 0);
}

/**
 * Calculate progress percentage based on done column
 * @param totalTasks - Total number of tasks
 * @param doneTasks - Number of completed tasks
 * @returns Percentage (0-100)
 */
export function calculateProgressPercent(totalTasks: number, doneTasks: number): number {
  if (totalTasks === 0) return 0;
  return Math.round((doneTasks / totalTasks) * 100);
}

/**
 * Extract unique values from tasks for filtering
 */
export interface FilterValues {
  tags: string[];
  assignees: string[];
  priorities: string[];
}

/**
 * Extract unique filter values from tasks
 * @param tasks - Array of tasks
 * @returns Sorted unique values for tags, assignees, and priorities
 */
export function extractFilterValues(
  tasks: Array<{ tags?: string[]; assignee?: string; priority?: string }>
): FilterValues {
  const uniqueTags = new Set<string>();
  const uniqueAssignees = new Set<string>();
  const uniquePriorities = new Set<string>();

  tasks.forEach((task) => {
    if (task.tags) {
      task.tags.forEach((tag) => uniqueTags.add(tag));
    }
    if (task.assignee) {
      uniqueAssignees.add(task.assignee);
    }
    if (task.priority) {
      uniquePriorities.add(task.priority);
    }
  });

  // Sort values
  const priorityOrder = ["critical", "high", "medium", "low"];
  const sortedPriorities = Array.from(uniquePriorities).sort((a, b) => {
    const aIndex = priorityOrder.indexOf(a);
    const bIndex = priorityOrder.indexOf(b);
    // Known priorities first in order, then unknown alphabetically
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return {
    tags: Array.from(uniqueTags).sort(),
    assignees: Array.from(uniqueAssignees).sort(),
    priorities: sortedPriorities,
  };
}
