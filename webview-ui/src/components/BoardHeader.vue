<script setup lang="ts">
defineProps<{
  progress: number;
  totalTasks: number;
  doneTasks: number;
}>();
</script>

<template>
  <div class="board-header">
    <div class="progress-section">
      <div class="progress-label">
        <span>Progress</span>
        <span class="progress-percent">{{ progress }}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
      </div>
    </div>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">{{ totalTasks }}</div>
        <div class="stat-label">TOTAL</div>
      </div>
      <div class="stat">
        <div class="stat-value">{{ doneTasks }}</div>
        <div class="stat-label">DONE</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board-header {
  padding: 0 0 12px 0;
  border-bottom: 1px solid var(--vscode-panel-border);
  background: var(--vscode-sideBar-background);
}

.progress-section {
  margin-top: 8px;
}

.progress-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--vscode-editor-foreground);
  opacity: 0.7;
  margin-bottom: 6px;
}

.progress-percent {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  font-size: 13px;
  color: var(--vscode-editor-foreground);
  opacity: 0.95;
}

.progress-bar {
  height: 6px;
  background: var(--vscode-input-background);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 3px;
}

.stats {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.stat {
  flex: 1;
  padding: 8px;
  background: var(--vscode-input-background);
  border-radius: 6px;
  border: 1px solid var(--vscode-panel-border);
}

.stat-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 20px;
  font-weight: 600;
  color: var(--vscode-editor-foreground);
}

.stat-label {
  font-size: 10px;
  color: var(--vscode-editor-foreground);
  opacity: 0.6;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 2px;
}
</style>
