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
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px;
  border-left: 4px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
}

.task:hover {
  border-color: rgba(90, 200, 255, 0.35);
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.25);
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
  opacity: 0.6;
}

.task-id {
  margin: 0;
  color: #9ba3b4;
  font-size: 12px;
  cursor: pointer;
}

.task-id .copied {
  margin-left: 6px;
  color: #9ef5c0;
}

h3 {
  margin: 2px 0 0;
  font-size: 16px;
  color: #f6f7fb;
}

.actions {
  display: inline-flex;
  gap: 6px;
}

.actions .ghost {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: #dce2f2;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
}

.actions .danger {
  border-color: rgba(255, 99, 132, 0.5);
  color: #ff9aa8;
}

.metadata {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pill {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 4px 10px;
  font-size: 12px;
}

.pill.muted {
  color: #c9cfde;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.description :deep(p) {
  margin: 0 0 6px;
  color: #cfd6e6;
}

.description :deep(code) {
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 6px;
}

.label {
  color: #9ba3b4;
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
  border-radius: 8px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.03);
}

.subtasks li.done {
  text-decoration: line-through;
  color: #9ba3b4;
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
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: #dce2f2;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
}

.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.agent-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.primary {
  background: linear-gradient(120deg, #5ac8ff, #9ef5c0);
  color: #0d1117;
  border: none;
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
}

select {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #f6f7fb;
  padding: 8px 10px;
  border-radius: 10px;
}
</style>
