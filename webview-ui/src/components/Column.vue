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
  <div class="column-section" :class="{ collapsed }" @dragover.prevent @drop="onDrop($event)">
    <div class="column-header" @click="emit('toggle-collapse')">
      <div class="column-header-title">
        <span class="collapse-icon">▼</span>
        <span>{{ column.title }}</span>
      </div>
      <div class="column-header-right">
        <button class="add-task-btn" :data-column-id="column.id" title="Add task" @click.stop="emit('add-task')">+</button>
        <span class="task-count">{{ totalCount }}</span>
      </div>
    </div>

    <div v-if="!collapsed">
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

      <div v-if="tasks.length === 0" class="empty-state">
        No tasks
      </div>
    </div>
  </div>
</template>

<style scoped></style>
