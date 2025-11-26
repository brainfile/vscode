<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import type { Column } from "@brainfile/core";
import ConfirmDialog from "./ConfirmDialog.vue";

const props = defineProps<{
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
const showDeleteConfirm = ref(false);

const moveDropdownWrapper = ref<HTMLElement | null>(null);

const priorities = ["critical", "high", "medium", "low"];

function handleClickOutside(event: MouseEvent) {
  const target = event.target as Node;
  if (showMoveDropdown.value && moveDropdownWrapper.value && !moveDropdownWrapper.value.contains(target)) {
    showMoveDropdown.value = false;
  }
}

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});

function handleMove(columnId: string) {
  emit("move", columnId);
  showMoveDropdown.value = false;
}

function handlePriority(priority: string) {
  emit("set-priority", priority);
}

function requestDelete() {
  showDeleteConfirm.value = true;
}

function confirmDelete() {
  showDeleteConfirm.value = false;
  emit("delete");
}

function cancelDelete() {
  showDeleteConfirm.value = false;
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
      <div ref="moveDropdownWrapper" class="dropdown-wrapper">
        <button class="action-btn" @click.stop="showMoveDropdown = !showMoveDropdown">
          Move {{ selectedCount }}
        </button>
        <div v-if="showMoveDropdown" class="dropdown" @click.stop>
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

      <!-- Priority inline buttons -->
      <div class="priority-group">
        <span class="priority-label">Priority:</span>
        <button
          v-for="p in priorities"
          :key="p"
          class="priority-btn"
          :class="p"
          :title="`Set to ${p}`"
          @click="handlePriority(p)"
        >
          {{ p.charAt(0).toUpperCase() }}
        </button>
      </div>

      <button class="action-btn" @click="emit('archive')">
        Archive {{ selectedCount }}
      </button>

      <button class="action-btn danger" @click="requestDelete">
        Delete {{ selectedCount }}
      </button>
    </div>

    <ConfirmDialog
      :visible="showDeleteConfirm"
      title="Delete Tasks"
      :message="`Are you sure you want to delete ${props.selectedCount} task${props.selectedCount === 1 ? '' : 's'}? This cannot be undone.`"
      confirm-text="Delete"
      :danger="true"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
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

/* Priority inline buttons */
.priority-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.priority-label {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  margin-right: 2px;
}

.priority-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.1s;
  opacity: 0.7;
}

.priority-btn:hover {
  opacity: 1;
  transform: scale(1.1);
}

.priority-btn.critical {
  background: var(--priority-critical-bg, #ff6b6b);
  color: var(--priority-critical-fg, #fff);
}

.priority-btn.high {
  background: var(--priority-high-bg, #ffa94d);
  color: var(--priority-high-fg, #000);
}

.priority-btn.medium {
  background: var(--priority-medium-bg, #ffd43b);
  color: var(--priority-medium-fg, #000);
}

.priority-btn.low {
  background: var(--priority-low-bg, #69db7c);
  color: var(--priority-low-fg, #000);
}
</style>
