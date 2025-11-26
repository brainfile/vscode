<script setup lang="ts">
import { ref } from "vue";
import type { Column } from "@brainfile/core";

defineProps<{
  selectedCount: number;
  columns: Column[];
}>();

const emit = defineEmits<{
  (e: "move", columnId: string): void;
  (e: "archive"): void;
  (e: "delete"): void;
  (e: "clear"): void;
  (e: "set-priority", priority: string): void;
}>();

const showMoveDropdown = ref(false);
const showPriorityDropdown = ref(false);

const priorities = ["critical", "high", "medium", "low"];

function handleMove(columnId: string) {
  emit("move", columnId);
  showMoveDropdown.value = false;
}

function handlePriority(priority: string) {
  emit("set-priority", priority);
  showPriorityDropdown.value = false;
}
</script>

<template>
  <div class="bulk-action-bar">
    <div class="selection-info">
      <span class="count">{{ selectedCount }}</span> selected
      <button class="clear-btn" @click="emit('clear')" title="Clear selection">×</button>
    </div>

    <div class="actions">
      <!-- Move dropdown -->
      <div class="dropdown-wrapper">
        <button class="action-btn" @click="showMoveDropdown = !showMoveDropdown">
          Move to
        </button>
        <div v-if="showMoveDropdown" class="dropdown">
          <button
            v-for="col in columns"
            :key="col.id"
            class="dropdown-item"
            @click="handleMove(col.id)"
          >
            {{ col.title }}
          </button>
        </div>
      </div>

      <!-- Priority dropdown -->
      <div class="dropdown-wrapper">
        <button class="action-btn" @click="showPriorityDropdown = !showPriorityDropdown">
          Set Priority
        </button>
        <div v-if="showPriorityDropdown" class="dropdown">
          <button
            v-for="p in priorities"
            :key="p"
            class="dropdown-item"
            @click="handlePriority(p)"
          >
            {{ p }}
          </button>
        </div>
      </div>

      <button class="action-btn" @click="emit('archive')">
        Archive
      </button>

      <button class="action-btn danger" @click="emit('delete')">
        Delete
      </button>
    </div>
  </div>
</template>

<style scoped>
.bulk-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-focusBorder);
  border-radius: 6px;
  margin-bottom: 8px;
}

.selection-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--vscode-foreground);
}

.count {
  font-weight: 600;
  color: var(--vscode-focusBorder);
}

.clear-btn {
  background: transparent;
  border: none;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
  line-height: 1;
}

.clear-btn:hover {
  color: var(--vscode-foreground);
}

.actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-btn {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: none;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.1s;
}

.action-btn:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.action-btn.danger {
  background: transparent;
  color: var(--vscode-errorForeground);
  border: 1px solid var(--vscode-errorForeground);
}

.action-btn.danger:hover {
  background: var(--vscode-errorForeground);
  color: var(--vscode-editor-background);
}

.dropdown-wrapper {
  position: relative;
}

.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  min-width: 120px;
  background: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 200;
  overflow: hidden;
}

.dropdown-item {
  display: block;
  width: 100%;
  padding: 6px 10px;
  background: transparent;
  border: none;
  text-align: left;
  font-size: 11px;
  color: var(--vscode-dropdown-foreground);
  cursor: pointer;
}

.dropdown-item:hover {
  background: var(--vscode-list-hoverBackground);
}
</style>
