<script setup lang="ts">
defineProps<{
  title: string;
  progress: number;
  totalTasks: number;
  doneTasks: number;
}>();

defineEmits<{
  (e: "edit-title"): void;
  (e: "refresh"): void;
  (e: "open-settings"): void;
}>();
</script>

<template>
  <header class="board-header">
    <div class="title-block">
      <div>
        <p class="eyebrow">Brainfile Board</p>
        <h1 class="title">{{ title }}</h1>
      </div>
      <div class="actions">
        <button class="ghost" title="Edit title" @click="$emit('edit-title')">
          ✏️ Rename
        </button>
        <button class="ghost" title="Open settings" @click="$emit('open-settings')">
          ⚙️ Settings
        </button>
        <button class="primary" title="Refresh" @click="$emit('refresh')">
          ⟳ Refresh
        </button>
      </div>
    </div>

    <div class="summary">
      <div class="progress">
        <div class="progress-label">
          <span>Progress</span>
          <span class="value">{{ progress }}%</span>
        </div>
        <div class="progress-bar">
          <div class="fill" :style="{ width: `${progress}%` }"></div>
        </div>
      </div>
      <div class="stat-chip">
        <span class="label">Total</span>
        <span class="count">{{ totalTasks }}</span>
      </div>
      <div class="stat-chip success">
        <span class="label">Done</span>
        <span class="count">{{ doneTasks }}</span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.board-header {
  padding: 16px 12px 12px;
  border-bottom: 1px solid var(--vscode-panel-border);
  background: var(--vscode-sideBarSectionHeader-background);
}

.title-block {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  margin: 0 0 4px;
}

.title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--vscode-editor-foreground);
  letter-spacing: -0.01em;
}

.actions {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
}

.actions button {
  border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
  cursor: pointer;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 4px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  transition: background 0.15s, color 0.15s;
}

.actions button:hover {
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
}

.summary {
  display: grid;
  grid-template-columns: 1fr repeat(2, minmax(120px, 1fr));
  gap: 10px;
  align-items: center;
}

.progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-label {
  display: flex;
  justify-content: space-between;
  color: var(--vscode-descriptionForeground);
  font-weight: 600;
  font-size: 12px;
}

.progress-label .value {
  color: var(--vscode-editor-foreground);
}

.progress-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--vscode-input-background);
  overflow: hidden;
  border: 1px solid var(--vscode-panel-border);
}

.progress-bar .fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  transition: width 200ms ease;
}

.stat-chip {
  padding: 10px;
  border-radius: 6px;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-panel-border);
}

.stat-chip.success {
  border-color: var(--vscode-testing-iconPassed);
}

.label {
  display: block;
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
  margin-bottom: 4px;
}

.count {
  font-weight: 700;
  font-size: 16px;
  color: var(--vscode-editor-foreground);
}

@media (max-width: 820px) {
  .title-block {
    flex-direction: column;
    align-items: flex-start;
  }

  .summary {
    grid-template-columns: 1fr;
  }
}
</style>
