<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import { Search, X } from "lucide-vue-next";
import type { FiltersState, FilterOptions } from "../types";

const props = defineProps<{
  filters: FiltersState;
  filterOptions: FilterOptions;
}>();

const emit = defineEmits<{
  (e: "update:filters", value: Partial<FiltersState>): void;
  (e: "reset"): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const showSuggestions = ref(false);
const selectedIndex = ref(0);

// Supported modifiers
const MODIFIERS = ["tag:", "priority:", "assignee:"] as const;

const hasActiveFilters = computed(() => {
  return props.filters.query.length > 0;
});

// Detect if we're currently typing a modifier
const activeModifier = computed(() => {
  const query = props.filters.query;
  // Find the last word being typed
  const lastSpaceIndex = query.lastIndexOf(" ");
  const currentWord = query.slice(lastSpaceIndex + 1).toLowerCase();

  for (const mod of MODIFIERS) {
    if (currentWord.startsWith(mod)) {
      return { type: mod, value: currentWord.slice(mod.length) };
    }
    // Also suggest modifiers when partially typing them
    if (mod.startsWith(currentWord) && currentWord.length > 0) {
      return { type: "partial", value: currentWord };
    }
  }
  return null;
});

// Get suggestions based on active modifier
const suggestions = computed(() => {
  if (!activeModifier.value) return [];

  const { type, value } = activeModifier.value;
  const filterValue = value.toLowerCase();

  if (type === "partial") {
    // Suggest matching modifiers
    return MODIFIERS
      .filter(mod => mod.startsWith(filterValue))
      .map(mod => ({ type: "modifier" as const, value: mod, display: mod }));
  }

  if (type === "tag:") {
    const tags = props.filterOptions.tags || [];
    if (tags.length === 0) return [];
    return tags
      .filter(tag => tag.toLowerCase().includes(filterValue))
      .map(tag => ({ type: "tag" as const, value: tag, display: tag }));
  }

  if (type === "priority:") {
    const priorities = props.filterOptions.priorities || [];
    if (priorities.length === 0) return [];
    return priorities
      .filter(p => p.toLowerCase().includes(filterValue))
      .map(p => ({ type: "priority" as const, value: p, display: p }));
  }

  if (type === "assignee:") {
    const assignees = props.filterOptions.assignees || [];
    if (assignees.length === 0) return [];
    return assignees
      .filter(a => a.toLowerCase().includes(filterValue))
      .map(a => ({ type: "assignee" as const, value: a, display: a }));
  }

  return [];
});

// Show suggestions when there are any and we have an active modifier
watch([activeModifier, suggestions], () => {
  showSuggestions.value = suggestions.value.length > 0;
  selectedIndex.value = 0;
});

function updateQuery(value: string) {
  emit("update:filters", { query: value });
}

function selectSuggestion(suggestion: typeof suggestions.value[0]) {
  const query = props.filters.query;
  const lastSpaceIndex = query.lastIndexOf(" ");
  const prefix = lastSpaceIndex >= 0 ? query.slice(0, lastSpaceIndex + 1) : "";

  let newValue: string;
  if (suggestion.type === "modifier") {
    // Insert the modifier
    newValue = prefix + suggestion.value;
  } else {
    // Insert modifier:value
    const modType = activeModifier.value?.type;
    if (modType && modType !== "partial") {
      newValue = prefix + modType + suggestion.value + " ";
    } else {
      newValue = prefix + suggestion.value + " ";
    }
  }

  emit("update:filters", { query: newValue });
  showSuggestions.value = false;
  nextTick(() => inputRef.value?.focus());
}

function handleKeydown(event: KeyboardEvent) {
  if (!showSuggestions.value) return;

  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      selectedIndex.value = Math.min(selectedIndex.value + 1, suggestions.value.length - 1);
      break;
    case "ArrowUp":
      event.preventDefault();
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
      break;
    case "Enter":
    case "Tab": {
      const selected = suggestions.value[selectedIndex.value];
      if (selected) {
        event.preventDefault();
        selectSuggestion(selected);
      }
      break;
    }
    case "Escape":
      showSuggestions.value = false;
      break;
  }
}

function handleBlur() {
  // Delay hiding to allow click on suggestion
  setTimeout(() => {
    showSuggestions.value = false;
  }, 150);
}
</script>

<template>
  <div class="search-section">
    <div class="search-container">
      <Search class="search-icon" :size="14" />
      <input
        ref="inputRef"
        type="text"
        id="searchInput"
        class="search-input"
        placeholder="Search..."
        autocomplete="off"
        :value="filters.query"
        @input="updateQuery(($event.target as HTMLInputElement).value)"
        @keydown="handleKeydown"
        @blur="handleBlur"
      />
      <button
        id="searchClear"
        class="search-clear"
        v-show="hasActiveFilters"
        @click="emit('reset')"
      >
        <X :size="12" :stroke-width="1.75" />
      </button>

      <!-- Autocomplete dropdown -->
      <div v-if="showSuggestions && suggestions.length > 0" class="suggestions-dropdown">
        <div
          v-for="(suggestion, index) in suggestions"
          :key="suggestion.value"
          class="suggestion-item"
          :class="{ selected: index === selectedIndex }"
          @mousedown.prevent="selectSuggestion(suggestion)"
          @mouseenter="selectedIndex = index"
        >
          <span class="suggestion-type">{{ suggestion.type }}</span>
          <span class="suggestion-value">{{ suggestion.display }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-container {
  position: relative;
}

.suggestions-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 300;
  max-height: 200px;
  overflow-y: auto;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
}

.suggestion-item:hover,
.suggestion-item.selected {
  background: var(--vscode-list-hoverBackground);
}

.suggestion-type {
  color: var(--vscode-descriptionForeground);
  font-size: 10px;
  text-transform: uppercase;
  min-width: 60px;
}

.suggestion-value {
  color: var(--vscode-foreground);
}
</style>
