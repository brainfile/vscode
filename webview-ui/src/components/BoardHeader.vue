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
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.title-block {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 11px;
  color: #9ba3b4;
  margin: 0 0 4px;
}

.title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  color: #f6f7fb;
}

.actions {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}

.actions button {
  border: none;
  cursor: pointer;
  font-weight: 600;
  padding: 8px 12px;
  border-radius: 10px;
  transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
}

.actions .ghost {
  background: rgba(255, 255, 255, 0.06);
  color: #dce2f2;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.actions .primary {
  background: linear-gradient(120deg, #5ac8ff, #9ef5c0);
  color: #0d1117;
  box-shadow: 0 10px 26px rgba(90, 200, 255, 0.25);
}

.actions button:hover {
  transform: translateY(-1px);
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
  color: #c9cfde;
  font-weight: 600;
}

.progress-label .value {
  color: #9ef5c0;
}

.progress-bar {
  height: 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.progress-bar .fill {
  height: 100%;
  background: linear-gradient(120deg, #5ac8ff, #9ef5c0);
  box-shadow: 0 6px 18px rgba(90, 200, 255, 0.3);
  transition: width 200ms ease;
}

.stat-chip {
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.stat-chip.success {
  border-color: rgba(158, 245, 192, 0.35);
  background: rgba(158, 245, 192, 0.08);
}

.label {
  display: block;
  color: #9ba3b4;
  font-size: 12px;
  margin-bottom: 6px;
}

.count {
  font-weight: 700;
  font-size: 18px;
  color: #f6f7fb;
}

@media (max-width: 820px) {
  .title-block {
    flex-direction: column;
  }

  .actions {
    width: 100%;
    justify-content: flex-start;
  }

  .summary {
    grid-template-columns: 1fr;
  }
}
</style>
