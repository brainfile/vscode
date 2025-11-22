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

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions
