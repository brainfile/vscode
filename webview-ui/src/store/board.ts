import { ref } from "vue";
import type { Board, LintResult } from "@brainfile/core";
import { defineStore } from "pinia";
import type {
  AgentType,
  AvailableFile,
  ColumnSortState,
  DetectedAgent,
  SortField,
  WebviewToExtensionMessage,
} from "../types";
import { useVSCodeApi } from "../composables/useVSCodeApi";
import { useUiStore } from "./ui";

const vscode = useVSCodeApi();



function applyPriorityStyles(css?: string) {
  if (typeof document === "undefined") return;
  let styleEl = document.getElementById("priority-styles") as HTMLStyleElement | null;
  if (!css) {
    if (styleEl?.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
    }
    return;
  }

  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "priority-styles";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = css;
}

export const useBoardStore = defineStore("board", () => {
  const board = ref<Board | null>(null);
  const loading = ref(true);
  const parseWarning = ref<{ message: string; lintResult?: LintResult } | undefined>();

  const collapsedColumns = ref<Record<string, boolean>>({});
  const columnSortState = ref<ColumnSortState>({});
  const availableAgents = ref<DetectedAgent[]>([]);
  const defaultAgent = ref<AgentType | null>(null);
  const lastUsedAgent = ref<AgentType | null>(null);
  const priorityStyles = ref<string | undefined>();
  const availableFiles = ref<AvailableFile[]>([]);







  function setBoard(newBoard: Board | null, css?: string) {
    board.value = newBoard;
    loading.value = false;
    if (css !== undefined) {
      priorityStyles.value = css;
      applyPriorityStyles(css);
    }
  }

  function setParseWarning(message?: string, lintResult?: LintResult) {
    parseWarning.value = message ? { message, lintResult } : undefined;
  }

  function setAgents(agents: DetectedAgent[], preferred: AgentType, lastUsed: AgentType) {
    availableAgents.value = agents;
    defaultAgent.value = preferred;
    lastUsedAgent.value = lastUsed;
  }

  function setAvailableFiles(files: AvailableFile[]) {
    availableFiles.value = files;
  }

  function switchFile(absolutePath: string) {
    sendMessage({ type: "switchFile", absolutePath });
  }

  function switchToFileViaQuickPick() {
    sendMessage({ type: "triggerQuickPick" });
  }

  function sendMessage(message: WebviewToExtensionMessage) {
    vscode.postMessage(message);
  }

  function requestInitialData() {
    sendMessage({ type: "webviewReady" });
    sendMessage({ type: "getAvailableAgents" });
  }



  function toggleColumnCollapse(columnId: string) {
    collapsedColumns.value[columnId] = !collapsedColumns.value[columnId];
  }

  function isColumnCollapsed(columnId: string): boolean {
    return !!collapsedColumns.value[columnId];
  }

  function getColumnSort(columnId: string): SortField {
    return columnSortState.value[columnId] ?? "manual";
  }

  function setColumnSort(columnId: string, sortField: SortField) {
    columnSortState.value[columnId] = sortField;
  }

  function getTaskIndex(columnId: string, taskId: string): number {
    const col = board.value?.columns.find((c) => c.id === columnId);
    if (!col) return -1;
    return col.tasks.findIndex((t) => t.id === taskId);
  }

  function moveTask(taskId: string, fromColumn: string, toColumn: string, toIndex: number) {
    sendMessage({
      type: "moveTask",
      taskId,
      fromColumn,
      toColumn,
      toIndex,
    });
  }

  function addTaskToColumn(columnId: string) {
    sendMessage({ type: "addTaskToColumn", columnId });
  }

  function editTask(taskId: string) {
    sendMessage({ type: "editTask", taskId });
  }

  function editPriority(taskId: string) {
    sendMessage({ type: "editPriority", taskId });
  }

  function deleteTask(columnId: string, taskId: string) {
    sendMessage({ type: "deleteTask", columnId, taskId });
  }

  function archiveTask(columnId: string, taskId: string) {
    sendMessage({ type: "archiveTask", columnId, taskId });
  }

  function completeTask(columnId: string, taskId: string) {
    sendMessage({ type: "completeTask", columnId, taskId });
  }

  function toggleSubtask(taskId: string, subtaskId: string) {
    sendMessage({ type: "toggleSubtask", taskId, subtaskId });
  }

  function updateTitle(title: string) {
    sendMessage({ type: "updateTitle", title });
  }

  function openFile(filePath: string) {
    sendMessage({ type: "openFile", filePath });
  }

  function sendToAgent(taskId: string, agentType?: AgentType) {
    const agent =
      agentType ||
      lastUsedAgent.value ||
      defaultAgent.value ||
      availableAgents.value.find((a) => a.available && a.type !== "copy")?.type ||
      "copy";

    sendMessage({ type: "sendToAgent", taskId, agentType: agent });
  }

  function refresh() {
    loading.value = true;
    sendMessage({ type: "refresh" });
  }

  function openSettings() {
    sendMessage({ type: "openSettings" });
  }

  function clearCache() {
    sendMessage({ type: "clearCache" });
  }

  function addRule(ruleType: string) {
    sendMessage({ type: "addRule", ruleType });
  }

  function editRule(ruleId: number, ruleType: string) {
    sendMessage({ type: "editRule", ruleId, ruleType });
  }

  function deleteRule(ruleId: number, ruleType: string) {
    sendMessage({ type: "deleteRule", ruleId, ruleType });
  }



  // Bulk operations
  function bulkMoveTasks(toColumnId: string) {
    const uiStore = useUiStore();
    if (uiStore.selectedTaskIds.size === 0) return;
    sendMessage({
      type: "bulkMoveTasks",
      taskIds: Array.from(uiStore.selectedTaskIds),
      toColumnId,
    });
    uiStore.clearSelection();
  }

  function bulkArchiveTasks() {
    const uiStore = useUiStore();
    if (uiStore.selectedTaskIds.size === 0) return;
    sendMessage({
      type: "bulkArchiveTasks",
      taskIds: Array.from(uiStore.selectedTaskIds),
    });
    uiStore.clearSelection();
  }


  function bulkDeleteTasks() {
    const uiStore = useUiStore();
    if (uiStore.selectedTaskIds.size === 0) return;
    sendMessage({
      type: "bulkDeleteTasks",
      taskIds: Array.from(uiStore.selectedTaskIds),
    });
    uiStore.clearSelection();
  }

  function bulkPatchTasks(patch: { priority?: string; tags?: string[]; assignee?: string }) {
    const uiStore = useUiStore();
    if (uiStore.selectedTaskIds.size === 0) return;
    sendMessage({
      type: "bulkPatchTasks",
      taskIds: Array.from(uiStore.selectedTaskIds),
      patch,
    });
    uiStore.clearSelection();
  }

  function triggerTaskActionQuickPick(columnId: string, taskId: string) {
    sendMessage({ type: "triggerTaskActionQuickPick", columnId, taskId });
  }

  return {
    board,
    loading,
    parseWarning,
    collapsedColumns,
    columnSortState,
    availableAgents,
    defaultAgent,
    lastUsedAgent,
    priorityStyles,
    availableFiles,
    setBoard,
    setParseWarning,
    setAgents,
    setAvailableFiles,
    switchFile,
    switchToFileViaQuickPick,
    sendMessage,
    requestInitialData,
    toggleColumnCollapse,
    isColumnCollapsed,
    getColumnSort,
    setColumnSort,
    getTaskIndex,
    moveTask,
    addTaskToColumn,
    editTask,
    editPriority,
    deleteTask,
    archiveTask,
    completeTask,
    toggleSubtask,
    updateTitle,
    openFile,
    sendToAgent,
    refresh,
    openSettings,
    clearCache,
    addRule,
    editRule,
    deleteRule,
    // Bulk operations
    bulkMoveTasks,
    bulkArchiveTasks,
    bulkDeleteTasks,
    bulkPatchTasks,
    triggerTaskActionQuickPick,
  };
});
