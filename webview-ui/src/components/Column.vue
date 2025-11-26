<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import type { Column, Task } from "@brainfile/core";
import TaskCard from "./TaskCard.vue";
import type { AgentType, DetectedAgent, SortField } from "../types";
import { SORT_OPTIONS } from "../types";
import draggable from "vuedraggable";
import { ArrowUpDown, ChevronDown, Plus } from "lucide-vue-next";
import { useUiStore } from "../store/ui";

const uiStore = useUiStore();

const props = defineProps<{
  column: Column;
  tasks: Task[];
  totalCount: number;
  agents: DetectedAgent[];
  defaultAgent: AgentType | null;
  lastUsedAgent: AgentType | null;
  collapsed: boolean;
  currentSort: SortField;

}>();

// Create a mutable copy for vuedraggable (it needs to mutate arrays for cross-column drag)
const localTasks = computed({
  get: () => [...props.tasks],
  set: () => {
    // Mutations are handled via @change event, not by setting this
  },
});

const sortDropdownOpen = ref(false);
const sortDropdownWrapper = ref<HTMLElement | null>(null);

function handleClickOutside(event: MouseEvent) {
  if (sortDropdownOpen.value && sortDropdownWrapper.value && !sortDropdownWrapper.value.contains(event.target as Node)) {
    sortDropdownOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});

const emit = defineEmits<{
  (e: "toggle-collapse"): void;
  (e: "add-task"): void;
  (e: "set-sort", sortField: SortField): void;
  (e: "edit-task", taskId: string): void;
  (e: "edit-priority", taskId: string): void;
  (e: "delete-task", payload: { columnId: string; taskId: string }): void;
  (e: "archive-task", payload: { columnId: string; taskId: string }): void;
  (e: "complete-task", payload: { columnId: string; taskId: string }): void;
  (e: "open-file", filePath: string): void;
  (e: "toggle-subtask", payload: { taskId: string; subtaskId: string }): void;
  (e: "send-agent", payload: { taskId: string; agentType?: AgentType }): void;
  (e: "move-task", payload: { taskId: string; fromColumnId: string; toColumnId: string; toIndex: number }): void;
  (e: "toggle-select", taskId: string): void;
  (e: "send-task-action", payload: { columnId: string; taskId: string }): void;
}>();

function handleEnd(evt: any) {
  // evt is the native Sortable.js event with from/to DOM elements
  const fromColumnId = evt.from?.dataset?.columnId ?? props.column.id;
  const toColumnId = evt.to?.dataset?.columnId;
  const taskId = evt.item?.dataset?.taskId;
  const toIndex = typeof evt.newIndex === "number" ? evt.newIndex : 0;

  if (!fromColumnId || !toColumnId || !taskId) {
    console.warn("Missing drag data:", { fromColumnId, toColumnId, taskId, evt });
    return;
  }

  emit("move-task", { taskId, fromColumnId, toColumnId, toIndex });
}
</script>

<template>
  <div class="column-section" :class="{ collapsed }">
    <div class="column-header" @click="emit('toggle-collapse')">
      <div class="column-header-title">
        <span class="collapse-icon"><ChevronDown :size="12" :stroke-width="1.75" /></span>
        <span>{{ column.title }}</span>
      </div>
      <div class="column-header-right">
        <div ref="sortDropdownWrapper" class="sort-dropdown-wrapper">
          <button
            class="sort-btn"
            :class="{ active: currentSort !== 'manual' }"
            title="Sort tasks"
            @click.stop="sortDropdownOpen = !sortDropdownOpen"
          >
            <ArrowUpDown :size="14" />
          </button>
          <div v-if="sortDropdownOpen" class="sort-dropdown" @click.stop>
            <button
              v-for="option in SORT_OPTIONS"
              :key="option.field"
              class="sort-option"
              :class="{ selected: currentSort === option.field }"
              @click="emit('set-sort', option.field); sortDropdownOpen = false"
            >
              <span class="sort-option-label">{{ option.label }}</span>
              <span v-if="option.indicator" class="sort-option-indicator">{{ option.indicator }}</span>
            </button>
          </div>
        </div>
        <button class="add-task-btn" :data-column-id="column.id" title="Add task" @click.stop="emit('add-task')">
          <Plus :size="14" />
        </button>
        <span class="task-count">{{ totalCount }}</span>
      </div>
    </div>

    <div v-if="!collapsed">
      <draggable
        v-model="localTasks"
        item-key="id"
        group="tasks"
        :data-column-id="column.id"
        :animation="150"
        handle=".drag-handle"
        @end="handleEnd"
      >
        <template #item="{ element }">
          <div class="task-wrapper" :data-task-id="element.id">
            <TaskCard
              :task="element"
              :column-id="column.id"
              :agents="agents"
              :default-agent="defaultAgent"
              :last-used-agent="lastUsedAgent"
              :selection-mode="uiStore.selectionMode"
              :selected="uiStore.selectedTaskIds.has(element.id)"
              @edit="emit('edit-task', element.id)"
              @edit-priority="emit('edit-priority', element.id)"
              @delete="emit('delete-task', { columnId: column.id, taskId: element.id })"
              @archive="emit('archive-task', { columnId: column.id, taskId: element.id })"
              @complete="emit('complete-task', { columnId: column.id, taskId: element.id })"
              @open-file="emit('open-file', $event)"
              @toggle-subtask="emit('toggle-subtask', { taskId: element.id, subtaskId: $event })"
              @send-agent="emit('send-agent', { taskId: element.id, agentType: $event })"
              @toggle-select="emit('toggle-select', element.id)"
              @send-task-action="emit('send-task-action', { columnId: column.id, taskId: element.id })"
            />
          </div>
        </template>
      </draggable>

      <div v-if="localTasks.length === 0" class="empty-state">
        No tasks
      </div>
    </div>
  </div>
</template>

<style scoped>
.sort-dropdown-wrapper {
  position: relative;
  z-index: 10;
}

.sort-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  transition: all 0.15s;
}

.sort-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
}

.sort-btn.active {
  color: var(--vscode-focusBorder);
}

.sort-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 9999;
  min-width: 120px;
  margin-top: 4px;
  padding: 4px 0;
  background: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.sort-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--vscode-dropdown-foreground);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
}

.sort-option:hover {
  background: var(--vscode-list-hoverBackground);
}

.sort-option.selected {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

.sort-option-label {
  flex: 1;
}

.sort-option-indicator {
  margin-left: 8px;
  opacity: 0.7;
  font-size: 11px;
}
</style>
