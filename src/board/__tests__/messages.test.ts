import {
  WEBVIEW_MESSAGE_TYPES,
  EXTENSION_MESSAGE_TYPES,
  getMessageType,
  isMessageType,
  validateMessage,
  getMissingFields,
  createParseWarningMessage,
} from "../messages";
import type { WebviewToExtensionMessage } from "../types";

describe("board/messages", () => {
  describe("WEBVIEW_MESSAGE_TYPES", () => {
    it("contains all expected message types", () => {
      expect(WEBVIEW_MESSAGE_TYPES.UPDATE_TASK).toBe("updateTask");
      expect(WEBVIEW_MESSAGE_TYPES.MOVE_TASK).toBe("moveTask");
      expect(WEBVIEW_MESSAGE_TYPES.DELETE_TASK).toBe("deleteTask");
      expect(WEBVIEW_MESSAGE_TYPES.SEND_TO_AGENT).toBe("sendToAgent");
    });

    it("has 21 message types", () => {
      expect(Object.keys(WEBVIEW_MESSAGE_TYPES)).toHaveLength(21);
    });
  });

  describe("EXTENSION_MESSAGE_TYPES", () => {
    it("contains outgoing message types", () => {
      expect(EXTENSION_MESSAGE_TYPES.AGENTS_DETECTED).toBe("agentsDetected");
      expect(EXTENSION_MESSAGE_TYPES.PARSE_WARNING).toBe("parseWarning");
      expect(EXTENSION_MESSAGE_TYPES.BOARD_UPDATE).toBe("boardUpdate");
    });
  });

  describe("getMessageType", () => {
    it("extracts type from message", () => {
      const msg: WebviewToExtensionMessage = { type: "refresh" };
      expect(getMessageType(msg)).toBe("refresh");
    });
  });

  describe("isMessageType", () => {
    it("returns true for matching type", () => {
      const msg: WebviewToExtensionMessage = {
        type: "moveTask",
        taskId: "task-1",
        fromColumn: "todo",
        toColumn: "done",
        toIndex: 0,
      };
      expect(isMessageType(msg, "moveTask")).toBe(true);
    });

    it("returns false for non-matching type", () => {
      const msg: WebviewToExtensionMessage = { type: "refresh" };
      expect(isMessageType(msg, "moveTask")).toBe(false);
    });

    it("narrows type correctly", () => {
      const msg: WebviewToExtensionMessage = {
        type: "deleteTask",
        columnId: "todo",
        taskId: "task-1",
      };

      if (isMessageType(msg, "deleteTask")) {
        // TypeScript should know these fields exist
        expect(msg.columnId).toBe("todo");
        expect(msg.taskId).toBe("task-1");
      }
    });
  });

  describe("validateMessage", () => {
    it("returns true for valid messages", () => {
      expect(validateMessage({ type: "refresh" })).toBe(true);
      expect(validateMessage({ type: "clearCache" })).toBe(true);
      expect(validateMessage({ type: "moveTask", taskId: "t1", fromColumn: "a", toColumn: "b", toIndex: 0 })).toBe(true);
    });

    it("returns false for null/undefined", () => {
      expect(validateMessage(null)).toBe(false);
      expect(validateMessage(undefined)).toBe(false);
    });

    it("returns false for non-objects", () => {
      expect(validateMessage("refresh")).toBe(false);
      expect(validateMessage(123)).toBe(false);
      expect(validateMessage([])).toBe(false);
    });

    it("returns false for missing type", () => {
      expect(validateMessage({})).toBe(false);
      expect(validateMessage({ columnId: "todo" })).toBe(false);
    });

    it("returns false for unknown message types", () => {
      expect(validateMessage({ type: "unknownType" })).toBe(false);
      expect(validateMessage({ type: "REFRESH" })).toBe(false); // case sensitive
    });
  });

  describe("getMissingFields", () => {
    it("returns empty array for complete messages", () => {
      const msg: WebviewToExtensionMessage = { type: "refresh" };
      expect(getMissingFields(msg)).toEqual([]);
    });

    it("returns empty array for messages with no required fields", () => {
      expect(getMissingFields({ type: "clearCache" })).toEqual([]);
      expect(getMissingFields({ type: "openSettings" })).toEqual([]);
      expect(getMissingFields({ type: "fix-issues" })).toEqual([]);
      expect(getMissingFields({ type: "getAvailableAgents" })).toEqual([]);
    });

    it("identifies missing fields for updateTask", () => {
      const incomplete = { type: "updateTask" } as WebviewToExtensionMessage;
      const missing = getMissingFields(incomplete);
      expect(missing).toContain("columnId");
      expect(missing).toContain("taskId");
      expect(missing).toContain("title");
      expect(missing).toContain("description");
    });

    it("identifies missing fields for moveTask", () => {
      const incomplete = { type: "moveTask", taskId: "task-1" } as WebviewToExtensionMessage;
      const missing = getMissingFields(incomplete);
      expect(missing).toContain("fromColumn");
      expect(missing).toContain("toColumn");
      expect(missing).toContain("toIndex");
      expect(missing).not.toContain("taskId");
    });

    it("identifies missing fields for deleteTask", () => {
      const incomplete = { type: "deleteTask", columnId: "todo" } as WebviewToExtensionMessage;
      const missing = getMissingFields(incomplete);
      expect(missing).toContain("taskId");
      expect(missing).not.toContain("columnId");
    });

    it("identifies missing fields for toggleSubtask", () => {
      const incomplete = { type: "toggleSubtask" } as WebviewToExtensionMessage;
      const missing = getMissingFields(incomplete);
      expect(missing).toContain("taskId");
      expect(missing).toContain("subtaskId");
    });

    it("identifies missing fields for rule operations", () => {
      const addRule = { type: "addRule" } as WebviewToExtensionMessage;
      expect(getMissingFields(addRule)).toContain("ruleType");

      const editRule = { type: "editRule", ruleType: "always" } as WebviewToExtensionMessage;
      expect(getMissingFields(editRule)).toContain("ruleId");
    });
  });

  describe("createParseWarningMessage", () => {
    it("creates a valid parse warning message", () => {
      const msg = createParseWarningMessage("Syntax error on line 5");
      expect(msg.type).toBe("parseWarning");
      expect(msg).toHaveProperty("message", "Syntax error on line 5");
    });
  });
});
