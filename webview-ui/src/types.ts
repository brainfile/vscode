import type { Board, Task, Column, Subtask, LintResult } from "@brainfile/core";

export type AgentType =
  | "copilot"
  | "cursor"
  | "cline"
  | "kilo-code"
  | "claude-code"
  | "continue"
  | "copy";

export interface DetectedAgent {
  type: AgentType;
  label: string;
  available: boolean;
  /** Capability level: full, partial, or minimal */
  capability: "full" | "partial" | "minimal";
}

export interface BoardUpdateMessage {
  type: "boardUpdate";
  board: Board | null;
  priorityStyles?: string;
}

export interface ParseWarningMessage {
  type: "parseWarning";
  message: string;
  lintResult?: LintResult;
}

export interface AgentsDetectedMessage {
  type: "agentsDetected";
  agents: DetectedAgent[];
  defaultAgent: AgentType;
  lastUsed: AgentType;
}

export interface AvailableFile {
  name: string;
  relativePath: string;
  absolutePath: string;
  itemCount: number;
  isPrivate: boolean;
  isCurrent: boolean;
  isBlank: boolean;
}

export interface AvailableFilesMessage {
  type: "availableFiles";
  files: AvailableFile[];
}

export type ExtensionMessage =
  | BoardUpdateMessage
  | ParseWarningMessage
  | AgentsDetectedMessage
  | AvailableFilesMessage;

export interface WebviewReadyMessage {
  type: "webviewReady";
}

export interface WebviewCommandMessage {
  type:
    | "updateTask"
    | "editTask"
    | "editPriority"
    | "deleteTask"
    | "moveTask"
    | "updateTitle"
    | "openFile"
    | "clearCache"
    | "openSettings"
    | "archiveTask"
    | "completeTask"
    | "addTaskToColumn"
    | "addRule"
    | "editRule"
    | "deleteRule"
    | "toggleSubtask"
    | "saveStatsConfig"
    | "fix-issues"
    | "refresh"
    | "sendToAgent"
    | "getAvailableAgents"
    | "switchFile"
    | "triggerQuickPick"
    | "triggerTaskActionQuickPick"
    | "openFilePicker"
    | "getAvailableFiles"
    // Bulk operations
    | "bulkMoveTasks"
    | "bulkArchiveTasks"
    | "bulkDeleteTasks"
    | "bulkPatchTasks";
  [key: string]: unknown;
}

export type WebviewToExtensionMessage = WebviewReadyMessage | WebviewCommandMessage;

export interface FilterOptions {
  tags: string[];
  priorities: string[];
  assignees: string[];
}

export interface FiltersState {
  query: string;
  tags: string[];
  priorities: string[];
  assignees: string[];
}

export type TaskLike = Task;
export type ColumnLike = Column;
export type SubtaskLike = Subtask;

/** Sort field options for tasks within a column */
export type SortField = "manual" | "priority" | "dueDate" | "effort" | "title";

export interface SortOption {
  field: SortField;
  label: string;
  /** Sort direction indicator shown in UI */
  indicator: string;
}

/** Available sort options with sane defaults */
export const SORT_OPTIONS: SortOption[] = [
  { field: "manual", label: "Manual", indicator: "" },
  { field: "priority", label: "Priority", indicator: "↓" },
  { field: "dueDate", label: "Due Date", indicator: "↑" },
  { field: "effort", label: "Effort", indicator: "↓" },
  { field: "title", label: "Title", indicator: "A-Z" },
];

/** Per-column sort state */
export interface ColumnSortState {
  [columnId: string]: SortField;
}
