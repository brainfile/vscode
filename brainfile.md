---
title: My Project
schema: https://brainfile.md/v1/board.json
agent:
  instructions:
    - Use the Brainfile mcp tool
    - If no MCP, then modify only the YAML frontmatter
    - Use task-[number] format for task IDs
    - Preserve all IDs
    - Preserve unknown fields
    - Use description for overview, subtasks for step-by-step instructions
    - Use relatedFiles to link relevant files to tasks
rules:
  always:
    - id: 1
      rule: Prioritize VS Code API for native integration and performance.
    - id: 2
      rule: Follow VS Code UI/UX guidelines for a consistent user experience.
    - id: 3
      rule: Ensure cross-platform compatibility (Windows, macOS, Linux).
  never:
    - id: 1
      rule: Introduce blocking operations on the UI thread.
    - id: 2
      rule: Bundle large, unnecessary dependencies.
    - id: 3
      rule: Store sensitive user data without explicit consent and encryption.
  prefer:
    - id: 1
      rule: Use Webview UI Toolkit components over custom CSS/HTML for Webviews.
    - id: 2
      rule: Leverage existing VS Code commands and contributions points rather than custom implementations.
    - id: 3
      rule: Write comprehensive unit and integration tests for all features.
  context:
    - id: 1
      rule: The extension aims to enhance developer productivity within the VS Code ecosystem.
    - id: 2
      rule: Performance and resource efficiency are critical for a positive user experience.
    - id: 3
      rule: The extension targets a global audience, requiring internationalization considerations.
columns:
  - id: todo
    title: To Do
    tasks: []
  - id: in-progress
    title: In Progress
    tasks: []
  - id: done
    title: Done
    tasks:
      - id: task-26
        title: Modernize Webview UI & Align with VS Code Design
        description: Comprehensive UI review and refactor to match VS Code's native design language (Webview UI Toolkit guidelines). Focus on minimalist aesthetics, consistent theming (colors, typography, spacing), and replacing custom components with native patterns where possible.
        priority: high
        tags:
          - vscode
          - ui
          - ux
          - design
          - refactor
        relatedFiles:
          - webview-ui/src/styles/vars.css
          - webview-ui/src/styles/main.css
          - webview-ui/src/components/BoardHeader.vue
          - webview-ui/src/App.vue
          - webview-ui/src/components/TaskCard.vue
        subtasks:
          - id: task-26-1
            title: Replace custom gradient in BoardHeader with var(--vscode-progressBar-background)
            completed: true
          - id: task-26-2
            title: Standardize all border radii to 3px (buttons, inputs, cards)
            completed: true
          - id: task-26-3
            title: Refine shadows to be flatter/subtler (use --vscode-widget-shadow or borders)
            completed: true
          - id: task-26-4
            title: Replace custom File Switcher dropdown with native vscode.window.showQuickPick
            completed: true
          - id: task-26-5
            title: Replace custom 'kebab' menus with native context menus or fixed positioning
            completed: true
          - id: task-26-6
            title: Refine Task Card visual noise (remove priority borders, use subtle indicators)
            completed: true
          - id: task-26-7
            title: Review and adjust icon stroke widths (Lucide) or switch to Codicons
            completed: true
          - id: task-26-8
            title: Improve Search input focus ring and add clear button visibility logic
            completed: true
          - id: task-26-9
            title: Refactor store to separate selection/filter logic from data sync
            completed: true
---
