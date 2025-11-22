<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import BoardHeader from "./components/BoardHeader.vue";
import SearchFilter from "./components/SearchFilter.vue";
import ColumnView from "./components/Column.vue";
import RulesPanel from "./components/RulesPanel.vue";
import ArchivePanel from "./components/ArchivePanel.vue";
import { useBoardStore } from "./store/board";
import type { FiltersState } from "./types";

const store = useBoardStore();
const {
  board,
  filteredColumns,
  filterOptions,
  filters,
  parseWarning,
  availableAgents,
  defaultAgent,
  lastUsedAgent,
  loading,
} = storeToRefs(store);

const activeTab = ref<"tasks" | "rules" | "archive">("tasks");

const orderedColumns = computed(() => {
  if (!board.value) return [];
  return [...board.value.columns].sort((a, b) => {
    const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });
});

const columnViews = computed(() => {
  const filteredMap = new Map(
    filteredColumns.value.map((col) => [col.id, col.tasks])
  );
  return orderedColumns.value.map((column) => ({
    column,
    tasks: filteredMap.get(column.id) ?? [],
  }));
});

const stats = computed(() => {
  const total = board.value
    ? board.value.columns.reduce((sum, col) => sum + col.tasks.length, 0)
    : 0;
  const doneCount =
    board.value?.columns.find((c) => c.id === "done")?.tasks.length ?? 0;
  const progress =
    total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return {
    total,
    done: doneCount,
    progress,
  };
});

function handleTitleEdit() {
  if (!board.value) return;
  const updated = prompt("Update board title", board.value.title);
  if (updated && updated.trim() && updated.trim() !== board.value.title) {
    store.updateTitle(updated.trim());
  }
}

function handleFiltersUpdate(patch: Partial<FiltersState>) {
  store.updateFilters(patch);
}

function handleMove(payload: {
  taskId: string;
  fromColumnId: string;
  toColumnId: string;
  toIndex: number;
}) {
  store.moveTask(
    payload.taskId,
    payload.fromColumnId,
    payload.toColumnId,
    payload.toIndex
  );
}

function clearWarning() {
  store.setParseWarning(undefined);
  store.refresh();
}

function handleAddRule(ruleType: string) {
  store.addRule(ruleType);
}

function handleEditRule(payload: { ruleId: number; ruleType: string }) {
  store.editRule(payload.ruleId, payload.ruleType);
}

function handleDeleteRule(payload: { ruleId: number; ruleType: string }) {
  store.deleteRule(payload.ruleId, payload.ruleType);
}

function handleDeleteTask(payload: { columnId: string; taskId: string }) {
  store.deleteTask(payload.columnId, payload.taskId);
}

function handleArchiveTask(payload: { columnId: string; taskId: string }) {
  store.archiveTask(payload.columnId, payload.taskId);
}

function handleCompleteTask(payload: { columnId: string; taskId: string }) {
  store.completeTask(payload.columnId, payload.taskId);
}

function handleSubtask(payload: { taskId: string; subtaskId: string }) {
  store.toggleSubtask(payload.taskId, payload.subtaskId);
}

function handleAgent(payload: { taskId: string; agentType?: string }) {
  store.sendToAgent(payload.taskId, payload.agentType as any);
}
</script>

<template>
  <div class="app-shell">
    <BoardHeader
      :title="board?.title ?? 'Brainfile'"
      :progress="stats.progress"
      :total-tasks="stats.total"
      :done-tasks="stats.done"
      @edit-title="handleTitleEdit"
      @refresh="store.refresh"
      @open-settings="store.openSettings"
    />

    <div v-if="parseWarning" class="banner warning">
      <div class="banner__text">{{ parseWarning }}</div>
      <div class="banner__actions">
        <button class="ghost" @click="clearWarning">Refresh</button>
      </div>
    </div>

    <div class="tabs">
      <button
        class="tab"
        :class="{ active: activeTab === 'tasks' }"
        @click="activeTab = 'tasks'"
      >
        Tasks
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'rules' }"
        @click="activeTab = 'rules'"
      >
        Rules
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'archive' }"
        @click="activeTab = 'archive'"
      >
        Archive
      </button>
    </div>

    <section v-if="activeTab === 'tasks'" class="panel">
      <SearchFilter
        :filters="filters"
        :options="filterOptions"
        @update:filters="handleFiltersUpdate"
        @reset="store.resetFilters"
      />

      <div v-if="!loading && board" class="columns-grid">
        <ColumnView
          v-for="view in columnViews"
          :key="view.column.id"
          :column="view.column"
          :tasks="view.tasks"
          :total-count="view.column.tasks.length"
          :agents="availableAgents"
          :default-agent="defaultAgent"
          :last-used-agent="lastUsedAgent"
          :collapsed="store.isColumnCollapsed(view.column.id)"
          @toggle-collapse="store.toggleColumnCollapse(view.column.id)"
          @add-task="store.addTaskToColumn(view.column.id)"
          @edit-task="store.editTask"
          @edit-priority="store.editPriority"
          @delete-task="handleDeleteTask"
          @archive-task="handleArchiveTask"
          @complete-task="handleCompleteTask"
          @open-file="store.openFile"
          @toggle-subtask="handleSubtask"
          @send-agent="handleAgent"
          @move-task="handleMove"
        />
      </div>
      <div v-else class="empty-state">
        {{ loading ? "Loading board..." : "No board data available" }}
      </div>
    </section>

    <section v-else-if="activeTab === 'rules'" class="panel">
      <RulesPanel
        :rules="board?.rules"
        @add-rule="handleAddRule"
        @edit-rule="handleEditRule"
        @delete-rule="handleDeleteRule"
      />
    </section>

    <section v-else class="panel">
      <ArchivePanel :tasks="board?.archive ?? []" @open-file="store.openFile" />
    </section>
  </div>
</template>

<style scoped>
.app-shell {
  padding: 16px 12px 24px;
  background: radial-gradient(circle at 0% 0%, rgba(90, 119, 255, 0.08), transparent 35%),
    radial-gradient(circle at 100% 0%, rgba(255, 136, 102, 0.08), transparent 30%),
    linear-gradient(180deg, #0f1116 0%, #0c0e13 100%);
  color: #f6f7fb;
  min-height: 100vh;
  font-family: "Sora", "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
}

.tabs {
  display: inline-flex;
  gap: 6px;
  margin: 8px 0 12px;
  background: rgba(255, 255, 255, 0.04);
  padding: 4px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.tab {
  border: none;
  background: transparent;
  color: #c9cfde;
  padding: 8px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, transform 120ms ease;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.tab:hover {
  background: rgba(255, 255, 255, 0.06);
}

.tab.active {
  background: linear-gradient(120deg, #5ac8ff, #88ffbd);
  color: #0b0c10;
  box-shadow: 0 8px 24px rgba(90, 200, 255, 0.25);
}

.panel {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(6px);
}

.columns-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ba3b4;
  min-height: 140px;
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 12px;
}

.banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin: 12px 0;
  border-radius: 12px;
}

.banner.warning {
  background: rgba(255, 165, 92, 0.12);
  border: 1px solid rgba(255, 165, 92, 0.35);
  color: #ffd3ae;
}

.banner__actions .ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #fff;
  padding: 6px 12px;
  border-radius: 10px;
  cursor: pointer;
}

button {
  font-family: inherit;
}
</style>
