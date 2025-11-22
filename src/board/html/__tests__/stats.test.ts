import { generateStatsHtml, generateProgressBarHtml } from "../stats";
import type { Board } from "@brainfile/core";

describe("board/html/stats", () => {
  describe("generateStatsHtml", () => {
    const createBoard = (overrides: Partial<Board> = {}): Board => ({
      title: "Test Board",
      columns: [
        { id: "todo", title: "To Do", tasks: [{ id: "t1", title: "Task 1" }] },
        { id: "in-progress", title: "In Progress", tasks: [] },
        { id: "done", title: "Done", tasks: [{ id: "t2", title: "Task 2" }, { id: "t3", title: "Task 3" }] },
      ],
      ...overrides,
    });

    it("generates default stats with Total and Done", () => {
      const board = createBoard();
      const html = generateStatsHtml(board, 3);

      expect(html).toContain("Total");
      expect(html).toContain("Done");
      expect(html).toContain(">3<"); // Total count
      expect(html).toContain(">2<"); // Done count
    });

    it("handles board with no done column", () => {
      const board = createBoard({
        columns: [
          { id: "todo", title: "To Do", tasks: [{ id: "t1", title: "Task 1" }] },
        ],
      });
      const html = generateStatsHtml(board, 1);

      expect(html).toContain("Total");
      expect(html).toContain("Done");
      expect(html).toContain(">1<"); // Total
      expect(html).toContain(">0<"); // Done (0 because no done column)
    });

    it("uses custom stat columns when configured", () => {
      const board = createBoard({
        statsConfig: {
          columns: ["todo", "in-progress"],
        },
      });
      const html = generateStatsHtml(board, 3);

      expect(html).toContain("To Do");
      expect(html).toContain("In Progress");
      expect(html).toContain(">1<"); // Todo count
      expect(html).toContain(">0<"); // In Progress count
      // Should NOT contain default stats
      expect(html).not.toContain(">Total<");
    });

    it("limits custom columns to 4", () => {
      const board = createBoard({
        columns: [
          { id: "col1", title: "Col 1", tasks: [] },
          { id: "col2", title: "Col 2", tasks: [] },
          { id: "col3", title: "Col 3", tasks: [] },
          { id: "col4", title: "Col 4", tasks: [] },
          { id: "col5", title: "Col 5", tasks: [] },
        ],
        statsConfig: {
          columns: ["col1", "col2", "col3", "col4", "col5"],
        },
      });
      const html = generateStatsHtml(board, 0);

      expect(html).toContain("Col 1");
      expect(html).toContain("Col 2");
      expect(html).toContain("Col 3");
      expect(html).toContain("Col 4");
      expect(html).not.toContain("Col 5");
    });

    it("skips non-existent columns in custom config", () => {
      const board = createBoard({
        statsConfig: {
          columns: ["todo", "nonexistent", "done"],
        },
      });
      const html = generateStatsHtml(board, 3);

      expect(html).toContain("To Do");
      expect(html).toContain("Done");
      // Non-existent column should just be empty string
    });

    it("escapes HTML in column titles", () => {
      const board = createBoard({
        columns: [
          { id: "todo", title: "<script>alert(1)</script>", tasks: [] },
        ],
        statsConfig: {
          columns: ["todo"],
        },
      });
      const html = generateStatsHtml(board, 0);

      expect(html).toContain("&lt;script&gt;");
      expect(html).not.toContain("<script>");
    });

    it("uses default stats when statsConfig.columns is empty", () => {
      const board = createBoard({
        statsConfig: {
          columns: [],
        },
      });
      const html = generateStatsHtml(board, 3);

      expect(html).toContain("Total");
      expect(html).toContain("Done");
    });
  });

  describe("generateProgressBarHtml", () => {
    it("generates progress bar with correct width", () => {
      const html = generateProgressBarHtml(50);
      expect(html).toContain('width: 50%');
      expect(html).toContain('class="progress-bar"');
      expect(html).toContain('class="progress-fill"');
    });

    it("handles 0 percent", () => {
      const html = generateProgressBarHtml(0);
      expect(html).toContain('width: 0%');
    });

    it("handles 100 percent", () => {
      const html = generateProgressBarHtml(100);
      expect(html).toContain('width: 100%');
    });
  });
});
