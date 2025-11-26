<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import { Search, X, CheckSquare } from "lucide-vue-next";
import type { FiltersState, FilterOptions } from "../types";

const props = defineProps<{
  filters: FiltersState;
  filterOptions: FilterOptions;
  filteredTaskCount?: number;
}>();

const emit = defineEmits<{
  (e: "update:filters", value: Partial<FiltersState>): void;
  (e: "reset"): void;
  (e: "select-all-filtered"): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const showSuggestions = ref(false);
const selectedIndex = ref(0);

// Supported modifiers
const MODIFIERS = ["tag:", "priority:", "assignee:"] as const;

const hasActiveFilters = computed(() => {
  return props.filters.query.length > 0;
});

// Parse active filter chips from query
interface FilterChip {
  type: "tag" | "priority" | "assignee" | "text";
  value: string;
  display: string;
}

const activeChips = computed<FilterChip[]>(() => {
  const chips: FilterChip[] = [];
  const parts = props.filters.query.trim().split(/\s+/);

  for (const part of parts) {
    if (!part) continue;
    const lowerPart = part.toLowerCase();

    if (lowerPart.startsWith("tag:")) {
      const value = part.slice(4);
      if (value) chips.push({ type: "tag", value: part, display: `tag:${value}` });
    } else if (lowerPart.startsWith("priority:")) {
      const value = part.slice(9);
      if (value) chips.push({ type: "priority", value: part, display: `priority:${value}` });
    } else if (lowerPart.startsWith("assignee:")) {
      const value = part.slice(9);
      if (value) chips.push({ type: "assignee", value: part, display: `assignee:${value}` });
    } else {
      chips.push({ type: "text", value: part, display: `"${part}"` });
    }
  }

  return chips;
});

const hasMultipleFilters = computed(() => activeChips.value.length > 1);

function removeChip(chip: FilterChip) {
  const parts = props.filters.query.trim().split(/\s+/);
  const newParts = parts.filter(p => p !== chip.value);
  emit("update:filters", { query: newParts.join(" ") });
}

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
        placeholder="Search / Filter"
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

    <!-- Filter chips -->
    <div v-if="activeChips.length > 0" class="filter-chips">
      <div
        v-for="chip in activeChips"
        :key="chip.value"
        class="filter-chip"
        :class="chip.type"
      >
        <span class="chip-text">{{ chip.display }}</span>
        <button class="chip-remove" @click="removeChip(chip)" title="Remove filter">
          <X :size="10" />
        </button>
      </div>

      <button
        v-if="hasMultipleFilters"
        class="clear-all-btn"
        @click="emit('reset')"
      >
        Clear all
      </button>

      <button
        v-if="filteredTaskCount && filteredTaskCount > 0"
        class="select-all-btn"
        @click="emit('select-all-filtered')"
        :title="`Select all ${filteredTaskCount} filtered tasks`"
      >
        <CheckSquare :size="12" />
        Select {{ filteredTaskCount }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.search-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-container {
  position: relative;
  width: 100%;
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

/* Filter chips */
.filter-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px 2px 8px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  border-radius: 12px;
  font-size: 11px;
}

.filter-chip.tag {
  background: var(--vscode-charts-blue, #3794ff);
}

.filter-chip.priority {
  background: var(--vscode-charts-orange, #d18616);
}

.filter-chip.assignee {
  background: var(--vscode-charts-purple, #b180d7);
}

.filter-chip.text {
  background: var(--vscode-descriptionForeground);
  opacity: 0.8;
}

.chip-text {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: inherit;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.1s;
}

.chip-remove:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.2);
}

.clear-all-btn {
  background: transparent;
  border: none;
  color: var(--vscode-textLink-foreground);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
}

.clear-all-btn:hover {
  text-decoration: underline;
}

.select-all-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 3px 8px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: none;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.1s;
}

.select-all-btn:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}
</style>
