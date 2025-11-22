# Brainfile Webview (Vue + Vite)

This package hosts the Vue 3 + Pinia frontend for the Brainfile VS Code webview. The build output is emitted to `../media/webview` and loaded by `boardViewProvider.ts` via the Vite manifest.

## Commands

- `npm run dev` – optional local preview of the webview UI
- `npm run build` – type-check (`vue-tsc`) then bundle to `../media/webview` (triggered automatically by the root scripts)

The UI relies on `@brainfile/core` types for board data and communicates with the extension through the VS Code webview messaging API (`useVSCodeApi` composable).
