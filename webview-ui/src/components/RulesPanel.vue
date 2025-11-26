<script setup lang="ts">
import type { Rules } from "@brainfile/core";
import { Plus, Trash2, Check, X } from "lucide-vue-next";
import { ref, nextTick } from "vue";

const props = defineProps<{
  rules?: Rules;
}>();

const emit = defineEmits<{
  (e: "add-rule", payload: { ruleType: string; ruleText: string }): void;
  (e: "edit-rule", payload: { ruleId: number; ruleType: string }): void;
  (e: "update-rule", payload: { ruleId: number; ruleType: string; ruleText: string }): void;
  (e: "delete-rule", payload: { ruleId: number; ruleType: string }): void;
}>();

const ruleTypes: { key: keyof Rules; label: string }[] = [
  { key: "always", label: "Always" },
  { key: "never", label: "Never" },
  { key: "prefer", label: "Prefer" },
  { key: "context", label: "Context" },
];

// Inline editing state
const editingRuleId = ref<number | null>(null);
const editingRuleType = ref<string | null>(null);
const editingText = ref("");
const editInputRef = ref<HTMLTextAreaElement | null>(null);

// Inline add state
const addingRuleType = ref<string | null>(null);
const newRuleText = ref("");
const addInputRef = ref<HTMLTextAreaElement | null>(null);

function startEditing(ruleId: number, ruleType: string, currentText: string) {
  editingRuleId.value = ruleId;
  editingRuleType.value = ruleType;
  editingText.value = currentText;
  nextTick(() => {
    editInputRef.value?.focus();
    editInputRef.value?.select();
  });
}

function saveEdit() {
  if (editingRuleId.value !== null && editingRuleType.value && editingText.value.trim()) {
    emit("update-rule", {
      ruleId: editingRuleId.value,
      ruleType: editingRuleType.value,
      ruleText: editingText.value.trim(),
    });
  }
  cancelEdit();
}

function cancelEdit() {
  editingRuleId.value = null;
  editingRuleType.value = null;
  editingText.value = "";
}

function handleEditKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    saveEdit();
  } else if (event.key === "Escape") {
    cancelEdit();
  }
}

function startAdding(ruleType: string) {
  addingRuleType.value = ruleType;
  newRuleText.value = "";
  nextTick(() => {
    addInputRef.value?.focus();
  });
}

function saveNewRule() {
  if (addingRuleType.value && newRuleText.value.trim()) {
    emit("add-rule", {
      ruleType: addingRuleType.value,
      ruleText: newRuleText.value.trim(),
    });
  }
  cancelAdd();
}

function cancelAdd() {
  addingRuleType.value = null;
  newRuleText.value = "";
}

function handleAddKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    saveNewRule();
  } else if (event.key === "Escape") {
    cancelAdd();
  }
}
</script>

<template>
  <div>
    <section v-for="type in ruleTypes" :key="type.key" class="border-b">
      <header class="section-header">
        <span class="section-title">{{ type.label }}</span>
        <span class="count">{{ props.rules?.[type.key]?.length || 0 }}</span>
      </header>

      <ul class="list-none">
        <li
          v-for="rule in props.rules?.[type.key] ?? []"
          :key="rule.id"
          class="list-item hover-reveal items-start"
        >
          <span class="id-badge flex-shrink-0 pt-1">#{{ rule.id }}</span>

          <!-- Inline editing -->
          <div v-if="editingRuleId === rule.id && editingRuleType === type.key" class="edit-container">
            <textarea
              ref="editInputRef"
              v-model="editingText"
              class="rule-edit-input"
              rows="2"
              @keydown="handleEditKeydown"
              @blur="saveEdit"
            />
            <div class="edit-actions">
              <button class="edit-action-btn save" title="Save (Enter)" @mousedown.prevent="saveEdit">
                <Check :size="12" />
              </button>
              <button class="edit-action-btn cancel" title="Cancel (Esc)" @mousedown.prevent="cancelEdit">
                <X :size="12" />
              </button>
            </div>
          </div>

          <!-- Display mode -->
          <span
            v-else
            class="rule-text"
            title="Click to edit"
            @click="startEditing(rule.id, type.key, rule.rule)"
          >{{ rule.rule }}</span>

          <button
            v-if="editingRuleId !== rule.id"
            class="icon-btn icon-btn-sm icon-btn-danger reveal-on-hover"
            :aria-label="`Delete rule ${rule.id}`"
            @click="emit('delete-rule', { ruleId: rule.id, ruleType: type.key })"
          >
            <Trash2 :size="12" />
          </button>
        </li>

        <!-- Inline add rule input -->
        <li v-if="addingRuleType === type.key" class="list-item add-rule-item">
          <span class="id-badge flex-shrink-0 pt-1 new-badge">new</span>
          <div class="edit-container">
            <textarea
              ref="addInputRef"
              v-model="newRuleText"
              class="rule-edit-input"
              rows="2"
              :placeholder="`Add ${type.label.toLowerCase()} rule...`"
              @keydown="handleAddKeydown"
              @blur="saveNewRule"
            />
            <div class="edit-actions">
              <button class="edit-action-btn save" title="Save (Enter)" @mousedown.prevent="saveNewRule">
                <Check :size="12" />
              </button>
              <button class="edit-action-btn cancel" title="Cancel (Esc)" @mousedown.prevent="cancelAdd">
                <X :size="12" />
              </button>
            </div>
          </div>
        </li>

        <!-- Add rule button -->
        <li v-else class="add-rule-row">
          <button class="add-rule-btn" @click="startAdding(type.key)">
            <Plus :size="12" />
            <span>Add {{ type.label.toLowerCase() }} rule</span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.pt-1 {
  padding-top: 2px;
}

.rule-text {
  flex: 1;
  font-size: var(--text-sm);
  color: var(--c-text);
  opacity: var(--opacity-high);
  line-height: var(--leading-normal);
  cursor: pointer;
  padding: 2px 4px;
  margin: -2px -4px;
  border-radius: 3px;
  transition: background 0.1s;
}

.rule-text:hover {
  background: var(--vscode-list-hoverBackground);
}

/* Inline editing */
.edit-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rule-edit-input {
  width: 100%;
  padding: 6px 8px;
  font-size: var(--text-sm);
  font-family: inherit;
  line-height: var(--leading-normal);
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-focusBorder);
  border-radius: 4px;
  resize: vertical;
  min-height: 40px;
}

.rule-edit-input:focus {
  outline: none;
}

.edit-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}

.edit-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.1s;
}

.edit-action-btn.save {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.edit-action-btn.save:hover {
  background: var(--vscode-button-hoverBackground);
}

.edit-action-btn.cancel {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.edit-action-btn.cancel:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

/* Add rule */
.add-rule-row {
  padding: 4px 8px;
}

.add-rule-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--vscode-textLink-foreground);
  background: transparent;
  border: 1px dashed var(--vscode-textLink-foreground);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.7;
  transition: all 0.1s;
}

.add-rule-btn:hover {
  opacity: 1;
  background: var(--vscode-list-hoverBackground);
}

.add-rule-item {
  background: var(--vscode-list-hoverBackground);
}

.new-badge {
  background: var(--vscode-focusBorder);
  color: var(--vscode-editor-background);
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
}
</style>
