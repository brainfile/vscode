# Changelog

All notable changes to the Brainfile VSCode extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

