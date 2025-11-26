<script setup lang="ts">
import { computed } from "vue";
import type { Column, Task } from "@brainfile/core";
import TaskCard from "./TaskCard.vue";
import type { AgentType, DetectedAgent, SortField } from "../types";
import { SORT_OPTIONS } from "../types";
import draggable from "vuedraggable";
import { ChevronDown, Plus } from "lucide-vue-next";
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
  (e: "update-title", payload: { taskId: string; title: string }): void;
}>();

// Selection state for column
const allSelected = computed(() => {
  if (props.tasks.length === 0) return false;
  return props.tasks.every(t => uiStore.selectedTaskIds.has(t.id));
});

const someSelected = computed(() => {
  if (props.tasks.length === 0) return false;
  const selectedCount = props.tasks.filter(t => uiStore.selectedTaskIds.has(t.id)).length;
  return selectedCount > 0 && selectedCount < props.tasks.length;
});

function toggleSelectAll() {
  if (allSelected.value) {
    // Deselect all in this column
    props.tasks.forEach(t => {
      if (uiStore.selectedTaskIds.has(t.id)) {
        uiStore.toggleTaskSelection(t.id);
      }
    });
  } else {
    // Select all in this column
    props.tasks.forEach(t => {
      if (!uiStore.selectedTaskIds.has(t.id)) {
        uiStore.toggleTaskSelection(t.id);
      }
    });
  }
}

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
        <!-- Select all checkbox in selection mode -->
        <label v-if="uiStore.selectionMode && tasks.length > 0" class="column-select-all" @click.stop>
          <input
            type="checkbox"
            :checked="allSelected"
            :indeterminate="someSelected"
            @change="toggleSelectAll"
          />
          <span class="checkmark" :class="{ indeterminate: someSelected }"></span>
        </label>
        <span class="collapse-icon"><ChevronDown :size="12" :stroke-width="1.75" /></span>
        <span>{{ column.title }}</span>
      </div>
      <div class="column-header-right">
        <!-- Inline sort toggles -->
        <div class="sort-toggles" @click.stop>
          <button
            v-for="option in SORT_OPTIONS"
            :key="option.field"
            class="sort-toggle"
            :class="{ active: currentSort === option.field }"
            :title="`Sort by ${option.label}`"
            @click="emit('set-sort', option.field)"
          >
            {{ option.field === 'manual' ? '⋮⋮' : option.field === 'priority' ? 'P' : option.field === 'dueDate' ? 'D' : option.field === 'effort' ? 'E' : 'Az' }}
          </button>
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
              @update-title="emit('update-title', { taskId: element.id, title: $event })"
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
/* Inline sort toggles */
.sort-toggles {
  display: flex;
  gap: 2px;
  margin-right: 4px;
}

.sort-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 4px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.1s;
  opacity: 0.6;
}

.sort-toggle:hover {
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
  opacity: 1;
}

.sort-toggle.active {
  background: var(--vscode-focusBorder);
  color: var(--vscode-editor-background);
  opacity: 1;
}

/* Column select all checkbox */
.column-select-all {
  display: flex;
  align-items: center;
  cursor: pointer;
  margin-right: 4px;
}

.column-select-all input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
}

.column-select-all .checkmark {
  width: 14px;
  height: 14px;
  border: 1px solid var(--vscode-checkbox-border);
  border-radius: 3px;
  background: var(--vscode-checkbox-background);
  display: flex;
  align-items: center;
  justify-content: center;
}

.column-select-all input:checked ~ .checkmark {
  background: var(--vscode-checkbox-selectBackground, var(--vscode-focusBorder));
  border-color: var(--vscode-checkbox-selectBackground, var(--vscode-focusBorder));
}

.column-select-all input:checked ~ .checkmark::after {
  content: '';
  width: 4px;
  height: 8px;
  border: solid var(--vscode-checkbox-foreground, #fff);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  margin-bottom: 2px;
}

.column-select-all .checkmark.indeterminate {
  background: var(--vscode-checkbox-selectBackground, var(--vscode-focusBorder));
  border-color: var(--vscode-checkbox-selectBackground, var(--vscode-focusBorder));
}

.column-select-all .checkmark.indeterminate::after {
  content: '';
  width: 8px;
  height: 2px;
  background: var(--vscode-checkbox-foreground, #fff);
}
</style>
