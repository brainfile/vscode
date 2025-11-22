/**
 * Error page HTML generation
 */

import type { LintResult, LintIssue } from "@brainfile/core";
import { escapeHtml } from "./utils";

/**
 * Options for error page generation
 */
export interface ErrorPageOptions {
  message: string;
  details?: string;
  lintResult?: LintResult;
}

/**
 * Generate HTML for an error page
 * @param options - Error page options
 * @returns Complete HTML document string
 */
export function generateErrorHtml(options: ErrorPageOptions): string {
  const { message, details, lintResult } = options;

  const hasFixableIssues = lintResult?.issues.some((i) => i.fixable) || false;
  const issuesList = generateIssuesList(lintResult?.issues || []);
  const fixableCount = lintResult?.issues.filter((i) => i.fixable).length || 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
${getErrorStyles()}
  </style>
</head>
<body>
  <div class="error-container">
    <div class="error-title">${escapeHtml(message)}</div>
    ${details ? `<div class="error-details">${escapeHtml(details)}</div>` : ""}

    ${
      lintResult && lintResult.issues.length > 0
        ? `
    <div class="issues-list">
      <h3>Issues Found (${lintResult.issues.length}):</h3>
      <ul>${issuesList}</ul>
    </div>
    `
        : ""
    }

    <div class="action-buttons">
      ${
        hasFixableIssues
          ? `
        <button class="btn btn-primary" id="fix-issues-btn">
          Fix Issues (${fixableCount})
        </button>
      `
          : ""
      }
      <button class="btn btn-secondary" id="refresh-btn">
        Refresh
      </button>
    </div>
  </div>

  <script>
${getErrorScript()}
  </script>
</body>
</html>`;
}

/**
 * Generate HTML list items for lint issues
 */
function generateIssuesList(issues: LintIssue[]): string {
  return issues
    .map((issue) => {
      const icon = issue.type === "error" ? "❌" : "⚠️";
      const fixable = issue.fixable ? " [fixable]" : "";
      const location = issue.line ? ` (line ${issue.line})` : "";
      return `<li>${icon} ${escapeHtml(issue.message)}${location}${fixable}</li>`;
    })
    .join("");
}

/**
 * Get CSS styles for error page
 */
function getErrorStyles(): string {
  return `    body {
      padding: 20px;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
    }
    .error-container {
      max-width: 600px;
    }
    .error-title {
      color: var(--vscode-errorForeground);
      font-weight: bold;
      margin-bottom: 12px;
      font-size: 1.2em;
    }
    .error-details {
      color: var(--vscode-descriptionForeground);
      white-space: pre-line;
      line-height: 1.6;
      margin-top: 12px;
      margin-bottom: 16px;
    }
    .issues-list {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 12px;
      margin: 16px 0;
    }
    .issues-list h3 {
      margin: 0 0 12px 0;
      font-size: 1em;
      color: var(--vscode-foreground);
    }
    .issues-list ul {
      margin: 0;
      padding-left: 20px;
      list-style: none;
    }
    .issues-list li {
      margin: 8px 0;
      line-height: 1.5;
    }
    .action-buttons {
      display: flex;
      gap: 12px;
      margin-top: 16px;
    }
    .btn {
      padding: 8px 16px;
      border: 1px solid var(--vscode-button-border);
      border-radius: 2px;
      cursor: pointer;
      font-family: var(--vscode-font-family);
      font-size: 13px;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }`;
}

/**
 * Get JavaScript for error page interactions
 */
function getErrorScript(): string {
  return `    const vscode = acquireVsCodeApi();

    const fixBtn = document.getElementById('fix-issues-btn');
    if (fixBtn) {
      fixBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'fix-issues' });
        fixBtn.disabled = true;
        fixBtn.textContent = 'Fixing...';
      });
    }

    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'refresh' });
      });
    }`;
}
