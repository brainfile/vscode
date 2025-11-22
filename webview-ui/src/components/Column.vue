<script setup lang="ts">
import type { Column, Task } from "@brainfile/core";
import { useBoardStore } from "../store/board";
import TaskCard from "./TaskCard.vue";
import type { AgentType, DetectedAgent } from "../types";

const props = defineProps<{
  column: Column;
  tasks: Task[];
  totalCount: number;
  agents: DetectedAgent[];
  defaultAgent: AgentType | null;
  lastUsedAgent: AgentType | null;
  collapsed: boolean;
}>();

const emit = defineEmits<{
  (e: "toggle-collapse"): void;
  (e: "add-task"): void;
  (e: "edit-task", taskId: string): void;
  (e: "edit-priority", taskId: string): void;
  (e: "delete-task", payload: { columnId: string; taskId: string }): void;
  (e: "archive-task", payload: { columnId: string; taskId: string }): void;
  (e: "complete-task", payload: { columnId: string; taskId: string }): void;
  (e: "open-file", filePath: string): void;
  (e: "toggle-subtask", payload: { taskId: string; subtaskId: string }): void;
  (e: "send-agent", payload: { taskId: string; agentType?: AgentType }): void;
  (e: "move-task", payload: { taskId: string; fromColumnId: string; toColumnId: string; toIndex: number }): void;
}>();

const store = useBoardStore();

function getDropIndex(targetTaskId?: string) {
  const column = store.board?.columns.find((col) => col.id === props.column.id);
  if (!column) return 0;
  if (!targetTaskId) return column.tasks.length;
  const idx = column.tasks.findIndex((task) => task.id === targetTaskId);
  return idx === -1 ? column.tasks.length : idx;
}

function onDrop(event: DragEvent, targetTaskId?: string) {
  event.preventDefault();
  const raw = event.dataTransfer?.getData("application/json");
  if (!raw) return;

  try {
    const payload = JSON.parse(raw) as { taskId: string; fromColumnId: string };
    let toIndex = getDropIndex(targetTaskId);
    const fromIndex = store.getTaskIndex(payload.fromColumnId, payload.taskId);
    if (payload.fromColumnId === props.column.id && fromIndex !== -1 && fromIndex < toIndex) {
      toIndex -= 1;
    }

    emit("move-task", {
      taskId: payload.taskId,
      fromColumnId: payload.fromColumnId,
      toColumnId: props.column.id,
      toIndex,
    });
  } catch {
    // ignore malformed drag payload
  }
}
</script>

<template>
  <article class="column" :class="{ collapsed }" @dragover.prevent @drop="onDrop($event)">
    <header class="column__header" @click="emit('toggle-collapse')">
      <div class="title">
        <span class="chevron">{{ collapsed ? "▸" : "▾" }}</span>
        <span>{{ column.title }}</span>
      </div>
      <div class="meta">
        <span class="count">{{ totalCount }}</span>
        <button class="icon" title="Add task" @click.stop="emit('add-task')">＋</button>
      </div>
    </header>

    <div v-show="!collapsed" class="tasks">
      <div
        v-for="task in tasks"
        :key="task.id"
        class="task-wrapper"
        @dragover.prevent
        @drop="onDrop($event, task.id)"
      >
        <TaskCard
          :task="task"
          :column-id="column.id"
          :agents="agents"
          :default-agent="defaultAgent"
          :last-used-agent="lastUsedAgent"
          @edit="emit('edit-task', task.id)"
          @edit-priority="emit('edit-priority', task.id)"
          @delete="emit('delete-task', { columnId: column.id, taskId: task.id })"
          @archive="emit('archive-task', { columnId: column.id, taskId: task.id })"
          @complete="emit('complete-task', { columnId: column.id, taskId: task.id })"
          @open-file="emit('open-file', $event)"
          @toggle-subtask="emit('toggle-subtask', { taskId: task.id, subtaskId: $event })"
          @send-agent="emit('send-agent', { taskId: task.id, agentType: $event })"
        />
      </div>

      <div v-if="tasks.length === 0" class="empty">
        <p>No tasks in this column.</p>
      </div>
    </div>
  </article>
</template>

<style scoped>
.column {
  border-bottom: 1px solid var(--vscode-panel-border);
}

.column__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  padding: 10px 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--vscode-editor-foreground);
  opacity: 0.9;
}

.column__header:hover {
  background: var(--vscode-list-hoverBackground);
}

.title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  color: #f6f7fb;
}

.chevron {
  font-size: 12px;
  opacity: 0.7;
}

.meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.count {
  font-size: 11px;
  opacity: 0.8;
  font-family: 'JetBrains Mono', monospace;
}

.icon {
  border: none;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
}

.column__header:hover .icon {
  opacity: 0.7;
}

.icon:hover {
  background: var(--vscode-toolbar-hoverBackground);
  opacity: 1 !important;
}

.tasks {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 8px;
}

.task-wrapper {
  border-radius: 6px;
}

.empty {
  color: #9ba3b4;
  padding: 10px;
  text-align: center;
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}
</style>
