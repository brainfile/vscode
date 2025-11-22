import type { Board, Task, Column, Subtask } from "@brainfile/core";

export type AgentType = "copilot" | "cursor" | "claude-code" | "copy";

export interface DetectedAgent {
  type: AgentType;
  label: string;
  available: boolean;
}

export interface BoardUpdateMessage {
  type: "boardUpdate";
  board: Board | null;
  priorityStyles?: string;
}

export interface ParseWarningMessage {
  type: "parseWarning";
  message: string;
}

export interface AgentsDetectedMessage {
  type: "agentsDetected";
  agents: DetectedAgent[];
  defaultAgent: AgentType;
  lastUsed: AgentType;
}

export type ExtensionMessage =
  | BoardUpdateMessage
  | ParseWarningMessage
  | AgentsDetectedMessage;

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
    | "getAvailableAgents";
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
