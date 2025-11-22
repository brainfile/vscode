<script setup lang="ts">
import type { Task } from "@brainfile/core";

defineProps<{
  tasks: Task[];
}>();

const emit = defineEmits<{
  (e: "open-file", file: string): void;
}>();
</script>

<template>
  <div class="archive">
    <div v-if="tasks.length === 0" class="empty">No archived tasks yet.</div>
    <ul v-else class="list">
      <li v-for="task in tasks" :key="task.id" class="item">
        <div>
          <p class="eyebrow">{{ task.id }}</p>
          <h4>{{ task.title }}</h4>
          <p class="desc">{{ task.description }}</p>
        </div>
        <div v-if="task.relatedFiles?.length" class="files">
          <button
            v-for="file in task.relatedFiles"
            :key="file"
            class="file"
            @click="emit('open-file', file)"
          >
            📄 {{ file }}
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.archive {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.02);
}

.eyebrow {
  margin: 0;
  color: #9ba3b4;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h4 {
  margin: 4px 0 6px;
  color: #f6f7fb;
}

.desc {
  margin: 0;
  color: #cfd6e6;
}

.files {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.file {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: #dce2f2;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
}

.empty {
  color: #9ba3b4;
  text-align: center;
  padding: 12px;
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 12px;
}
</style>
