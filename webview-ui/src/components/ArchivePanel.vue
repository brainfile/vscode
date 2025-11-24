<script setup lang="ts">
import type { Task } from "@brainfile/core";
import { FileText, ChevronDown } from "lucide-vue-next";
import { ref, computed } from "vue";

const props = defineProps<{
  tasks: Task[];
}>();

const emit = defineEmits<{
  (e: "open-file", file: string): void;
}>();

const expandedTasks = ref<Set<string>>(new Set());

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

const taskCount = computed(() => props.tasks.length);
</script>

<template>
  <div>
    <header class="section-header">
      <span class="section-title">Archived</span>
      <span class="count">{{ taskCount }}</span>
    </header>

    <div v-if="tasks.length === 0" class="empty-state">
      No archived tasks
    </div>

    <ul v-else class="list-none">
      <li
        v-for="task in tasks"
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
</style>
