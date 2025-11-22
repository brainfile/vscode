module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/__tests__/**",
    // Exclude VS Code-dependent files from coverage for now
    "!src/extension.ts",
    "!src/boardViewProvider.ts",
    "!src/codeLensProvider.ts",
    "!src/completionProvider.ts",
    "!src/hoverProvider.ts",
  ],
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
      },
    ],
  },
  // Mock vscode module for unit tests
  moduleNameMapper: {
    "^vscode$": "<rootDir>/src/__tests__/__mocks__/vscode.ts",
  },
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
  verbose: true,
};
