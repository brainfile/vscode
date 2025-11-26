import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { Task } from "@brainfile/core";
import type { FilterOptions, FiltersState, SortField } from "../types";
import { useBoardStore } from "./board"; // Import board store to access board data

// Parse query for modifiers like tag:value, priority:value, assignee:value
function parseQueryModifiers(query: string): {
  textQuery: string;
  tags: string[];
  priorities: string[];
  assignees: string[];
} {
  const tags: string[] = [];
  const priorities: string[] = [];
  const assignees: string[] = [];
  const textParts: string[] = [];

  // Split by spaces and parse each part
  const parts = query.trim().split(/\s+/);
  for (const part of parts) {
    const lowerPart = part.toLowerCase();
    if (lowerPart.startsWith("tag:")) {
      const value = part.slice(4);
      if (value) tags.push(value);
    } else if (lowerPart.startsWith("priority:")) {
      const value = part.slice(9).toLowerCase();
      if (value) priorities.push(value);
    } else if (lowerPart.startsWith("assignee:")) {
      const value = part.slice(9);
      if (value) assignees.push(value);
    } else if (part) {
      textParts.push(part);
    }
  }

  return {
    textQuery: textParts.join(" ").toLowerCase(),
    tags,
    priorities,
    assignees,
  };
}

function matchesFilter(task: Task, filters: FiltersState): boolean {
  // Parse modifiers from query string
  const { textQuery, tags: queryTags, priorities: queryPriorities, assignees: queryAssignees } =
    parseQueryModifiers(filters.query);

  // Text search (on title, description, assignee, tags)
  if (textQuery) {
    const text = `${task.title} ${task.description ?? ""} ${task.assignee ?? ""} ${task.tags?.join(" ") ?? ""}`.toLowerCase();
    if (!text.includes(textQuery)) {
      return false;
    }
  }

  // Combine query modifiers with existing filter arrays
  const allPriorities = [...filters.priorities, ...queryPriorities];
  const allAssignees = [...filters.assignees, ...queryAssignees];
  const allTags = [...filters.tags, ...queryTags];

  // Priority filter
  if (allPriorities.length > 0) {
    if (!task.priority || !allPriorities.includes(task.priority)) {
      return false;
    }
  }

  // Assignee filter
  if (allAssignees.length > 0) {
    const assignee = task.assignee ?? "";
    // Case-insensitive match for assignees from query
    const matchesAssignee = allAssignees.some(
      (a) => a.toLowerCase() === assignee.toLowerCase()
    );
    if (!assignee || !matchesAssignee) {
      return false;
    }
  }

  // Tag filter (must have ALL specified tags)
  if (allTags.length > 0) {
    const taskTags = task.tags ?? [];
    const taskTagsLower = taskTags.map((t) => t.toLowerCase());
    const hasAll = allTags.every((tag) =>
      taskTagsLower.includes(tag.toLowerCase())
    );
    if (!hasAll) {
      return false;
    }
  }

  return true;
}

/** Priority order for sorting (higher priority = lower index) */
const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Effort order for sorting (larger effort = lower index) */
const EFFORT_ORDER: Record<string, number> = {
  xlarge: 0,
  large: 1,
  medium: 2,
  small: 3,
  trivial: 4,
};

function sortTasks(tasks: Task[], sortField: SortField): Task[] {
  if (sortField === "manual") {
    return tasks; // Keep original order
  }

  return [...tasks].sort((a, b) => {
    switch (sortField) {
      case "priority": {
        const aPriority = PRIORITY_ORDER[a.priority ?? ""] ?? 999;
        const bPriority = PRIORITY_ORDER[b.priority ?? ""] ?? 999;
        return aPriority - bPriority;
      }
      case "dueDate": {
        const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return aDate - bDate;
      }
      case "effort": {
        const aEffort = EFFORT_ORDER[(a as any).effort ?? ""] ?? 999;
        const bEffort = EFFORT_ORDER[(b as any).effort ?? ""] ?? 999;
        return aEffort - bEffort;
      }
      case "title": {
        return a.title.localeCompare(b.title);
      }
      default:
        return 0;
    }
  });
}

export const useUiStore = defineStore("ui", () => {
  const boardStore = useBoardStore();

  const filters = ref<FiltersState>({
    query: "",
    tags: [],
    priorities: [],
    assignees: [],
  });

  // Bulk selection state
  const selectedTaskIds = ref<Set<string>>(new Set());
  // Selection mode is implicitly active when any task is selected
  const selectionMode = computed(() => selectedTaskIds.value.size > 0);

  const filterOptions = computed<FilterOptions>(() => {
    const options: FilterOptions = { tags: [], priorities: [], assignees: [] };
    if (!boardStore.board) return options;

    const tags = new Set<string>();
    const assignees = new Set<string>();
    const priorities = new Set<string>();

    boardStore.board.columns.forEach((column) => {
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
    if (!boardStore.board) return [];
    return boardStore.board.columns.map((column) => {
      const filtered = column.tasks.filter((task) => matchesFilter(task, filters.value));
      const sortField = boardStore.columnSortState[column.id] ?? "manual"; // Access from boardStore
      return {
        ...column,
        tasks: sortTasks(filtered, sortField),
      };
    });
  });

  function updateFilters(patch: Partial<FiltersState>) {
    filters.value = { ...filters.value, ...patch };
  }

  function resetFilters() {
    filters.value = { query: "", tags: [], priorities: [], assignees: [] };
  }

  // Selection methods
  function toggleTaskSelection(taskId: string) {
    const newSet = new Set(selectedTaskIds.value);
    if (newSet.has(taskId)) {
      newSet.delete(taskId);
    } else {
      newSet.add(taskId);
    }
    selectedTaskIds.value = newSet;
  }

  function selectAllInColumn(columnId: string) {
    const column = boardStore.board?.columns.find((c) => c.id === columnId);
    if (!column) return;
    const newSet = new Set(selectedTaskIds.value);
    column.tasks.forEach((task) => newSet.add(task.id));
    selectedTaskIds.value = newSet;
  }

  function clearSelection() {
    selectedTaskIds.value = new Set();
  }

  function isTaskSelected(taskId: string): boolean {
    return selectedTaskIds.value.has(taskId);
  }

  return {
    filters,
    selectedTaskIds,
    selectionMode,
    filterOptions,
    filteredColumns,
    updateFilters,
    resetFilters,
    toggleTaskSelection,
    selectAllInColumn,
    clearSelection,
    isTaskSelected,
  };
});
