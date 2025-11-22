import {
  getArchivePath,
  parseArchive,
  createEmptyArchiveBoard,
  addTaskToArchive,
  loadArchiveIntoBoard,
} from "../archive";
import type { Board, Task } from "@brainfile/core";

describe("board/data/archive", () => {
  describe("getArchivePath", () => {
    it("converts brainfile.md to brainfile-archive.md", () => {
      const result = getArchivePath("/project/brainfile.md", "/project");
      expect(result).toBe("/project/brainfile-archive.md");
    });

    it("handles hidden brainfile", () => {
      const result = getArchivePath("/project/.brainfile.md", "/project");
      expect(result).toBe("/project/.brainfile-archive.md");
    });

    it("handles nested paths", () => {
      const result = getArchivePath("/project/docs/brainfile.md", "/project");
      expect(result).toBe("/project/brainfile-archive.md");
    });

    it("handles custom names", () => {
      const result = getArchivePath("/project/tasks.md", "/project");
      expect(result).toBe("/project/tasks-archive.md");
    });
  });

  describe("parseArchive", () => {
    it("parses valid archive content", () => {
      const content = `---
title: Archive
archive:
  - id: task-1
    title: Old task
  - id: task-2
    title: Another old task
---`;
      const result = parseArchive(content);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("task-1");
      expect(result[1].id).toBe("task-2");
    });

    it("returns empty array for invalid content", () => {
      const result = parseArchive("not valid yaml");
      expect(result).toEqual([]);
    });

    it("returns empty array for content without archive", () => {
      const content = `---
title: No Archive
columns: []
---`;
      const result = parseArchive(content);
      expect(result).toEqual([]);
    });

    it("returns empty array for empty archive", () => {
      const content = `---
title: Empty Archive
archive: []
---`;
      const result = parseArchive(content);
      expect(result).toEqual([]);
    });
  });

  describe("createEmptyArchiveBoard", () => {
    it("creates board with default title", () => {
      const board = createEmptyArchiveBoard();
      expect(board.title).toBe("Archive");
      expect(board.columns).toEqual([]);
      expect(board.archive).toEqual([]);
    });

    it("creates board with custom title", () => {
      const board = createEmptyArchiveBoard("My Archive");
      expect(board.title).toBe("My Archive");
    });
  });

  describe("addTaskToArchive", () => {
    it("adds task to empty archive", () => {
      const board = createEmptyArchiveBoard();
      const task: Task = { id: "task-1", title: "Archived task" };

      const result = addTaskToArchive(board, task);

      expect(result.archive).toHaveLength(1);
      expect(result.archive![0].id).toBe("task-1");
    });

    it("appends task to existing archive", () => {
      const board: Board = {
        title: "Archive",
        columns: [],
        archive: [{ id: "task-1", title: "First" }],
      };
      const task: Task = { id: "task-2", title: "Second" };

      const result = addTaskToArchive(board, task);

      expect(result.archive).toHaveLength(2);
      expect(result.archive![1].id).toBe("task-2");
    });

    it("does not mutate original board", () => {
      const board = createEmptyArchiveBoard();
      const task: Task = { id: "task-1", title: "Test" };

      addTaskToArchive(board, task);

      expect(board.archive).toEqual([]);
    });

    it("handles board with undefined archive", () => {
      const board: Board = { title: "Test", columns: [] };
      const task: Task = { id: "task-1", title: "Test" };

      const result = addTaskToArchive(board, task);

      expect(result.archive).toHaveLength(1);
    });
  });

  describe("loadArchiveIntoBoard", () => {
    it("loads tasks into board archive", () => {
      const board: Board = {
        title: "My Board",
        columns: [{ id: "todo", title: "To Do", tasks: [] }],
      };
      const archivedTasks: Task[] = [
        { id: "task-old-1", title: "Old 1" },
        { id: "task-old-2", title: "Old 2" },
      ];

      const result = loadArchiveIntoBoard(board, archivedTasks);

      expect(result.archive).toHaveLength(2);
      expect(result.title).toBe("My Board");
      expect(result.columns).toHaveLength(1);
    });

    it("replaces existing archive", () => {
      const board: Board = {
        title: "Test",
        columns: [],
        archive: [{ id: "existing", title: "Existing" }],
      };
      const newTasks: Task[] = [{ id: "new", title: "New" }];

      const result = loadArchiveIntoBoard(board, newTasks);

      expect(result.archive).toHaveLength(1);
      expect(result.archive![0].id).toBe("new");
    });

    it("does not mutate original board", () => {
      const board: Board = { title: "Test", columns: [] };
      const tasks: Task[] = [{ id: "task-1", title: "Test" }];

      loadArchiveIntoBoard(board, tasks);

      expect(board.archive).toBeUndefined();
    });
  });
});
