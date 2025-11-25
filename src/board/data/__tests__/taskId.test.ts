import {
  extractTaskIdNumber,
  getMaxTaskIdNumber,
  generateNextTaskId,
  taskIdExists,
  findTaskById,
  findColumnById,
} from "@brainfile/core";
import type { Board } from "@brainfile/core";

describe("board/data/taskId", () => {
  const createBoard = (overrides: Partial<Board> = {}): Board => ({
    title: "Test Board",
    columns: [
      {
        id: "todo",
        title: "To Do",
        tasks: [
          { id: "task-1", title: "First" },
          { id: "task-5", title: "Fifth" },
        ],
      },
      {
        id: "done",
        title: "Done",
        tasks: [{ id: "task-10", title: "Tenth" }],
      },
    ],
    ...overrides,
  });

  describe("extractTaskIdNumber", () => {
    it("extracts number from standard task ID", () => {
      expect(extractTaskIdNumber("task-1")).toBe(1);
      expect(extractTaskIdNumber("task-42")).toBe(42);
      expect(extractTaskIdNumber("task-999")).toBe(999);
    });

    it("returns 0 for invalid formats", () => {
      expect(extractTaskIdNumber("invalid")).toBe(0);
      expect(extractTaskIdNumber("")).toBe(0);
      expect(extractTaskIdNumber("task-")).toBe(0);
      expect(extractTaskIdNumber("TASK-1")).toBe(0); // case sensitive
    });

    it("extracts first number if multiple patterns", () => {
      expect(extractTaskIdNumber("task-1-task-2")).toBe(1);
    });
  });

  describe("getMaxTaskIdNumber", () => {
    it("finds max across all columns", () => {
      const board = createBoard();
      expect(getMaxTaskIdNumber(board)).toBe(10);
    });

    it("returns 0 for empty board", () => {
      const board = createBoard({ columns: [] });
      expect(getMaxTaskIdNumber(board)).toBe(0);
    });

    it("returns 0 for board with empty columns", () => {
      const board = createBoard({
        columns: [
          { id: "todo", title: "To Do", tasks: [] },
          { id: "done", title: "Done", tasks: [] },
        ],
      });
      expect(getMaxTaskIdNumber(board)).toBe(0);
    });

    it("handles non-standard task IDs", () => {
      const board = createBoard({
        columns: [
          {
            id: "todo",
            title: "To Do",
            tasks: [
              { id: "task-5", title: "Valid" },
              { id: "custom-id", title: "Invalid format" },
            ],
          },
        ],
      });
      expect(getMaxTaskIdNumber(board)).toBe(5);
    });
  });

  describe("generateNextTaskId", () => {
    it("generates next sequential ID", () => {
      const board = createBoard();
      expect(generateNextTaskId(board)).toBe("task-11");
    });

    it("starts at task-1 for empty board", () => {
      const board = createBoard({ columns: [] });
      expect(generateNextTaskId(board)).toBe("task-1");
    });

    it("fills gaps if board has non-sequential IDs", () => {
      const board = createBoard({
        columns: [
          {
            id: "todo",
            title: "To Do",
            tasks: [{ id: "task-100", title: "High ID" }],
          },
        ],
      });
      expect(generateNextTaskId(board)).toBe("task-101");
    });
  });

  describe("taskIdExists", () => {
    it("returns true for existing task", () => {
      const board = createBoard();
      expect(taskIdExists(board, "task-1")).toBe(true);
      expect(taskIdExists(board, "task-10")).toBe(true);
    });

    it("returns false for non-existent task", () => {
      const board = createBoard();
      expect(taskIdExists(board, "task-999")).toBe(false);
      expect(taskIdExists(board, "nonexistent")).toBe(false);
    });

    it("returns false for empty board", () => {
      const board = createBoard({ columns: [] });
      expect(taskIdExists(board, "task-1")).toBe(false);
    });
  });

  describe("findTaskById", () => {
    it("finds task in first column", () => {
      const board = createBoard();
      const result = findTaskById(board, "task-1");

      expect(result).toBeDefined();
      expect(result!.task.id).toBe("task-1");
      expect(result!.column.id).toBe("todo");
      expect(result!.index).toBe(0);
    });

    it("finds task in later column", () => {
      const board = createBoard();
      const result = findTaskById(board, "task-10");

      expect(result).toBeDefined();
      expect(result!.task.id).toBe("task-10");
      expect(result!.column.id).toBe("done");
      expect(result!.index).toBe(0);
    });

    it("finds task with correct index", () => {
      const board = createBoard();
      const result = findTaskById(board, "task-5");

      expect(result).toBeDefined();
      expect(result!.index).toBe(1); // Second task in todo
    });

    it("returns undefined for non-existent task", () => {
      const board = createBoard();
      expect(findTaskById(board, "task-999")).toBeUndefined();
    });
  });

  describe("findColumnById", () => {
    it("finds existing column", () => {
      const board = createBoard();
      const column = findColumnById(board, "todo");

      expect(column).toBeDefined();
      expect(column!.title).toBe("To Do");
    });

    it("returns undefined for non-existent column", () => {
      const board = createBoard();
      expect(findColumnById(board, "nonexistent")).toBeUndefined();
    });

    it("returns undefined for empty board", () => {
      const board = createBoard({ columns: [] });
      expect(findColumnById(board, "todo")).toBeUndefined();
    });
  });
});
