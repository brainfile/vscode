<script setup lang="ts">
import type { Task } from "@brainfile/core";
import { computed, ref, onMounted, onUnmounted } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  GripVertical,
  MoreVertical,
  Play,
  Copy,
  Pencil,
  Tag,
  Archive,
  Check,
  Trash2,
  FileText,
} from "lucide-vue-next";
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
const menuOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);

marked.setOptions({ breaks: true });

const descriptionHtml = computed(() => {
  const raw = props.task.description ?? "";
  const parsed = marked.parse(raw);
  const html = typeof parsed === "string" ? parsed : "";
  return DOMPurify.sanitize(html);
});

// Filter to only available agents (excluding copy which is always shown separately)
const availableAgents = computed(() =>
  props.agents.filter((a) => a.available && a.type !== "copy")
);

const priorityClass = computed(() =>
  props.task.priority ? `priority-${props.task.priority}` : ""
);

async function copyTaskId() {
  try {
    await navigator.clipboard.writeText(props.task.id);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    copied.value = false;
  }
}

function toggleMenu(event: Event) {
  event.stopPropagation();
  menuOpen.value = !menuOpen.value;
}

function closeMenu() {
  menuOpen.value = false;
}

function handleAction(action: string, event: Event) {
  event.stopPropagation();
  closeMenu();

  switch (action) {
    case "edit":
      emit("edit");
      break;
    case "edit-priority":
      emit("edit-priority");
      break;
    case "complete":
      emit("complete");
      break;
    case "archive":
      emit("archive");
      break;
    case "delete":
      emit("delete");
      break;
  }
}

function handleAgentAction(agentType: AgentType, event: Event) {
  event.stopPropagation();
  closeMenu();
  emit("send-agent", agentType);
}

// Close menu when clicking outside
function handleClickOutside(event: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    closeMenu();
  }
}

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});
</script>

<template>
  <div
    class="task"
    :class="[priorityClass, { expanded }]"
    @click="expanded = !expanded"
    :data-task-id="task.id"
    :data-column-id="columnId"
    :data-priority="task.priority || ''"
    :data-assignee="task.assignee || ''"
    :data-tags="task.tags ? JSON.stringify(task.tags) : '[]'"
  >
    <div class="task-header">
      <span class="drag-handle"><GripVertical :size="14" /></span>
      <div class="task-title">{{ task.title }}</div>
      <div class="task-id" :data-task-id="task.id" title="Click to copy" @click.stop="copyTaskId">
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
          <Archive :size="14" />
        </button>
        <button
          v-else
          class="quick-action-btn"
          title="Mark complete"
          @click.stop="emit('complete')"
        >
          <Check :size="14" />
        </button>
        <button
          class="quick-action-btn"
          title="Send to agent"
          @click.stop="emit('send-agent')"
        >
          <Play :size="14" />
        </button>
      </div>
      <!-- Kebab menu (overflow) -->
      <div class="task-menu" ref="menuRef">
        <button class="task-menu-trigger" title="Actions" @click="toggleMenu">
          <MoreVertical :size="16" />
        </button>
        <div class="task-menu-dropdown" v-show="menuOpen">
          <!-- Agent actions -->
          <div class="menu-section" v-if="availableAgents.length > 0">
            <div class="menu-section-label">Send to Agent</div>
            <button
              v-for="agent in availableAgents"
              :key="agent.type"
              class="menu-item"
              @click="handleAgentAction(agent.type, $event)"
            >
              <Play :size="14" class="menu-icon" />
              {{ agent.label }}
            </button>
          </div>
          <button class="menu-item" @click="handleAgentAction('copy', $event)">
            <Copy :size="14" class="menu-icon" />
            Copy prompt
          </button>
          <div class="menu-divider"></div>
          <!-- Edit actions -->
          <button class="menu-item" @click="handleAction('edit', $event)">
            <Pencil :size="14" class="menu-icon" />
            Edit in file
          </button>
          <button class="menu-item" @click="handleAction('edit-priority', $event)">
            <Tag :size="14" class="menu-icon" />
            Change priority
          </button>
          <div class="menu-divider"></div>
          <!-- State actions -->
          <button
            v-if="columnId === 'done'"
            class="menu-item"
            @click="handleAction('archive', $event)"
          >
            <Archive :size="14" class="menu-icon" />
            Archive
          </button>
          <button
            v-else
            class="menu-item"
            @click="handleAction('complete', $event)"
          >
            <Check :size="14" class="menu-icon" />
            Mark complete
          </button>
          <div class="menu-divider"></div>
          <!-- Destructive -->
          <button class="menu-item menu-item-danger" @click="handleAction('delete', $event)">
            <Trash2 :size="14" class="menu-icon" />
            Delete
          </button>
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
        <FileText :size="12" class="related-file-icon" />
        {{ file }}
      </div>
    </div>
  </div>
</template>

<style scoped></style>
