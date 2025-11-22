<script setup lang="ts">
import { computed } from "vue";
import type { FiltersState, FilterOptions } from "../types";

const props = defineProps<{
  filters: FiltersState;
  options: FilterOptions;
}>();

const emit = defineEmits<{
  (e: "update:filters", value: Partial<FiltersState>): void;
  (e: "reset"): void;
}>();

const hasActiveFilters = computed(() => {
  return (
    props.filters.query.length > 0 ||
    props.filters.tags.length > 0 ||
    props.filters.priorities.length > 0 ||
    props.filters.assignees.length > 0
  );
});

function updateQuery(value: string) {
  emit("update:filters", { query: value });
}

function updateSelect(key: keyof Omit<FiltersState, "query">, values: string[]) {
  emit("update:filters", { [key]: values });
}
</script>

<template>
  <div class="filters">
    <div class="search">
      <input
        class="search-input"
        type="text"
        :value="filters.query"
        placeholder="Search tasks, tags, or assignees"
        @input="updateQuery(($event.target as HTMLInputElement).value)"
      />
      <span class="search-icon">🔎</span>
    </div>

    <div class="selects">
      <label class="field">
        <span class="label">Priority</span>
        <select
          multiple
          :value="filters.priorities"
          @change="
            updateSelect(
              'priorities',
              Array.from(($event.target as HTMLSelectElement).selectedOptions).map((o) => o.value)
            )
          "
        >
          <option
            v-for="priority in options.priorities"
            :key="priority"
            :value="priority"
          >
            {{ priority.toUpperCase() }}
          </option>
        </select>
      </label>

      <label class="field">
        <span class="label">Assignee</span>
        <select
          multiple
          :value="filters.assignees"
          @change="
            updateSelect(
              'assignees',
              Array.from(($event.target as HTMLSelectElement).selectedOptions).map((o) => o.value)
            )
          "
        >
          <option v-for="assignee in options.assignees" :key="assignee" :value="assignee">
            {{ assignee }}
          </option>
        </select>
      </label>

      <label class="field">
        <span class="label">Tags</span>
        <select
          multiple
          :value="filters.tags"
          @change="
            updateSelect(
              'tags',
              Array.from(($event.target as HTMLSelectElement).selectedOptions).map((o) => o.value)
            )
          "
        >
          <option v-for="tag in options.tags" :key="tag" :value="tag">
            {{ tag }}
          </option>
        </select>
      </label>
    </div>

    <button v-if="hasActiveFilters" class="ghost" @click="emit('reset')">
      Clear Filters
    </button>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.search {
  position: relative;
}

.search-input {
  width: 100%;
  padding: 12px 12px 12px 38px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: #f6f7fb;
  outline: none;
}

.search-input:focus {
  border-color: rgba(90, 200, 255, 0.5);
  box-shadow: 0 0 0 3px rgba(90, 200, 255, 0.12);
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0.75;
}

.selects {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #c9cfde;
}

.label {
  font-size: 12px;
  color: #9ba3b4;
}

select {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #f6f7fb;
  padding: 10px;
  border-radius: 10px;
  min-height: 44px;
}

.ghost {
  align-self: flex-start;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent;
  color: #f6f7fb;
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
}
</style>
