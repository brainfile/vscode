<script setup lang="ts">
import { XCircle } from "lucide-vue-next";

defineProps<{
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}>();

const emit = defineEmits<{
  (e: "confirm"): void;
  (e: "cancel"): void;
}>();
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay" @click.self="emit('cancel')">
      <div class="dialog" role="alertdialog" aria-modal="true">
        <div class="dialog-header">
          <XCircle v-if="danger" :size="20" class="danger-icon" />
          <h3 class="dialog-title">{{ title }}</h3>
        </div>
        <p class="dialog-message">{{ message }}</p>
        <div class="dialog-actions">
          <button class="dialog-btn cancel" @click="emit('cancel')">
            {{ cancelText || "Cancel" }}
          </button>
          <button
            class="dialog-btn confirm"
            :class="{ danger }"
            @click="emit('confirm')"
          >
            {{ confirmText || "Confirm" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.dialog {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 6px;
  padding: 16px;
  min-width: 280px;
  max-width: 400px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.danger-icon {
  color: var(--vscode-errorForeground);
  flex-shrink: 0;
}

.dialog-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.dialog-message {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--vscode-descriptionForeground);
  line-height: 1.4;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dialog-btn {
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.dialog-btn.cancel {
  background: transparent;
  border: 1px solid var(--vscode-button-secondaryBackground);
  color: var(--vscode-foreground);
}

.dialog-btn.cancel:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.dialog-btn.confirm {
  background: var(--vscode-button-background);
  border: none;
  color: var(--vscode-button-foreground);
}

.dialog-btn.confirm:hover {
  background: var(--vscode-button-hoverBackground);
}

.dialog-btn.confirm.danger {
  background: var(--vscode-errorForeground);
  color: var(--vscode-editor-background);
}

.dialog-btn.confirm.danger:hover {
  opacity: 0.9;
}
</style>
