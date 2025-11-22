<script setup lang="ts">
import { computed } from "vue";
import type { FiltersState } from "../types";

const props = defineProps<{
  filters: FiltersState;
}>();

const emit = defineEmits<{
  (e: "update:filters", value: Partial<FiltersState>): void;
  (e: "reset"): void;
}>();

const hasActiveFilters = computed(() => {
  return props.filters.query.length > 0;
});

function updateQuery(value: string) {
  emit("update:filters", { query: value });
}
</script>

<template>
  <div class="search-section">
    <div class="search-container">
      <input
        type="text"
        id="searchInput"
        class="search-input"
        placeholder="Search tasks..."
        autocomplete="off"
        :value="filters.query"
        @input="updateQuery(($event.target as HTMLInputElement).value)"
      />
      <button
        id="searchClear"
        class="search-clear"
        :style="{ display: hasActiveFilters ? 'block' : 'none' }"
        @click="emit('reset')"
      >
        ×
      </button>
    </div>
  </div>
</template>

<style scoped></style>
