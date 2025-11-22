import {
  updateTask,
  deleteTask,
  moveTask,
  addTask,
  updateBoardTitle,
  toggleSubtask,
  updateStatsConfig,
} from "../boardOperations";
import type { Board } from "@brainfile/core";

describe("board/data/boardOperations", () => {
  const createBoard = (overrides: Partial<Board> = {}): Board => ({
    title: "Test Board",
    columns: [
      {
        id: "todo",
        title: "To Do",
        tasks: [
          { id: "task-1", title: "First", description: "First desc" },
          { id: "task-2", title: "Second", description: "Second desc" },
        ],
      },
      {
        id: "done",
        title: "Done",
        tasks: [{ id: "task-3", title: "Third", description: "" }],
      },
    ],
    ...overrides,
  });

  describe("updateTask", () => {
    it("updates task title and description", () => {
      const board = createBoard();
      const result = updateTask(board, "todo", "task-1", "New Title", "New Desc");

      expect(result.success).toBe(true);
      const task = result.board!.columns[0].tasks[0];
      expect(task.title).toBe("New Title");
      expect(task.description).toBe("New Desc");
    });

    it("does not mutate original board", () => {
      const board = createBoard();
      updateTask(board, "todo", "task-1", "New", "New");

      expect(board.columns[0].tasks[0].title).toBe("First");
    });

    it("returns error for non-existent column", () => {
      const board = createBoard();
      const result = updateTask(board, "invalid", "task-1", "New", "New");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Column invalid not found");
    });

    it("returns error for non-existent task", () => {
      const board = createBoard();
      const result = updateTask(board, "todo", "task-999", "New", "New");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Task task-999 not found");
    });
  });

  describe("deleteTask", () => {
    it("removes task from column", () => {
      const board = createBoard();
      const result = deleteTask(board, "todo", "task-1");

      expect(result.success).toBe(true);
      expect(result.board!.columns[0].tasks).toHaveLength(1);
      expect(result.board!.columns[0].tasks[0].id).toBe("task-2");
    });

    it("does not mutate original board", () => {
      const board = createBoard();
      deleteTask(board, "todo", "task-1");

      expect(board.columns[0].tasks).toHaveLength(2);
    });

    it("returns error for non-existent task", () => {
      const board = createBoard();
      const result = deleteTask(board, "todo", "task-999");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("moveTask", () => {
    it("moves task between columns", () => {
      const board = createBoard();
      const result = moveTask(board, "task-1", "todo", "done", 0);

      expect(result.success).toBe(true);
      expect(result.board!.columns[0].tasks).toHaveLength(1); // todo now has 1
      expect(result.board!.columns[1].tasks).toHaveLength(2); // done now has 2
      expect(result.board!.columns[1].tasks[0].id).toBe("task-1");
    });

    it("moves task to specific index", () => {
      const board = createBoard();
      const result = moveTask(board, "task-1", "todo", "done", 1);

      expect(result.success).toBe(true);
      expect(result.board!.columns[1].tasks[1].id).toBe("task-1");
    });

    it("reorders within same column", () => {
      const board = createBoard();
      const result = moveTask(board, "task-2", "todo", "todo", 0);

      expect(result.success).toBe(true);
      expect(result.board!.columns[0].tasks[0].id).toBe("task-2");
      expect(result.board!.columns[0].tasks[1].id).toBe("task-1");
    });

    it("does not mutate original board", () => {
      const board = createBoard();
      moveTask(board, "task-1", "todo", "done", 0);

      expect(board.columns[0].tasks).toHaveLength(2);
      expect(board.columns[1].tasks).toHaveLength(1);
    });

    it("returns error for non-existent source column", () => {
      const board = createBoard();
      const result = moveTask(board, "task-1", "invalid", "done", 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Source column");
    });

    it("returns error for non-existent target column", () => {
      const board = createBoard();
      const result = moveTask(board, "task-1", "todo", "invalid", 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Target column");
    });

    it("returns error for non-existent task", () => {
      const board = createBoard();
      const result = moveTask(board, "task-999", "todo", "done", 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("addTask", () => {
    it("adds task to column", () => {
      const board = createBoard();
      const result = addTask(board, "todo", "New Task", "New description");

      expect(result.success).toBe(true);
      expect(result.board!.columns[0].tasks).toHaveLength(3);
      const newTask = result.board!.columns[0].tasks[2];
      expect(newTask.title).toBe("New Task");
      expect(newTask.description).toBe("New description");
    });

    it("generates sequential task ID", () => {
      const board = createBoard();
      const result = addTask(board, "todo", "New Task");

      // Highest existing is task-3, so new should be task-4
      expect(result.board!.columns[0].tasks[2].id).toBe("task-4");
    });

    it("trims title and description", () => {
      const board = createBoard();
      const result = addTask(board, "todo", "  Padded Title  ", "  Padded Desc  ");

      const newTask = result.board!.columns[0].tasks[2];
      expect(newTask.title).toBe("Padded Title");
      expect(newTask.description).toBe("Padded Desc");
    });

    it("returns error for non-existent column", () => {
      const board = createBoard();
      const result = addTask(board, "invalid", "New Task");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Column invalid not found");
    });
  });

  describe("updateBoardTitle", () => {
    it("updates board title", () => {
      const board = createBoard();
      const result = updateBoardTitle(board, "New Board Title");

      expect(result.success).toBe(true);
      expect(result.board!.title).toBe("New Board Title");
    });

    it("does not mutate original board", () => {
      const board = createBoard();
      updateBoardTitle(board, "New Title");

      expect(board.title).toBe("Test Board");
    });
  });

  describe("toggleSubtask", () => {
    it("toggles subtask completion", () => {
      const board = createBoard({
        columns: [
          {
            id: "todo",
            title: "To Do",
            tasks: [
              {
                id: "task-1",
                title: "Task with subtasks",
                subtasks: [
                  { id: "st-1", title: "Subtask 1", completed: false },
                  { id: "st-2", title: "Subtask 2", completed: true },
                ],
              },
            ],
          },
        ],
      });

      const result = toggleSubtask(board, "task-1", "st-1");

      expect(result.success).toBe(true);
      expect(result.board!.columns[0].tasks[0].subtasks![0].completed).toBe(true);
    });

    it("toggles completed to incomplete", () => {
      const board = createBoard({
        columns: [
          {
            id: "todo",
            title: "To Do",
            tasks: [
              {
                id: "task-1",
                title: "Task",
                subtasks: [{ id: "st-1", title: "Done", completed: true }],
              },
            ],
          },
        ],
      });

      const result = toggleSubtask(board, "task-1", "st-1");
      expect(result.board!.columns[0].tasks[0].subtasks![0].completed).toBe(false);
    });

    it("returns error for task without subtasks", () => {
      const board = createBoard();
      const result = toggleSubtask(board, "task-1", "st-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("no subtasks");
    });

    it("returns error for non-existent subtask", () => {
      const board = createBoard({
        columns: [
          {
            id: "todo",
            title: "To Do",
            tasks: [
              {
                id: "task-1",
                title: "Task",
                subtasks: [{ id: "st-1", title: "Sub", completed: false }],
              },
            ],
          },
        ],
      });

      const result = toggleSubtask(board, "task-1", "st-999");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Subtask st-999 not found");
    });
  });

  describe("updateStatsConfig", () => {
    it("sets stats columns", () => {
      const board = createBoard();
      const result = updateStatsConfig(board, ["todo", "done"]);

      expect(result.success).toBe(true);
      expect(result.board!.statsConfig?.columns).toEqual(["todo", "done"]);
    });

    it("replaces existing config", () => {
      const board = createBoard({
        statsConfig: { columns: ["old"] },
      });
      const result = updateStatsConfig(board, ["new1", "new2"]);

      expect(result.board!.statsConfig?.columns).toEqual(["new1", "new2"]);
    });
  });
});
