/**
 * Pure utility functions for HTML generation
 * These functions have no dependencies and are easily testable
 */

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
