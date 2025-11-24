# Contributing to Brainfile VSCode Extension

Thank you for your interest in contributing to Brainfile!

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- VS Code (for testing the extension)

### Getting Started

```bash
# Clone and install
git clone https://github.com/brainfile/vscode.git
cd vscode
npm install

# Run tests
npm test

# Compile
npm run compile

# Package extension
npx vsce package
```

### Development Workflow

1. Make changes to source files in `src/`
2. Run `npm test` to verify tests pass
3. Run `npm run compile` to check TypeScript
4. Press F5 in VS Code to launch Extension Development Host

## Architecture

The extension follows a modular architecture with clear separation of concerns:

```
src/
├── extension.ts          # Extension entry point
├── boardViewProvider.ts  # Main webview provider (orchestrator)
└── board/                # Modular components
    ├── index.ts          # Re-exports all modules
    ├── types.ts          # Type definitions and guards
    ├── messages.ts       # Message constants and validation
    ├── orchestrator.ts   # File I/O coordination
    ├── html/             # HTML generation
    │   ├── utils.ts      # escapeHtml, generateNonce, etc.
    │   ├── styles.ts     # Priority CSS generation
    │   ├── stats.ts      # Stats panel HTML
    │   └── error.ts      # Error page HTML
    ├── agents/           # AI integration
    │   └── promptBuilder.ts
    ├── data/             # Pure board operations
    │   ├── archive.ts    # Archive management
    │   ├── taskId.ts     # Task ID generation/lookup
    │   └── boardOperations.ts  # Immutable board mutations
    └── handlers/         # Message handling
        └── messageRouter.ts
```

### Design Principles

1. **Pure Functions**: Board operations in `data/` are pure functions that return new objects instead of mutating state
2. **VS Code Agnostic**: Modules under `board/` have no VS Code dependencies, making them testable
3. **Type Safety**: Extensive use of TypeScript type guards and discriminated unions
4. **Immutability**: All board mutations return new board objects

### Key Modules

#### `board/data/boardOperations.ts`
Pure functions for board mutations:
- `updateTask()` - Update task title/description
- `deleteTask()` - Remove task from column
- `moveTask()` - Move task between columns
- `addTask()` - Add new task to column
- `toggleSubtask()` - Toggle subtask completion

#### `board/handlers/messageRouter.ts`
Routes webview messages to appropriate handlers:
- Returns `{ type: "board-updated", board }` for mutations
- Returns `{ type: "external-action", action }` for VS Code API calls
- Returns `{ type: "no-op" }` for unknown messages

#### `board/orchestrator.ts`
Coordinates file I/O and workflows:
- `readBoardFromDisk()` / `writeBoardToDisk()`
- `processMessage()` - Route and process messages
- `lintBrainfile()` - Validate content

## Testing

Tests use Jest with ts-jest. Run with:

```bash
npm test                    # Run all tests
npm test -- --watch        # Watch mode
npm test -- path/to/test   # Run specific test
```

### Writing Tests

Tests live in `__tests__/` directories alongside source:

```
src/board/
├── data/
│   ├── boardOperations.ts
│   └── __tests__/
│       └── boardOperations.test.ts
```

Example test:

```typescript
import { updateTask } from "../boardOperations";

describe("updateTask", () => {
  it("updates task title and description", () => {
    const board = createTestBoard();
    const result = updateTask(board, "todo", "task-1", "New Title", "New Desc");

    expect(result.success).toBe(true);
    expect(result.board?.columns[0].tasks[0].title).toBe("New Title");
  });

  it("does not mutate original board", () => {
    const board = createTestBoard();
    const original = JSON.stringify(board);
    updateTask(board, "todo", "task-1", "New", "New");

    expect(JSON.stringify(board)).toBe(original);
  });
});
```

### Mocking VS Code

The VS Code API is mocked in `src/__tests__/__mocks__/vscode.ts`. Jest automatically uses this mock.

## Pull Request Guidelines

1. **Run tests**: Ensure `npm test` passes
2. **Run compile**: Ensure `npm run compile` succeeds
3. **Add tests**: New features should include tests
4. **Update changelog**: Add entry to CHANGELOG.md
5. **Keep PRs focused**: One feature/fix per PR

## Code Style

- TypeScript strict mode enabled
- Prefer `const` over `let`
- Use descriptive variable names
- Add JSDoc comments for public functions
- No `any` types without justification

## CSS Kit

The webview uses a custom CSS kit for consistent styling. Files are in `webview-ui/src/styles/`:

```
styles/
├── vars.css       # Semantic CSS variables
├── utilities.css  # Utility classes
└── main.css       # Component styles (imports vars + utilities)
```

### Variables (`vars.css`)

Maps VS Code theme variables to semantic names:

```css
/* Colors */
--c-text          /* Primary text (--vscode-editor-foreground) */
--c-text-muted    /* Secondary text (--vscode-descriptionForeground) */
--c-bg            /* Background (--vscode-sideBar-background) */
--c-bg-elevated   /* Section headers (--vscode-sideBarSectionHeader-background) */
--c-bg-hover      /* Hover state (--vscode-list-hoverBackground) */
--c-border        /* Borders (--vscode-panel-border) */

/* Typography */
--text-2xs: 10px  /* Tiny (metadata, IDs) */
--text-xs: 11px   /* Small (descriptions) */
--text-sm: 12px   /* Base (body text) */
--text-base: 13px /* Medium (titles) */
--font-mono       /* JetBrains Mono */

/* Spacing */
--space-1 through --space-10  /* 2px, 4px, 6px, 8px, 10px, 12px, 16px, 20px */

/* Other */
--radius, --radius-md, --radius-lg  /* 4px, 6px, 8px */
--transition                        /* 0.15s */
--opacity-muted, --opacity-high     /* 0.6, 0.9 */
```

### Utility Classes (`utilities.css`)

Common patterns as composable classes:

```html
<!-- Layout -->
<div class="flex items-center gap-4">
<div class="flex-col gap-2">

<!-- Typography -->
<span class="text-xs text-muted font-mono">

<!-- Spacing -->
<div class="p-8 mt-4 ml-auto">

<!-- Components -->
<button class="icon-btn icon-btn-sm">      <!-- Transparent icon button -->
<header class="section-header">            <!-- Collapsible panel header -->
<span class="section-title">               <!-- Uppercase label -->
<span class="count">                       <!-- Mono count badge -->
<li class="list-item hover-reveal">        <!-- Hoverable row -->
<div class="empty-state">                  <!-- Empty state message -->
<span class="id-badge">                    <!-- Task/rule ID -->
<button class="file-link">                 <!-- Clickable file path -->

<!-- Reveal on hover -->
<div class="hover-reveal">
  <button class="reveal-on-hover">         <!-- Hidden until parent hover -->
</div>
```

### Writing Component Styles

1. **Prefer utilities** in templates over scoped CSS
2. **Use kit variables** (`var(--c-text)`) not raw VS Code vars
3. **Only add scoped CSS** for component-specific styles
4. **Follow existing patterns** - check `RulesPanel.vue` and `ArchivePanel.vue`

Example component:

```vue
<template>
  <div>
    <header class="section-header hover-reveal">
      <span class="section-title">Items</span>
      <span class="count">{{ items.length }}</span>
      <button class="icon-btn ml-auto reveal-on-hover">
        <Plus :size="14" />
      </button>
    </header>
    <ul class="list-none">
      <li v-for="item in items" class="list-item">
        <span class="id-badge">#{{ item.id }}</span>
        <span class="item-text">{{ item.text }}</span>
      </li>
    </ul>
    <div v-if="!items.length" class="empty-state">No items</div>
  </div>
</template>

<style scoped>
/* Only component-specific styles */
.item-text {
  flex: 1;
  font-size: var(--text-sm);
  color: var(--c-text);
}
</style>
```

### Adding New Utilities

When adding reusable patterns:

1. Check if it exists in `utilities.css` first
2. If truly reusable (3+ uses), add to `utilities.css`
3. Use kit naming conventions (`text-*`, `bg-*`, `gap-*`)
4. Document in this file

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions
