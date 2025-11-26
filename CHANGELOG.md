# Changelog

All notable changes to the Brainfile VSCode extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - 2025-11-25

### Added

#### Bulk Task Operations
- **Multi-select mode** - Click "Select" button to enter selection mode
- **Checkbox selection** - Select multiple tasks across columns
- **Bulk action toolbar** - Appears when tasks are selected
  - **Move to** - Move selected tasks to any column
  - **Set Priority** - Change priority on all selected tasks
  - **Archive** - Archive all selected tasks
  - **Delete** - Delete all selected tasks
- Selection count display with clear button
- Selection mode styling with highlighted selected tasks

### Changed
- Upgraded to @brainfile/core@^0.7.0 with bulk operation support
- TaskCard shows checkbox instead of drag handle in selection mode

## [0.8.0] - 2025-11-23

### 🎨 Complete UI Rewrite

The entire webview has been rebuilt from scratch using **Vue 3 + Vite + Pinia**, replacing thousands of lines of inline HTML generation with a modern reactive SPA architecture.

### Added

#### Send to Agent
- **One-click task dispatch** to AI coding assistants directly from task cards
- Support for **GitHub Copilot** (native VS Code chat API)
- Support for **Claude Code** (VS Code extension API)
- **Copy to Clipboard** fallback for unsupported agents
- Split button UI with dropdown for agent selection
- Persists last-used agent preference per workspace
- Manifest-driven provider system for easy extension

#### Column Sorting
- **Per-column sort controls** in column headers
- Sort options: Manual (default), Priority, Due Date, Effort, Title A-Z
- Sort state is UI-only (doesn't modify brainfile.md)
- Visual indicator shows active sort mode

#### Quick Action Buttons
- **Check button** (✓) on task cards to mark complete
- **Archive button** on completed tasks
- **Play button** (▶) to send task to AI agent
- Buttons appear on hover, minimalist design

#### Dynamic Stat Cards
- Stat cards now respect `statsConfig.columns` from brainfile.md
- Configure which columns appear in header stats (max 4)
- Falls back to sensible defaults if not configured

#### Fixed Header Layout
- Header and search/filter controls stay fixed at top
- Only the board columns scroll beneath
- Better UX for large task boards

#### Vue 3 Architecture
- Complete SPA with Vue 3 Composition API
- Pinia store for centralized state management
- VS Code messaging composable for extension communication
- Vite build with hashed assets and manifest-driven loading
- Component library: BoardHeader, Column, TaskCard, SearchFilter, RulesPanel, ArchivePanel

#### Improved Drag & Drop
- Uses vuedraggable library for smooth drag interactions
- Drag handle on task rows
- Click-to-expand still works on task content
- Visual feedback during drag operations

#### Modern Icons
- Lucide icon library for consistent, crisp icons
- Chevrons, plus, check, archive, play, and more

### Changed
- **Webview architecture**: Inline HTML generation → Vue SPA with hot module replacement
- **State management**: Direct DOM manipulation → Reactive Pinia store
- **Styling**: Inline styles → Scoped CSS with VS Code theme variables
- **Message handling**: Callback soup → Typed message protocol
- Build pipeline runs `webview:build` before `compile`/`package`
- `.vscodeignore` excludes webview source files from VSIX

### Fixed
- Drag-and-drop event bubbling causing incorrect task positioning
- Real-time updates when editing via CodeLens
- Task expansion/collapse state preservation
- Priority label click handling

## [0.7.4] - 2025-11-22

### Added
- Jest test framework with 230 passing tests across 12 test suites
- Modular board architecture under `src/board/`:
  - `types.ts` - Centralized type definitions and type guards
  - `messages.ts` - Message constants and validation
  - `html/` - Extracted HTML generation (utils, styles, stats, error)
  - `agents/` - AI prompt builder for copilot/cursor/claude-code
  - `data/` - Pure board operations (archive, taskId, boardOperations)
  - `handlers/` - Message router for dispatch
  - `orchestrator.ts` - File I/O coordination

### Changed
- Refactored boardViewProvider.ts from 4,983 lines to modular components
- Board operations are now pure functions with immutable updates
- Improved testability with VS Code-agnostic modules

## [0.7.2] - 2025-11-21

### Fixed
- Simplified update mechanism to use reliable full HTML refresh
- Removed experimental postMessage update path that caused real-time update failures

## [0.7.1] - 2025-11-21

### Fixed
- Fixed drag-and-drop event bubbling causing tasks to move to wrong position
- Fixed CodeLens actions not updating file in editor in real-time
- Fixed archive button not updating board view immediately
- Fixed priority label click handler not working

### Changed
- Added Output channel logging for debugging
- Improved error handling in webview message handler

## [0.6.0] - 2025-11-20

### Added
- **"Fix Issues" button** on error pages with integrated linter from @brainfile/core
- Auto-fix capability for common YAML syntax errors
- Preview changes before applying fixes (diff editor)
- Detailed issue list showing fixable problems with line numbers
- Refresh button on error pages
- Better error messages with actionable guidance

### Changed
- Upgraded to @brainfile/core@^0.3.0 with integrated linter
- Enhanced error page UI with modern styling
- Improved parse error handling with lint diagnostics

### Fixed
- Parse errors now show specific issues and fix suggestions
- Better error recovery with automatic consolidation of duplicate columns

## [0.5.0] - 2024-12-01

### Added
- Stats configuration editor in Rules view
- Support for configuring displayed columns in stats section
- Visual column selector with max 4 columns

### Changed
- Improved Rules view with better organization
- Updated to @brainfile/core with duplicate column consolidation

## [0.4.5] - 2024-11-20

### Changed
- Updated documentation with links to new documentation site at brainfile.md
- Improved README with better formatting and clearer instructions
- Added LICENSE file (MIT)
- Added SUPPORT.md with community resources
- Enhanced package.json metadata for better Marketplace presentation

## [0.4.4] - 2024-11-20

### Added
- Task template support (Bug Report, Feature Request, Refactor)
- Command palette command: "Brainfile: Create Task from Template"
- UI button for creating tasks from templates
- Template variable substitution
- Pre-configured subtasks for each template type

### Changed
- Improved task creation workflow
- Better UI organization with template options

## [0.4.0] - 2024-11-15

### Added
- Visual kanban board interface
- Drag and drop task management
- Live file watching and auto-refresh
- Collapsible task sections
- Progress tracking with subtasks
- Task priority indicators
- Tag display and filtering

### Changed
- Migrated to @brainfile/core for parsing and serialization
- Improved performance with better file watching
- Enhanced UI with better styling

### Fixed
- Task ordering preservation
- YAML parsing edge cases
- File sync issues

## [0.3.0] - 2024-11-01

### Added
- Initial release
- Basic task board visualization
- Support for brainfile.md files
- Sidebar view integration
- Task viewing and basic editing

[0.4.5]: https://github.com/brainfile/vscode/compare/v0.4.4...v0.4.5
[0.4.4]: https://github.com/brainfile/vscode/compare/v0.4.0...v0.4.4
[0.4.0]: https://github.com/brainfile/vscode/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/brainfile/vscode/releases/tag/v0.3.0
