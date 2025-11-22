const api =
  typeof acquireVsCodeApi === "function"
    ? acquireVsCodeApi()
    : {
        postMessage: (_message: unknown) => {
          console.warn("VS Code API unavailable");
        },
        getState: () => undefined,
        setState: (_state: unknown) => {
          console.warn("VS Code API unavailable");
        },
      };

export function useVSCodeApi<T = unknown>() {
  return api as {
    postMessage: (message: unknown) => void;
    getState: () => T | undefined;
    setState: (data: T) => void;
  };
}
