<script setup lang="ts">
import type { Task } from "@brainfile/core";
import { computed, ref } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  GripVertical,
  MoreVertical,
  Play,
  Archive,
  Check,
  FileText,
} from "lucide-vue-next";
import type { AgentType, DetectedAgent } from "../types";

const props = defineProps<{
  task: Task;
  columnId: string;
  agents: DetectedAgent[];
  defaultAgent: AgentType | null;
  lastUsedAgent: AgentType | null;
  selectionMode?: boolean;
  selected?: boolean;
}>();

const emit = defineEmits<{
  (e: "edit"): void;
  (e: "edit-priority"): void;
  (e: "delete"): void;
  (e: "archive"): void;
  (e: "complete"): void;
  (e: "open-file", file: string): void;
  (e: "toggle-subtask", subtaskId: string): void;
  (e: "send-agent", agentType?: AgentType): void;
  (e: "sendTaskAction"): void;
  (e: "toggle-select"): void;
}>();

const expanded = ref(false);


// Platform-aware selection hint
const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
const selectHint = isMac ? "⌘+click to select" : "Ctrl+click to select";

marked.setOptions({ breaks: true });

// Handle task click - Cmd/Ctrl+click toggles selection, normal click expands
function handleTaskClick(event: MouseEvent) {
  if (event.metaKey || event.ctrlKey) {
    // Cmd/Ctrl+click = toggle selection
    emit("toggle-select");
  } else {
    // Normal click = expand/collapse
    expanded.value = !expanded.value;
  }
}

const descriptionHtml = computed(() => {
  const raw = props.task.description ?? "";
  const parsed = marked.parse(raw);
  const html = typeof parsed === "string" ? parsed : "";
  return DOMPurify.sanitize(html);
});

const priorityClass = computed(() =>
  props.task.priority ? `priority-${props.task.priority}` : ""
);




</script>

<template>
  <div
    class="task"
    :class="[priorityClass, { expanded, selected: selected }]"
    @click="handleTaskClick"
    :data-task-id="task.id"
    :data-column-id="columnId"
    :data-priority="task.priority || ''"
    :data-assignee="task.assignee || ''"
    :data-tags="task.tags ? JSON.stringify(task.tags) : '[]'"
  >
    <div class="task-header">
      <!-- In selection mode: show checkbox. Otherwise: show drag handle -->
      <label v-if="selectionMode" class="select-checkbox" @click.stop>
        <input
          type="checkbox"
          :checked="selected"
          @change="emit('toggle-select')"
        />
        <span class="checkmark"></span>
      </label>
      <span v-else class="drag-handle" :title="selectHint"><GripVertical :size="14" :stroke-width="1.75" /></span>
      <div class="task-title">{{ task.title }}</div>
      <div class="task-id" :data-task-id="task.id">
        {{ task.id }}
      </div>
      <!-- Quick actions -->
      <div class="quick-actions">
        <button
          v-if="columnId === 'done'"
          class="quick-action-btn"
          title="Archive"
          @click.stop="emit('archive')"
        >
          <Archive :size="14" :stroke-width="1.75" />
        </button>
        <button
          v-else
          class="quick-action-btn"
          title="Mark complete"
          @click.stop="emit('complete')"
        >
          <Check :size="14" :stroke-width="1.75" />
        </button>
        <button
          class="quick-action-btn"
          title="Send to agent"
          @click.stop="emit('send-agent')"
        >
          <Play :size="14" :stroke-width="1.75" />
        </button>
      </div>
      <!-- Kebab menu (overflow) -->
      <button class="quick-action-btn" title="More actions" @click.stop="emit('sendTaskAction')">
        <MoreVertical :size="16" :stroke-width="1.75" />
      </button>
    </div>

    <div class="task-description" v-html="descriptionHtml"></div>

    <div v-if="task.priority || task.assignee || (task.tags && task.tags.length > 0)" class="task-metadata">
      <span
        v-if="task.priority"
        class="task-priority-label"
        :class="priorityClass"
        :data-task-id="task.id"
        title="Click to change priority"
        @click.stop="emit('edit-priority')"
      >
        {{ task.priority.toUpperCase() }}
      </span>
      <span v-if="task.assignee" class="task-assignee">{{ task.assignee }}</span>
      <span v-for="tag in task.tags ?? []" :key="tag" class="task-tag">{{ tag }}</span>
    </div>

    <div v-if="task.subtasks?.length" class="subtasks-container">
      <div class="subtask-progress">
        <div class="subtask-progress-bar">
          <div
            class="subtask-progress-fill"
            :style="{ width: `${Math.round((task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100)}%` }"
          ></div>
        </div>
        <span class="subtask-count">{{ task.subtasks.filter(s => s.completed).length }}/{{ task.subtasks.length }}</span>
      </div>
      <ul class="subtask-list">
        <li
          v-for="subtask in task.subtasks"
          :key="subtask.id"
          class="subtask-item"
          :class="{ completed: subtask.completed }"
          :data-task-id="task.id"
          :data-subtask-id="subtask.id"
          @click.stop="emit('toggle-subtask', subtask.id)"
        >
          <div class="subtask-checkbox"></div>
          <span class="subtask-title">{{ subtask.title }}</span>
        </li>
      </ul>
    </div>

    <div v-if="task.relatedFiles?.length" class="task-related-files">
      <div
        v-for="file in task.relatedFiles"
        :key="file"
        class="related-file"
        :data-file="file"
        @click.stop="emit('open-file', file)"
      >
        <FileText :size="12" class="related-file-icon" :stroke-width="1.75" />
        {{ file }}
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Selection checkbox - replaces drag handle in selection mode */
.select-checkbox {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 2px;
}

.select-checkbox input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
}

.select-checkbox .checkmark {
  width: 14px;
  height: 14px;
  border: 1px solid var(--vscode-checkbox-border);
  border-radius: 3px;
  background: var(--vscode-checkbox-background);
  display: flex;
  align-items: center;
  justify-content: center;
}

.select-checkbox input:checked ~ .checkmark {
  background: var(--vscode-checkbox-selectBackground, var(--vscode-focusBorder));
  border-color: var(--vscode-checkbox-selectBackground, var(--vscode-focusBorder));
}

.select-checkbox input:checked ~ .checkmark::after {
  content: '';
  width: 4px;
  height: 8px;
  border: solid var(--vscode-checkbox-foreground, #fff);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  margin-bottom: 2px;
}

.task.selected {
  background: var(--vscode-list-activeSelectionBackground);
  border-color: var(--vscode-focusBorder);
}
</style>
