<script setup lang="ts">
import type { Rules } from "@brainfile/core";
import { Plus, Pencil, Trash2 } from "lucide-vue-next";

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
  <div>
    <section v-for="type in ruleTypes" :key="type.key" class="border-b">
      <header
        class="section-header hover-reveal"
        @click="emit('add-rule', type.key)"
      >
        <span class="section-title">{{ type.label }}</span>
        <span class="count">{{ props.rules?.[type.key]?.length || 0 }}</span>
        <button
          class="icon-btn icon-btn-sm ml-auto reveal-on-hover"
          :aria-label="`Add ${type.label} rule`"
          @click.stop="emit('add-rule', type.key)"
        >
          <Plus :size="14" />
        </button>
      </header>

      <ul v-if="props.rules?.[type.key]?.length" class="list-none">
        <li
          v-for="rule in props.rules[type.key]"
          :key="rule.id"
          class="list-item hover-reveal items-start"
        >
          <span class="id-badge flex-shrink-0 pt-1">#{{ rule.id }}</span>
          <span class="rule-text">{{ rule.rule }}</span>
          <div class="flex gap-1 reveal-on-hover">
            <button
              class="icon-btn icon-btn-sm"
              :aria-label="`Edit rule ${rule.id}`"
              @click="emit('edit-rule', { ruleId: rule.id, ruleType: type.key })"
            >
              <Pencil :size="12" />
            </button>
            <button
              class="icon-btn icon-btn-sm icon-btn-danger"
              :aria-label="`Delete rule ${rule.id}`"
              @click="emit('delete-rule', { ruleId: rule.id, ruleType: type.key })"
            >
              <Trash2 :size="12" />
            </button>
          </div>
        </li>
      </ul>
      <div v-else class="empty-state">
        No {{ type.label.toLowerCase() }} rules
      </div>
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
}
</style>
