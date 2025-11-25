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
  filters,
  parseWarning,
  availableAgents,
  defaultAgent,
  lastUsedAgent,
  loading,
  availableFiles,
} = storeToRefs(store);

const showFileSwitcher = ref(false);

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

/** Default stat columns if statsConfig not specified */
const DEFAULT_STAT_COLUMNS = ["todo", "in-progress", "done"];

const stats = computed(() => {
  if (!board.value) {
    return { total: 0, progress: 0, cards: [] };
  }

  const total = board.value.columns.reduce((sum, col) => sum + col.tasks.length, 0);
  const doneCount = board.value.columns.find((c) => c.id === "done")?.tasks.length ?? 0;
  const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // Use statsConfig.columns or fall back to defaults
  const configuredColumns = board.value.statsConfig?.columns ?? DEFAULT_STAT_COLUMNS;

  // Build stat cards for each configured column
  const cards = configuredColumns.map((columnId) => {
    const column = board.value!.columns.find((c) => c.id === columnId);
    return {
      id: columnId,
      label: column?.title ?? columnId.toUpperCase(),
      count: column?.tasks.length ?? 0,
    };
  });

  return { total, progress, cards };
});

function handleTitleEdit() {
  if (!board.value) return;
  const updated = prompt("Enter new board title", board.value.title);
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

const hasFixableIssues = computed(() => {
  return parseWarning.value?.lintResult?.issues.some(i => i.fixable) ?? false;
});

const issueCount = computed(() => {
  return parseWarning.value?.lintResult?.issues.length ?? 0;
});

const fixableCount = computed(() => {
  return parseWarning.value?.lintResult?.issues.filter(i => i.fixable).length ?? 0;
});

function clearWarning() {
  store.setParseWarning(undefined, undefined);
  store.refresh();
}

function attemptFix() {
  store.sendMessage({ type: 'fix-issues' });
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

function handleSwitchFile(absolutePath: string) {
  showFileSwitcher.value = false;
  store.switchFile(absolutePath);
}
</script>

<template>
  <div class="app-shell">
    <div class="header-top">
      <div class="board-title-wrapper">
        <div v-if="availableFiles.length > 1" class="file-switcher">
          <button
            class="switcher-btn"
            :class="{ active: showFileSwitcher }"
            @click="showFileSwitcher = !showFileSwitcher"
            title="Switch brainfile (Cmd+Shift+B)"
          >⇅</button>
          <div v-if="showFileSwitcher" class="switcher-dropdown">
            <div
              v-for="file in availableFiles"
              :key="file.absolutePath"
              class="switcher-item"
              :class="{ current: file.isCurrent }"
              @click="handleSwitchFile(file.absolutePath)"
            >
              <span class="file-name">{{ file.name }}</span>
              <span class="file-meta">{{ file.itemCount }} items</span>
              <span v-if="file.isPrivate" class="file-badge">private</span>
            </div>
          </div>
        </div>
        <div class="board-title" id="boardTitle">{{ board?.title ?? "Brainfile" }}</div>
        <button class="title-edit-btn" id="titleEditBtn" title="Edit title" @click="handleTitleEdit">✎</button>
      </div>
    </div>

    <div v-if="parseWarning" class="banner warning">
      <div class="banner__content">
        <div class="banner__text">
          {{ parseWarning.message }}
          <span v-if="issueCount > 0" class="banner__details">
            ({{ issueCount }} issue{{ issueCount !== 1 ? 's' : '' }} found{{ fixableCount > 0 ? `, ${fixableCount} fixable` : '' }})
          </span>
        </div>
      </div>
      <div class="banner__actions">
        <button v-if="hasFixableIssues" class="btn-primary" @click="attemptFix">
          Attempt Fix ({{ fixableCount }})
        </button>
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
      <div class="panel-header">
        <BoardHeader
          :progress="stats.progress"
          :stat-cards="stats.cards"
        />

        <SearchFilter
          :filters="filters"
          @update:filters="handleFiltersUpdate"
          @reset="store.resetFilters"
        />
      </div>

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
          :current-sort="store.getColumnSort(view.column.id)"
          @toggle-collapse="store.toggleColumnCollapse(view.column.id)"
          @add-task="store.addTaskToColumn(view.column.id)"
          @set-sort="store.setColumnSort(view.column.id, $event)"
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
      <div class="panel-scroll">
        <RulesPanel
          :rules="board?.rules"
          @add-rule="handleAddRule"
          @edit-rule="handleEditRule"
          @delete-rule="handleDeleteRule"
        />
      </div>
    </section>

    <section v-else class="panel">
      <div class="panel-scroll">
        <ArchivePanel :tasks="board?.archive ?? []" @open-file="store.openFile" />
      </div>
    </section>
  </div>
</template>
<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  padding: 0;
  background: var(--vscode-sideBar-background);
  color: var(--vscode-sideBar-foreground);
}

.header-top {
  flex-shrink: 0;
}

.tabs {
  flex-shrink: 0;
  display: flex;
  gap: 4px;
  margin-bottom: 0;
  padding: 0 12px;
  border-bottom: 1px solid var(--vscode-panel-border);
}

.tab {
  background: transparent;
  border: none;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
  letter-spacing: -0.01em;
}

.tab:hover {
  color: var(--vscode-foreground);
  background: var(--vscode-toolbar-hoverBackground);
}

.tab.active {
  color: var(--vscode-editor-foreground);
  border-bottom-color: var(--vscode-focusBorder);
  opacity: 0.95;
}

.panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--vscode-sideBar-background);
  padding: 0 12px 0;
}

.panel-header {
  flex-shrink: 0;
}

.columns-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  overflow-y: auto;
  padding-bottom: 16px;
}

.panel-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--vscode-descriptionForeground);
  min-height: 120px;
  border: 1px dashed var(--vscode-panel-border);
  border-radius: 6px;
  opacity: 0.7;
}

.banner {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  margin: 12px 12px 8px;
  border-radius: 6px;
  background: var(--vscode-notifications-background);
  border: 1px solid var(--vscode-notifications-border);
  color: var(--vscode-notifications-foreground);
}

.banner__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.banner__text {
  font-size: 13px;
  line-height: 1.5;
}

.banner__details {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  margin-left: 8px;
}

.banner__actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.banner__actions .btn-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.banner__actions .btn-primary:hover {
  background: var(--vscode-button-hoverBackground);
}

.banner__actions .ghost {
  background: transparent;
  border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
  color: var(--vscode-button-foreground);
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}

button {
  font-family: inherit;
}

/* File Switcher */
.file-switcher {
  position: relative;
  margin-right: 4px;
}

.switcher-btn {
  padding: 2px 6px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
  line-height: 1;
}

.switcher-btn:hover,
.switcher-btn.active {
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
  border-color: var(--vscode-panel-border);
}

.switcher-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  min-width: 200px;
  max-width: 300px;
  background: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 100;
  overflow: hidden;
}

.switcher-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.1s;
}

.switcher-item:hover {
  background: var(--vscode-list-hoverBackground);
}

.switcher-item.current {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

.file-name {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-meta {
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  white-space: nowrap;
}

.file-badge {
  font-size: 9px;
  padding: 2px 4px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
