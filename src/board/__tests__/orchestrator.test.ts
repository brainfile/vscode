import * as fs from "fs";
import {
  readBoardFromDisk,
  writeBoardToDisk,
  hashContent,
  lintBrainfile,
  processMessage,
  generateErrorPage,
  BoardQueries,
} from "../orchestrator";
import type { Board } from "@brainfile/core";

// Mock fs
jest.mock("fs");
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock @brainfile/core
jest.mock("@brainfile/core", () => ({
  BrainfileParser: {
    parse: jest.fn(),
  },
  BrainfileSerializer: {
    serialize: jest.fn(),
  },
  BrainfileLinter: {
    lint: jest.fn().mockReturnValue({ valid: true, issues: [] }),
  },
}));

import { BrainfileParser, BrainfileSerializer } from "@brainfile/core";

describe("board/orchestrator", () => {
  const testBoard: Board = {
    title: "Test Board",
    columns: [
      {
        id: "todo",
        title: "To Do",
        tasks: [{ id: "task-1", title: "First", description: "desc" }],
      },
      {
        id: "done",
        title: "Done",
        tasks: [],
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("readBoardFromDisk", () => {
    it("reads and parses a brainfile successfully", () => {
      mockFs.readFileSync.mockReturnValue("content");
      (BrainfileParser.parse as jest.Mock).mockReturnValue(testBoard);

      const result = readBoardFromDisk("/path/to/brainfile.md");

      expect(result.success).toBe(true);
      expect(result.board).toEqual(testBoard);
      expect(mockFs.readFileSync).toHaveBeenCalledWith(
        "/path/to/brainfile.md",
        "utf8"
      );
    });

    it("returns error when file read fails", () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error("File not found");
      });

      const result = readBoardFromDisk("/path/to/missing.md");

      expect(result.success).toBe(false);
      expect(result.error).toBe("File not found");
    });

    it("returns error when parse fails", () => {
      mockFs.readFileSync.mockReturnValue("content");
      (BrainfileParser.parse as jest.Mock).mockReturnValue(null);

      const result = readBoardFromDisk("/path/to/invalid.md");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to parse brainfile");
    });
  });

  describe("writeBoardToDisk", () => {
    it("serializes and writes board successfully", () => {
      (BrainfileSerializer.serialize as jest.Mock).mockReturnValue(
        "serialized content"
      );
      mockFs.writeFileSync.mockImplementation(() => {});

      const result = writeBoardToDisk("/path/to/brainfile.md", testBoard);

      expect(result.success).toBe(true);
      expect(BrainfileSerializer.serialize).toHaveBeenCalledWith(testBoard);
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        "/path/to/brainfile.md",
        "serialized content",
        "utf8"
      );
    });

    it("returns error when write fails", () => {
      (BrainfileSerializer.serialize as jest.Mock).mockReturnValue("content");
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error("Permission denied");
      });

      const result = writeBoardToDisk("/path/to/readonly.md", testBoard);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Permission denied");
    });
  });

  describe("hashContent", () => {
    it("generates consistent hash for same content", () => {
      const content = "test content";
      const hash1 = hashContent(content);
      const hash2 = hashContent(content);

      expect(hash1).toBe(hash2);
    });

    it("generates different hash for different content", () => {
      const hash1 = hashContent("content a");
      const hash2 = hashContent("content b");

      expect(hash1).not.toBe(hash2);
    });

    it("returns string hash", () => {
      const hash = hashContent("test");
      expect(typeof hash).toBe("string");
    });
  });

  describe("processMessage", () => {
    it("routes updateTask message and returns result", () => {
      const message = {
        type: "updateTask",
        columnId: "todo",
        taskId: "task-1",
        title: "New Title",
        description: "New Desc",
      };

      const { result, actionName } = processMessage(testBoard, message);

      expect(result.type).toBe("board-updated");
      expect(actionName).toBe("Update Task");
    });

    it("routes external action message", () => {
      const message = {
        type: "editTask",
        taskId: "task-1",
      };

      const { result, actionName } = processMessage(testBoard, message);

      expect(result.type).toBe("external-action");
      expect(actionName).toBe("Edit Task");
    });

    it("returns no-op for unknown message", () => {
      const message = { type: "unknownType" };

      const { result, actionName } = processMessage(testBoard, message);

      expect(result.type).toBe("no-op");
      expect(actionName).toBe("unknownType");
    });
  });

  describe("generateErrorPage", () => {
    it("generates error HTML with message", () => {
      const html = generateErrorPage("Something went wrong");

      expect(html).toContain("Something went wrong");
      expect(html).toContain("<!DOCTYPE html>");
    });

    it("includes details when provided", () => {
      const html = generateErrorPage("Error", undefined, "Detailed info");

      expect(html).toContain("Detailed info");
    });
  });

  describe("BoardQueries", () => {
    it("provides getNextTaskId function", () => {
      const nextId = BoardQueries.getNextTaskId(testBoard);
      expect(nextId).toBe("task-2");
    });

    it("provides findTask function", () => {
      const found = BoardQueries.findTask(testBoard, "task-1");
      expect(found).toBeDefined();
      expect(found?.task.title).toBe("First");
    });

    it("findTask returns undefined for non-existent task", () => {
      const found = BoardQueries.findTask(testBoard, "task-999");
      expect(found).toBeUndefined();
    });
  });
});
