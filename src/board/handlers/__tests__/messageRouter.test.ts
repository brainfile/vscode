import {
  routeMessage,
  isBoardMutatingMessage,
  getActionName,
  MessageData,
} from "../messageRouter";
import { WEBVIEW_MESSAGE_TYPES } from "../../messages";
import type { Board } from "@brainfile/core";

describe("board/handlers/messageRouter", () => {
  const createBoard = (): Board => ({
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
  });

  describe("routeMessage", () => {
    describe("UPDATE_TASK", () => {
      it("routes to updateTask and returns board-updated", () => {
        const board = createBoard();
        const message: MessageData = {
          type: WEBVIEW_MESSAGE_TYPES.UPDATE_TASK,
          columnId: "todo",
          taskId: "task-1",
          title: "New Title",
          description: "New Desc",
        };

        const result = routeMessage(board, message);

        expect(result.type).toBe("board-updated");
        if (result.type === "board-updated") {
          expect(result.board.columns[0].tasks[0].title).toBe("New Title");
        }
      });

      it("returns error for invalid column", () => {
        const board = createBoard();
        const message: MessageData = {
          type: WEBVIEW_MESSAGE_TYPES.UPDATE_TASK,
          columnId: "invalid",
          taskId: "task-1",
          title: "New",
          description: "",
        };

        const result = routeMessage(board, message);

        expect(result.type).toBe("error");
        if (result.type === "error") {
          expect(result.message).toContain("Column invalid not found");
        }
      });
    });

    describe("DELETE_TASK", () => {
      it("routes to deleteTask and returns board-updated", () => {
        const board = createBoard();
        const message: MessageData = {
          type: WEBVIEW_MESSAGE_TYPES.DELETE_TASK,
          columnId: "todo",
          taskId: "task-1",
        };

        const result = routeMessage(board, message);

        expect(result.type).toBe("board-updated");
        if (result.type === "board-updated") {
          expect(result.board.columns[0].tasks).toHaveLength(1);
        }
      });
    });

    describe("MOVE_TASK", () => {
      it("routes to moveTask and returns board-updated", () => {
        const board = createBoard();
        const message: MessageData = {
          type: WEBVIEW_MESSAGE_TYPES.MOVE_TASK,
          taskId: "task-1",
          fromColumn: "todo",
          toColumn: "done",
          toIndex: 0,
        };

        const result = routeMessage(board, message);

        expect(result.type).toBe("board-updated");
        if (result.type === "board-updated") {
          expect(result.board.columns[0].tasks).toHaveLength(1);
          expect(result.board.columns[1].tasks).toHaveLength(2);
        }
      });
    });

    describe("ADD_TASK_TO_COLUMN", () => {
      it("routes to addTask and returns board-updated", () => {
        const board = createBoard();
        const message: MessageData = {
          type: WEBVIEW_MESSAGE_TYPES.ADD_TASK_TO_COLUMN,
          columnId: "todo",
          title: "New Task",
          description: "Description",
        };

        const result = routeMessage(board, message);

        expect(result.type).toBe("board-updated");
        if (result.type === "board-updated") {
          expect(result.board.columns[0].tasks).toHaveLength(3);
        }
      });
    });

    describe("UPDATE_TITLE", () => {
      it("routes to updateBoardTitle and returns board-updated", () => {
        const board = createBoard();
        const message: MessageData = {
          type: WEBVIEW_MESSAGE_TYPES.UPDATE_TITLE,
          title: "New Board Title",
        };

        const result = routeMessage(board, message);

        expect(result.type).toBe("board-updated");
        if (result.type === "board-updated") {
          expect(result.board.title).toBe("New Board Title");
        }
      });
    });

    describe("TOGGLE_SUBTASK", () => {
      it("routes to toggleSubtask and returns board-updated", () => {
        const board: Board = {
          title: "Test",
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
        };

        const message: MessageData = {
          type: WEBVIEW_MESSAGE_TYPES.TOGGLE_SUBTASK,
          taskId: "task-1",
          subtaskId: "st-1",
        };

        const result = routeMessage(board, message);

        expect(result.type).toBe("board-updated");
        if (result.type === "board-updated") {
          expect(result.board.columns[0].tasks[0].subtasks![0].completed).toBe(
            true
          );
        }
      });
    });

    describe("SAVE_STATS_CONFIG", () => {
      it("routes to updateStatsConfig and returns board-updated", () => {
        const board = createBoard();
        const message: MessageData = {
          type: WEBVIEW_MESSAGE_TYPES.SAVE_STATS_CONFIG,
          columns: ["todo", "done"],
        };

        const result = routeMessage(board, message);

        expect(result.type).toBe("board-updated");
        if (result.type === "board-updated") {
          expect(result.board.statsConfig?.columns).toEqual(["todo", "done"]);
        }
      });
    });

    describe("external actions", () => {
      const externalActions = [
        { type: WEBVIEW_MESSAGE_TYPES.EDIT_TASK, action: "editTask" },
        { type: WEBVIEW_MESSAGE_TYPES.EDIT_PRIORITY, action: "editPriority" },
        { type: WEBVIEW_MESSAGE_TYPES.OPEN_FILE, action: "openFile" },
        { type: WEBVIEW_MESSAGE_TYPES.ARCHIVE_TASK, action: "archiveTask" },
        { type: WEBVIEW_MESSAGE_TYPES.COMPLETE_TASK, action: "completeTask" },
        { type: WEBVIEW_MESSAGE_TYPES.CLEAR_CACHE, action: "clearCache" },
        { type: WEBVIEW_MESSAGE_TYPES.OPEN_SETTINGS, action: "openSettings" },
        { type: WEBVIEW_MESSAGE_TYPES.REFRESH, action: "refresh" },
        { type: WEBVIEW_MESSAGE_TYPES.FIX_ISSUES, action: "fixIssues" },
      ];

      externalActions.forEach(({ type, action }) => {
        it(`routes ${type} to external-action ${action}`, () => {
          const board = createBoard();
          const message: MessageData = { type, taskId: "task-1" };

          const result = routeMessage(board, message);

          expect(result.type).toBe("external-action");
          if (result.type === "external-action") {
            expect(result.action).toBe(action);
          }
        });
      });
    });

    describe("unknown message", () => {
      it("returns no-op for unknown message type", () => {
        const board = createBoard();
        const message: MessageData = { type: "unknownType" };

        const result = routeMessage(board, message);

        expect(result.type).toBe("no-op");
      });
    });
  });

  describe("isBoardMutatingMessage", () => {
    it("returns true for mutating message types", () => {
      const mutatingTypes = [
        WEBVIEW_MESSAGE_TYPES.UPDATE_TASK,
        WEBVIEW_MESSAGE_TYPES.DELETE_TASK,
        WEBVIEW_MESSAGE_TYPES.MOVE_TASK,
        WEBVIEW_MESSAGE_TYPES.ADD_TASK_TO_COLUMN,
        WEBVIEW_MESSAGE_TYPES.UPDATE_TITLE,
        WEBVIEW_MESSAGE_TYPES.TOGGLE_SUBTASK,
        WEBVIEW_MESSAGE_TYPES.SAVE_STATS_CONFIG,
      ];

      mutatingTypes.forEach((type) => {
        expect(isBoardMutatingMessage(type)).toBe(true);
      });
    });

    it("returns false for non-mutating message types", () => {
      const nonMutatingTypes = [
        WEBVIEW_MESSAGE_TYPES.EDIT_TASK,
        WEBVIEW_MESSAGE_TYPES.OPEN_FILE,
        WEBVIEW_MESSAGE_TYPES.REFRESH,
        "unknownType",
      ];

      nonMutatingTypes.forEach((type) => {
        expect(isBoardMutatingMessage(type)).toBe(false);
      });
    });
  });

  describe("getActionName", () => {
    it("returns human-readable names for known types", () => {
      expect(getActionName(WEBVIEW_MESSAGE_TYPES.UPDATE_TASK)).toBe(
        "Update Task"
      );
      expect(getActionName(WEBVIEW_MESSAGE_TYPES.DELETE_TASK)).toBe(
        "Delete Task"
      );
      expect(getActionName(WEBVIEW_MESSAGE_TYPES.MOVE_TASK)).toBe("Move Task");
    });

    it("returns the type itself for unknown types", () => {
      expect(getActionName("customAction")).toBe("customAction");
    });
  });
});
