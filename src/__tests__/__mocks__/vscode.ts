/**
 * Mock VS Code API for unit testing
 * Only includes what's needed for board module tests
 */

export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: "file" }),
  parse: (str: string) => ({ fsPath: str, scheme: "file" }),
};

export const workspace = {
  workspaceFolders: undefined as { uri: { fsPath: string } }[] | undefined,
  getConfiguration: jest.fn(() => ({
    get: jest.fn(),
    update: jest.fn(),
  })),
  fs: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
  },
  textDocuments: [] as unknown[],
  onDidChangeTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
  onDidChangeConfiguration: jest.fn(() => ({ dispose: jest.fn() })),
  createFileSystemWatcher: jest.fn(() => ({
    onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
    onDidCreate: jest.fn(() => ({ dispose: jest.fn() })),
    onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
    dispose: jest.fn(),
  })),
  getWorkspaceFolder: jest.fn(),
};

export const window = {
  showInformationMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showInputBox: jest.fn(),
  showQuickPick: jest.fn(),
  visibleTextEditors: [] as unknown[],
  showTextDocument: jest.fn(),
  createOutputChannel: jest.fn(() => ({
    appendLine: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
  })),
};

export const commands = {
  executeCommand: jest.fn(),
  registerCommand: jest.fn(),
};

export const extensions = {
  getExtension: jest.fn(),
};

export const env = {
  appName: "Visual Studio Code",
  clipboard: {
    writeText: jest.fn(),
  },
};

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
}

export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  constructor(public start: Position, public end: Position) {}
}

export class Selection extends Range {
  constructor(anchor: Position, active: Position) {
    super(anchor, active);
  }
}

export enum TextEditorRevealType {
  Default = 0,
  InCenter = 1,
  InCenterIfOutsideViewport = 2,
  AtTop = 3,
}

export class RelativePattern {
  constructor(public base: string, public pattern: string) {}
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}
