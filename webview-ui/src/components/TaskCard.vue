<script setup lang="ts">
import type { Task } from "@brainfile/core";
import { computed, ref } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { AgentType, DetectedAgent } from "../types";

const props = defineProps<{
  task: Task;
  columnId: string;
  agents: DetectedAgent[];
  defaultAgent: AgentType | null;
  lastUsedAgent: AgentType | null;
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
}>();

const expanded = ref(false);
const copied = ref(false);

marked.setOptions({ breaks: true });

const descriptionHtml = computed(() => {
  const raw = props.task.description ?? "";
  const parsed = marked.parse(raw);
  const html = typeof parsed === "string" ? parsed : "";
  return DOMPurify.sanitize(html);
});

const primaryAgent = computed<AgentType>(() => {
  return (
    props.lastUsedAgent ||
    props.defaultAgent ||
    props.agents.find((a) => a.available && a.type !== "copy")?.type ||
    "copy"
  );
});

const priorityClass = computed(() =>
  props.task.priority ? `priority-${props.task.priority}` : ""
);

const dropdownOpen = ref(false);

function onDragStart(event: DragEvent) {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) return;

  dataTransfer.setData(
    "application/json",
    JSON.stringify({ taskId: props.task.id, fromColumnId: props.columnId })
  );
  dataTransfer.setData("text/plain", props.task.id);
  dataTransfer.effectAllowed = "move";
}

async function copyTaskId() {
  try {
    await navigator.clipboard.writeText(props.task.id);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    copied.value = false;
  }
}

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value;
}

function selectAgent(agent: AgentType) {
  dropdownOpen.value = false;
  emit("send-agent", agent);
}
</script>

<template>
  <div
    class="task"
    :class="priorityClass"
    draggable="true"
    :data-task-id="task.id"
    :data-column-id="columnId"
    :data-priority="task.priority || ''"
    :data-assignee="task.assignee || ''"
    :data-tags="task.tags ? JSON.stringify(task.tags) : '[]'"
    @dragstart="onDragStart"
    @click="expanded = !expanded"
  >
    <div class="task-header">
      <span class="drag-handle">⋮⋮</span>
      <div class="task-title">{{ task.title }}</div>
      <div class="task-id" :data-task-id="task.id" title="Click to copy" @click.stop="copyTaskId">
        {{ task.id }}
      </div>
      <div class="task-actions">
        <button class="task-action edit" data-action="edit" title="Edit" @click.stop="emit('edit')">✎</button>
        <button
          v-if="columnId === 'done'"
          class="task-action archive"
          data-action="archive"
          title="Archive"
          @click.stop="emit('archive')"
        >
          ⬇
        </button>
        <button
          v-else
          class="task-action complete"
          data-action="complete"
          title="Mark as done"
          @click.stop="emit('complete')"
        >
          ✓
        </button>
        <button class="task-action delete" data-action="delete" title="Delete" @click.stop="emit('delete')">×</button>
        <div class="agent-split-btn">
          <button class="agent-primary" data-action="send-agent-default" title="Send to agent" @click.stop="emit('send-agent', primaryAgent)">▷</button>
          <button class="agent-dropdown-toggle" data-action="agent-dropdown" title="Choose agent" @click.stop="toggleDropdown">▾</button>
          <div class="agent-dropdown-menu" v-show="dropdownOpen">
            <button
              v-for="agent in agents"
              :key="agent.type"
              class="agent-option"
              :data-agent="agent.type"
              :data-unavailable="!agent.available"
              :disabled="!agent.available"
              @click.stop="selectAgent(agent.type)"
            >
              {{ agent.label }}
            </button>
            <div class="agent-divider"></div>
            <button class="agent-option" data-agent="copy" @click.stop="selectAgent('copy')">Copy prompt</button>
          </div>
        </div>
      </div>
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
        📄 {{ file }}
      </div>
    </div>
  </div>
</template>

<style scoped></style>
