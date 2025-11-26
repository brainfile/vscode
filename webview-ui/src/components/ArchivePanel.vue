<script setup lang="ts">
import type { Task } from "@brainfile/core";
import { FileText, ChevronDown, RotateCcw, Trash2, Search, X } from "lucide-vue-next";
import { ref, computed } from "vue";
import ConfirmDialog from "./ConfirmDialog.vue";

const props = defineProps<{
  tasks: Task[];
}>();

const emit = defineEmits<{
  (e: "open-file", file: string): void;
  (e: "restore", taskId: string): void;
  (e: "delete-permanently", taskId: string): void;
}>();

const expandedTasks = ref<Set<string>>(new Set());
const searchQuery = ref("");
const deleteTaskId = ref<string | null>(null);
const deleteTaskTitle = ref("");

function toggleExpand(taskId: string) {
  if (expandedTasks.value.has(taskId)) {
    expandedTasks.value.delete(taskId);
  } else {
    expandedTasks.value.add(taskId);
  }
}

function isExpanded(taskId: string) {
  return expandedTasks.value.has(taskId);
}

// Filter tasks by search query
const filteredTasks = computed(() => {
  if (!searchQuery.value.trim()) return props.tasks;
  const query = searchQuery.value.toLowerCase();
  return props.tasks.filter(t =>
    t.title.toLowerCase().includes(query) ||
    t.description?.toLowerCase().includes(query) ||
    t.id.toLowerCase().includes(query)
  );
});

const taskCount = computed(() => props.tasks.length);
const filteredCount = computed(() => filteredTasks.value.length);

function requestDelete(taskId: string, title: string) {
  deleteTaskId.value = taskId;
  deleteTaskTitle.value = title;
}

function confirmDelete() {
  if (deleteTaskId.value) {
    emit("delete-permanently", deleteTaskId.value);
    deleteTaskId.value = null;
    deleteTaskTitle.value = "";
  }
}

function cancelDelete() {
  deleteTaskId.value = null;
  deleteTaskTitle.value = "";
}
</script>

<template>
  <div>
    <header class="section-header">
      <span class="section-title">Archived</span>
      <span class="count">{{ taskCount }}</span>
    </header>

    <!-- Search input -->
    <div v-if="taskCount > 0" class="archive-search">
      <Search class="search-icon" :size="14" />
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="Search archive..."
      />
      <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">
        <X :size="12" />
      </button>
    </div>

    <div v-if="searchQuery && filteredCount !== taskCount" class="filter-info">
      Showing {{ filteredCount }} of {{ taskCount }}
    </div>

    <div v-if="tasks.length === 0" class="empty-state">
      No archived tasks
    </div>

    <div v-else-if="filteredTasks.length === 0" class="empty-state">
      No matching archived tasks
    </div>

    <ul v-else class="list-none">
      <li
        v-for="task in filteredTasks"
        :key="task.id"
        class="border-b"
      >
        <div
          class="list-item cursor-pointer select-none"
          @click="toggleExpand(task.id)"
        >
          <span class="collapse-icon" :class="{ collapsed: !isExpanded(task.id) }">
            <ChevronDown :size="12" />
          </span>
          <span class="id-badge">#{{ task.id }}</span>
          <span class="archive-title">{{ task.title }}</span>

          <!-- Quick actions -->
          <div class="archive-actions">
            <button
              class="action-btn restore"
              title="Restore to To Do"
              @click.stop="emit('restore', task.id)"
            >
              <RotateCcw :size="14" />
            </button>
            <button
              class="action-btn delete"
              title="Delete permanently"
              @click.stop="requestDelete(task.id, task.title)"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </div>

        <div v-if="isExpanded(task.id)" class="archive-content">
          <p v-if="task.description" class="archive-desc">{{ task.description }}</p>
          <div v-if="task.relatedFiles?.length" class="flex flex-col gap-2">
            <button
              v-for="file in task.relatedFiles"
              :key="file"
              class="file-link"
              :aria-label="`Open ${file}`"
              @click.stop="emit('open-file', file)"
            >
              <FileText :size="12" />
              <span>{{ file }}</span>
            </button>
          </div>
        </div>
      </li>
    </ul>

    <ConfirmDialog
      :visible="deleteTaskId !== null"
      title="Delete Permanently"
      :message="`Are you sure you want to permanently delete '${deleteTaskTitle}'? This cannot be undone.`"
      confirm-text="Delete"
      :danger="true"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </div>
</template>

<style scoped>
.collapse-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--c-text-muted);
  opacity: var(--opacity-muted);
  transition: transform var(--transition-slow);
}

.collapse-icon.collapsed {
  transform: rotate(-90deg);
}

.archive-title {
  flex: 1;
  font-size: var(--text-sm);
  color: var(--c-text);
  opacity: 0.85;
}

.archive-content {
  padding: 0 var(--space-8) var(--space-6) 36px;
}

.archive-desc {
  margin: 0 0 var(--space-4);
  font-size: var(--text-xs);
  color: var(--c-text-muted);
  line-height: var(--leading-normal);
  white-space: pre-wrap;
}

/* Archive search */
.archive-search {
  position: relative;
  margin-bottom: var(--space-4);
}

.archive-search .search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--c-text-muted);
  opacity: 0.6;
  pointer-events: none;
}

.archive-search .search-input {
  width: 100%;
  padding: 6px 32px;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border, var(--c-border-input));
  border-radius: 4px;
  color: var(--vscode-input-foreground);
  font-size: 12px;
}

.archive-search .search-input:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
}

.archive-search .search-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: var(--c-text-muted);
  cursor: pointer;
  padding: 2px;
}

.archive-search .search-clear:hover {
  color: var(--vscode-foreground);
}

.filter-info {
  font-size: 11px;
  color: var(--c-text-muted);
  margin-bottom: var(--space-4);
}

/* Archive actions */
.archive-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.15s;
}

.list-item:hover .archive-actions {
  opacity: 1;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--c-text-muted);
  cursor: pointer;
  transition: all 0.1s;
}

.action-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
}

.action-btn.restore:hover {
  color: var(--vscode-charts-green, #4caf50);
}

.action-btn.delete:hover {
  color: var(--vscode-errorForeground);
}
</style>
