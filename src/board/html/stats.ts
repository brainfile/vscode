/**
 * Stats panel HTML generation
 */

import type { Board, Column } from "@brainfile/core";
import { escapeHtml } from "./utils";

/**
 * Generate HTML for stats display
 * @param board - The board data
 * @param totalTasks - Total task count
 * @returns HTML string for stats panel
 */
export function generateStatsHtml(board: Board, totalTasks: number): string {
  // Check if custom stat columns are configured
  if (board.statsConfig?.columns && board.statsConfig.columns.length > 0) {
    return generateCustomStatsHtml(board.columns, board.statsConfig.columns);
  }

  return generateDefaultStatsHtml(board.columns, totalTasks);
}

/**
 * Generate stats HTML for custom configured columns
 */
function generateCustomStatsHtml(columns: Column[], configuredColumnIds: string[]): string {
  // Use configured columns (max 4)
  const statColumns = configuredColumnIds.slice(0, 4);

  return statColumns
    .map((columnId) => {
      const column = columns.find((col) => col.id === columnId);
      if (column) {
        return generateStatItem(column.tasks.length, column.title);
      }
      return "";
    })
    .join("");
}

/**
 * Generate default stats HTML (Total and Done)
 */
function generateDefaultStatsHtml(columns: Column[], totalTasks: number): string {
  const doneColumn = columns.find((col) => col.id === "done");
  const doneTasks = doneColumn ? doneColumn.tasks.length : 0;

  return `
    ${generateStatItem(totalTasks, "Total")}
    ${generateStatItem(doneTasks, "Done")}
  `;
}

/**
 * Generate a single stat item HTML
 */
function generateStatItem(value: number, label: string): string {
  return `
    <div class="stat">
      <div class="stat-value">${value}</div>
      <div class="stat-label">${escapeHtml(label)}</div>
    </div>
  `;
}

/**
 * Generate progress bar HTML
 * @param progressPercent - Percentage (0-100)
 * @returns HTML string for progress bar
 */
export function generateProgressBarHtml(progressPercent: number): string {
  return `
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${progressPercent}%"></div>
    </div>
  `;
}
