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
</script>

<template>
<div
  class="task"
  :class="priorityClass"
  draggable="true"
  @dragstart="onDragStart"
  @click="expanded = !expanded"
>
    <div class="task__header">
      <div class="title">
        <span class="handle">⋮⋮</span>
        <div>
          <p class="task-id" @click.stop="copyTaskId">
            {{ task.id }}
            <span v-if="copied" class="copied">copied</span>
          </p>
          <h3>{{ task.title }}</h3>
        </div>
      </div>
      <div class="actions">
        <button class="ghost" title="Edit" @click.stop="emit('edit')">✏️</button>
        <button
          class="ghost task-priority-label"
          :class="priorityClass"
          :title="task.priority ? `Priority ${task.priority}` : 'Set priority'"
          @click.stop="emit('edit-priority')"
        >
          {{ task.priority ? task.priority.toUpperCase() : "PRIORITY" }}
        </button>
        <button
          class="ghost"
          title="Complete"
          @click.stop="emit('complete')"
        >
          ✓
        </button>
        <button class="ghost" title="Archive" @click.stop="emit('archive')">⬇</button>
        <button class="ghost danger" title="Delete" @click.stop="emit('delete')">✖</button>
      </div>
    </div>

    <div class="metadata">
      <span v-if="task.assignee" class="pill muted">👤 {{ task.assignee }}</span>
      <span
        v-for="tag in task.tags ?? []"
        :key="tag"
        class="pill"
      >
        #{{ tag }}
      </span>
    </div>

    <div v-show="expanded" class="body">
      <div class="description" v-html="descriptionHtml"></div>

      <div v-if="task.subtasks?.length" class="subtasks">
        <p class="label">Subtasks</p>
        <ul>
          <li
            v-for="subtask in task.subtasks"
            :key="subtask.id"
            :class="{ done: subtask.completed }"
            @click.stop="emit('toggle-subtask', subtask.id)"
          >
            <span class="checkbox">{{ subtask.completed ? "☑" : "☐" }}</span>
            {{ subtask.title }}
          </li>
        </ul>
      </div>

      <div v-if="task.relatedFiles?.length" class="related">
        <p class="label">Related files</p>
        <div class="files">
          <button
            v-for="file in task.relatedFiles"
            :key="file"
            class="file"
            @click.stop="emit('open-file', file)"
          >
            📄 {{ file }}
          </button>
        </div>
      </div>
    </div>

    <div class="footer">
      <div class="agent">
        <span class="label">Send to agent</span>
        <div class="agent-actions">
          <button class="primary" @click.stop="emit('send-agent', primaryAgent)">
            ▶ {{ primaryAgent }}
          </button>
          <select
            :value="primaryAgent"
            @click.stop
            @change="emit('send-agent', ($event.target as HTMLSelectElement).value as AgentType)"
          >
            <option
              v-for="agent in agents"
              :key="agent.type"
              :value="agent.type"
              :disabled="!agent.available"
            >
              {{ agent.label }} {{ agent.available ? "" : "(missing)" }}
            </option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task {
  background: transparent;
  border: none;
  border-left: 3px solid transparent;
  padding: 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.task:hover {
  background: var(--vscode-list-hoverBackground);
}

.task__header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.title {
  display: flex;
  gap: 10px;
  align-items: center;
}

.handle {
  cursor: grab;
  opacity: 0;
  color: var(--vscode-descriptionForeground);
  transition: opacity 0.15s;
}

.task:hover .handle {
  opacity: 0.5;
}

.task-id {
  margin: 0;
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  cursor: pointer;
  opacity: 0.6;
}

.task-id .copied {
  margin-left: 6px;
  color: var(--vscode-testing-iconPassed);
}

h3 {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--vscode-editor-foreground);
  letter-spacing: -0.01em;
}

.actions {
  display: inline-flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.15s;
}

.task:hover .actions {
  opacity: 1;
}

.actions .ghost {
  border: none;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
}

.actions .danger {
  color: var(--vscode-inputValidation-errorForeground);
}

.metadata {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pill {
  background: none;
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
}

.pill.muted {
  color: var(--vscode-descriptionForeground);
  opacity: 0.7;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.description :deep(p) {
  margin: 0 0 6px;
  color: var(--vscode-descriptionForeground);
}

.description :deep(code) {
  background: var(--vscode-textCodeBlock-background);
  padding: 2px 6px;
  border-radius: 4px;
}

.label {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  margin-bottom: 4px;
}

.subtasks ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.subtasks li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border-radius: 6px;
  cursor: pointer;
  background: var(--vscode-sideBar-background);
}

.subtasks li.done {
  text-decoration: line-through;
  color: var(--vscode-descriptionForeground);
}

.checkbox {
  opacity: 0.8;
}

.related .files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.file {
  border: 1px solid var(--vscode-panel-border);
  background: var(--vscode-input-background);
  color: var(--vscode-textLink-foreground);
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
}

.agent-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
}

select {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  color: var(--vscode-input-foreground);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
}

.task.priority-critical { border-left-color: #ffffff; }
.task.priority-high { border-left-color: rgba(255, 255, 255, 0.8); }
.task.priority-medium { border-left-color: rgba(255, 255, 255, 0.5); }
.task.priority-low { border-left-color: rgba(255, 255, 255, 0.2); }

.task-priority-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.15s;
  color: var(--vscode-descriptionForeground);
  opacity: 0.6;
}

.task-priority-label:hover {
  opacity: 1;
  background: var(--vscode-toolbar-hoverBackground);
}
</style>
