# AI Agent Extension Integration Research

## Summary

This document details how to integrate with various AI coding assistants in VS Code using a **command-based discovery** approach for maximum maintainability.

## Architecture: Manifest-Driven Providers

Instead of hardcoded adapters, we use a declarative manifest (`providers.ts`) that defines:
- Extension ID for detection
- VS Code commands (openWithPrompt, addToContext, newTask, focusInput)
- Fallback strategies (command → clipboard)

See `providers.ts` for the full manifest. To add a new agent, add an entry there.

---

## Command Categories

### 1. Native VS Code Chat (`openWithPrompt`)
Extensions using VS Code's built-in chat panel respond to standard commands:

```typescript
// Opens chat with prompt as argument
workbench.action.chat.open        // string | IChatViewOpenOptions
workbench.action.chat.newChat     // Starts new session
workbench.action.chat.submit      // Submits current input
```

**Supported by:** GitHub Copilot, Cursor

### 2. Context Menu Commands (`addToContext`)
Cline-family extensions add selected text to their chat context:

```typescript
cline.addToChat              // Add selection to Cline
kilo-code.addToContextAndFocus  // Add selection + focus input
roo-cline.addToChat          // Add selection to Roo Code
```

**Strategy:** Create temp document with prompt → select all → execute command

### 3. Focus + Paste Commands
For extensions without direct prompt support:

```typescript
cline.plusButtonClicked      // New task
cline.focusChatInput         // Focus input field
// Then: clipboard paste
```

---

## Provider Reference

### GitHub Copilot
| Field | Value |
|-------|-------|
| Extension ID | `github.copilot-chat` |
| Commands | `workbench.action.chat.open`, `workbench.action.chat.newChat` |
| Method | `openWithPrompt` - accepts prompt string |

### Cursor
| Field | Value |
|-------|-------|
| Detection | `vscode.env.appName.includes('cursor')` |
| Commands | Same as Copilot |
| Method | `openWithPrompt` |

### Cline
| Field | Value |
|-------|-------|
| Extension ID | `saoudrizwan.claude-dev` |
| Commands | `cline.addToChat`, `cline.plusButtonClicked`, `cline.focusChatInput` |
| Method | `addToContext` (requires temp document) |

Full command list:
- `cline.plusButtonClicked` - New Task
- `cline.addToChat` - Add selected text to Cline
- `cline.focusChatInput` - Jump to Chat Input
- `cline.explainCode` - Explain with Cline
- `cline.improveCode` - Improve with Cline

### Roo Code
| Field | Value |
|-------|-------|
| Extension ID | `RooVeterinaryInc.roo-cline` |
| Commands | `roo-cline.addToChat`, `roo-cline.plusButtonClicked`, `roo-cline.focusChatInput` |
| Method | `addToContext` (requires temp document) |

**Note:** Roo Code also exposes a full API via `extension.exports`:
```typescript
const api = vscode.extensions.getExtension('RooVeterinaryInc.roo-cline')?.exports;
await api.startNewTask("Your prompt");
await api.sendMessage("Follow-up");
```

### Kilo Code
| Field | Value |
|-------|-------|
| Extension ID | `kilocode.kilo-code` |
| Commands | `kilo-code.addToContextAndFocus`, `kilo-code.newTask`, `kilo-code.focusChatInput` |
| Method | `addToContext` (requires temp document) |

Full command list:
- `kilo-code.addToContext` - Add selection to context
- `kilo-code.addToContextAndFocus` - Add + focus input
- `kilo-code.newTask` - New task from selection
- `kilo-code.explainCode` - Explain code
- `kilo-code.fixCode` - Fix errors
- `kilo-code.improveCode` - Improve code

**Note:** Kilo Code also exposes API via `extension.activate()`:
```typescript
const api = await vscode.extensions.getExtension('kilocode.kilo-code')?.activate();
await api.startNewTask({ text: "Your prompt" });
```

### Claude Code
| Field | Value |
|-------|-------|
| Extension ID | `anthropic.claude-code` |
| Commands | `claude-vscode.editor.open`, `claude-vscode.focus` |
| Method | Focus + paste, terminal fallback |

### Continue
| Field | Value |
|-------|-------|
| Extension ID | `continue.continue` |
| Commands | `continue.focusContinueInput` |
| Method | Focus + paste |

---

## Integration Strategy

```typescript
// 1. Try native chat (Copilot, Cursor)
if (provider.commands.openWithPrompt) {
  await vscode.commands.executeCommand(provider.commands.openWithPrompt, prompt);
}

// 2. Try addToContext (Cline family)
else if (provider.commands.addToContext) {
  // Create temp doc → select all → execute command → close doc
  const doc = await vscode.workspace.openTextDocument({ content: prompt });
  const editor = await vscode.window.showTextDocument(doc);
  editor.selection = new vscode.Selection(/* full range */);
  await vscode.commands.executeCommand(provider.commands.addToContext);
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
}

// 3. Fallback: focus + paste
else {
  await vscode.env.clipboard.writeText(prompt);
  if (provider.commands.newTask) await vscode.commands.executeCommand(provider.commands.newTask);
  if (provider.commands.focusInput) await vscode.commands.executeCommand(provider.commands.focusInput);
  // User pastes manually or we try editor.action.clipboardPasteAction
}
```

---

## Adding New Agents

To add support for a new AI agent:

1. Find the extension ID on the VS Code Marketplace
2. Discover commands: `vscode.commands.getCommands()` or check extension's `package.json`
3. Add entry to `AGENT_PROVIDERS` in `providers.ts`:

```typescript
{
  id: 'new-agent',
  label: 'New Agent',
  extensionId: 'publisher.extension-id',
  priority: 2,
  commands: {
    addToContext: 'new-agent.addToChat',  // or openWithPrompt, etc.
    newTask: 'new-agent.newTask',
    focusInput: 'new-agent.focusInput',
  },
  needsTempDocument: true,  // if using addToContext
  focusDelay: 200,
}
```

---

## Sources

- [Cline GitHub](https://github.com/cline/cline)
- [Roo Code External API](https://docs.roocode.com)
- [Kilo Code Docs](https://kilocode.ai/docs)
- [VS Code Commands API](https://code.visualstudio.com/api/references/commands)
- [VS Code Chat Extensions](https://code.visualstudio.com/api/extension-guides/ai/chat)
