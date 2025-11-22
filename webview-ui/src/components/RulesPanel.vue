<script setup lang="ts">
import type { Rules } from "@brainfile/core";

const props = defineProps<{
  rules?: Rules;
}>();

const emit = defineEmits<{
  (e: "add-rule", ruleType: string): void;
  (e: "edit-rule", payload: { ruleId: number; ruleType: string }): void;
  (e: "delete-rule", payload: { ruleId: number; ruleType: string }): void;
}>();

const ruleTypes: { key: keyof Rules; label: string }[] = [
  { key: "always", label: "Always" },
  { key: "never", label: "Never" },
  { key: "prefer", label: "Prefer" },
  { key: "context", label: "Context" },
];
</script>

<template>
  <div class="rules">
    <section v-for="type in ruleTypes" :key="type.key" class="rule-block">
      <header>
        <div>
          <p class="eyebrow">Rules</p>
          <h3>{{ type.label }}</h3>
        </div>
        <button class="ghost" @click="emit('add-rule', type.key)">＋ Add</button>
      </header>

      <ul v-if="props.rules?.[type.key]?.length" class="rule-list">
        <li v-for="rule in props.rules[type.key]" :key="rule.id" class="rule">
          <div class="content">
            <span class="id">#{{ rule.id }}</span>
            <span>{{ rule.rule }}</span>
          </div>
          <div class="row-actions">
            <button
              class="ghost"
              title="Edit"
              @click="emit('edit-rule', { ruleId: rule.id, ruleType: type.key })"
            >
              ✏️
            </button>
            <button
              class="ghost danger"
              title="Delete"
              @click="emit('delete-rule', { ruleId: rule.id, ruleType: type.key })"
            >
              ✖
            </button>
          </div>
        </li>
      </ul>
      <div v-else class="empty">No rules yet</div>
    </section>
  </div>
</template>

<style scoped>
.rules {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.rule-block {
  border: 1px solid var(--vscode-panel-border);
  border-radius: 8px;
  padding: 12px;
  background: var(--vscode-sideBar-background);
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
}

h3 {
  margin: 4px 0 0;
  color: var(--vscode-editor-foreground);
}

.rule-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rule {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
  border-radius: 6px;
  background: var(--vscode-sideBarSectionHeader-background);
}

.content {
  display: flex;
  gap: 8px;
  align-items: center;
}

.id {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
}

.row-actions {
  display: inline-flex;
  gap: 6px;
}

.ghost {
  border: none;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.ghost.danger {
  color: var(--vscode-inputValidation-errorForeground);
}

.empty {
  color: var(--vscode-descriptionForeground);
  text-align: center;
  padding: 8px;
  border: 1px dashed var(--vscode-panel-border);
  border-radius: 8px;
}
</style>
