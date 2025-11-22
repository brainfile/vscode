import { computed, ref } from "vue";
import type { Board, Task } from "@brainfile/core";
import { defineStore } from "pinia";
import type {
  AgentType,
  DetectedAgent,
  FilterOptions,
  FiltersState,
  WebviewToExtensionMessage,
} from "../types";
import { useVSCodeApi } from "../composables/useVSCodeApi";

const vscode = useVSCodeApi();

function matchesFilter(task: Task, filters: FiltersState): boolean {
  const query = filters.query.trim().toLowerCase();
  if (query) {
    const text = `${task.title} ${task.description ?? ""} ${task.assignee ?? ""} ${task.tags?.join(" ") ?? ""}`.toLowerCase();
    if (!text.includes(query)) {
      return false;
    }
  }

  if (filters.priorities.length > 0 && task.priority) {
    if (!filters.priorities.includes(task.priority)) {
      return false;
    }
  } else if (filters.priorities.length > 0 && !task.priority) {
    return false;
  }

  if (filters.assignees.length > 0) {
    const assignee = task.assignee ?? "";
    if (!assignee || !filters.assignees.includes(assignee)) {
      return false;
    }
  }

  if (filters.tags.length > 0) {
    const taskTags = task.tags ?? [];
    const hasAll = filters.tags.every((tag) => taskTags.includes(tag));
    if (!hasAll) {
      return false;
    }
  }

  return true;
}

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
  const parseWarning = ref<string | undefined>();
  const filters = ref<FiltersState>({
    query: "",
    tags: [],
    priorities: [],
    assignees: [],
  });
  const collapsedColumns = ref<Record<string, boolean>>({});
  const availableAgents = ref<DetectedAgent[]>([]);
  const defaultAgent = ref<AgentType | null>(null);
  const lastUsedAgent = ref<AgentType | null>(null);
  const priorityStyles = ref<string | undefined>();

  const filterOptions = computed<FilterOptions>(() => {
    const options: FilterOptions = { tags: [], priorities: [], assignees: [] };
    if (!board.value) return options;

    const tags = new Set<string>();
    const assignees = new Set<string>();
    const priorities = new Set<string>();

    board.value.columns.forEach((column) => {
      column.tasks.forEach((task) => {
        task.tags?.forEach((tag) => tags.add(tag));
        if (task.assignee) assignees.add(task.assignee);
        if (task.priority) priorities.add(task.priority);
      });
    });

    options.tags = Array.from(tags).sort();
    options.assignees = Array.from(assignees).sort();
    const priorityOrder = ["critical", "high", "medium", "low"];
    options.priorities = Array.from(priorities).sort(
      (a, b) => priorityOrder.indexOf(a) - priorityOrder.indexOf(b)
    );
    return options;
  });

  const filteredColumns = computed(() => {
    if (!board.value) return [];
    return board.value.columns.map((column) => ({
      ...column,
      tasks: column.tasks.filter((task) => matchesFilter(task, filters.value)),
    }));
  });

  function setBoard(newBoard: Board | null, css?: string) {
    board.value = newBoard;
    loading.value = false;
    if (css !== undefined) {
      priorityStyles.value = css;
      applyPriorityStyles(css);
    }
  }

  function setParseWarning(message?: string) {
    parseWarning.value = message;
  }

  function setAgents(agents: DetectedAgent[], preferred: AgentType, lastUsed: AgentType) {
    availableAgents.value = agents;
    defaultAgent.value = preferred;
    lastUsedAgent.value = lastUsed;
  }

  function sendMessage(message: WebviewToExtensionMessage) {
    vscode.postMessage(message);
  }

  function requestInitialData() {
    sendMessage({ type: "webviewReady" });
    sendMessage({ type: "getAvailableAgents" });
  }

  function updateFilters(patch: Partial<FiltersState>) {
    filters.value = { ...filters.value, ...patch };
  }

  function resetFilters() {
    filters.value = { query: "", tags: [], priorities: [], assignees: [] };
  }

  function toggleColumnCollapse(columnId: string) {
    collapsedColumns.value[columnId] = !collapsedColumns.value[columnId];
  }

  function isColumnCollapsed(columnId: string): boolean {
    return !!collapsedColumns.value[columnId];
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

  return {
    board,
    loading,
    parseWarning,
    filters,
    filterOptions,
    filteredColumns,
    collapsedColumns,
    availableAgents,
    defaultAgent,
    lastUsedAgent,
    priorityStyles,
    setBoard,
    setParseWarning,
    setAgents,
    requestInitialData,
    updateFilters,
    resetFilters,
    toggleColumnCollapse,
    isColumnCollapsed,
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
  };
});
