declare function acquireVsCodeApi<T = unknown>(): {
  postMessage: (message: unknown) => void;
  getState: () => T | undefined;
  setState: (data: T) => void;
};
