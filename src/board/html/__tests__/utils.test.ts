import {
  generateNonce,
  escapeHtml,
  getPriorityClassName,
  getSubtaskProgress,
  getCompletedSubtaskCount,
  getTotalTaskCount,
  calculateProgressPercent,
  extractFilterValues,
} from "../utils";

describe("board/html/utils", () => {
  describe("generateNonce", () => {
    it("generates a 32-character string", () => {
      const nonce = generateNonce();
      expect(nonce).toHaveLength(32);
    });

    it("only contains alphanumeric characters", () => {
      const nonce = generateNonce();
      expect(nonce).toMatch(/^[A-Za-z0-9]+$/);
    });

    it("generates unique values", () => {
      const nonces = new Set<string>();
      for (let i = 0; i < 100; i++) {
        nonces.add(generateNonce());
      }
      // All 100 should be unique
      expect(nonces.size).toBe(100);
    });
  });

  describe("escapeHtml", () => {
    it("escapes ampersands", () => {
      expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
    });

    it("escapes less-than signs", () => {
      expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
    });

    it("escapes greater-than signs", () => {
      expect(escapeHtml("a > b")).toBe("a &gt; b");
    });

    it("escapes double quotes", () => {
      expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
    });

    it("escapes single quotes", () => {
      expect(escapeHtml("it's")).toBe("it&#039;s");
    });

    it("handles multiple escapes in one string", () => {
      expect(escapeHtml('<a href="test">foo & bar</a>')).toBe(
        "&lt;a href=&quot;test&quot;&gt;foo &amp; bar&lt;/a&gt;"
      );
    });

    it("returns empty string for empty input", () => {
      expect(escapeHtml("")).toBe("");
    });

    it("leaves safe characters unchanged", () => {
      expect(escapeHtml("Hello World 123!")).toBe("Hello World 123!");
    });
  });

  describe("getPriorityClassName", () => {
    it("converts priority to lowercase class name", () => {
      expect(getPriorityClassName("HIGH")).toBe("priority-high");
      expect(getPriorityClassName("Medium")).toBe("priority-medium");
    });

    it("replaces non-alphanumeric characters with hyphens", () => {
      expect(getPriorityClassName("super-urgent")).toBe("priority-super-urgent");
      expect(getPriorityClassName("giga_priority")).toBe("priority-giga-priority");
      expect(getPriorityClassName("priority@special!")).toBe("priority-priority-special-");
    });

    it("handles standard priorities", () => {
      expect(getPriorityClassName("critical")).toBe("priority-critical");
      expect(getPriorityClassName("high")).toBe("priority-high");
      expect(getPriorityClassName("medium")).toBe("priority-medium");
      expect(getPriorityClassName("low")).toBe("priority-low");
    });
  });

  describe("getSubtaskProgress", () => {
    it("returns 0 for empty array", () => {
      expect(getSubtaskProgress([])).toBe(0);
    });

    it("returns 0 for undefined", () => {
      expect(getSubtaskProgress(undefined)).toBe(0);
    });

    it("returns 100 for all completed", () => {
      const subtasks = [
        { id: "1", title: "A", completed: true },
        { id: "2", title: "B", completed: true },
      ];
      expect(getSubtaskProgress(subtasks)).toBe(100);
    });

    it("returns 0 for none completed", () => {
      const subtasks = [
        { id: "1", title: "A", completed: false },
        { id: "2", title: "B", completed: false },
      ];
      expect(getSubtaskProgress(subtasks)).toBe(0);
    });

    it("calculates percentage correctly", () => {
      const subtasks = [
        { id: "1", title: "A", completed: true },
        { id: "2", title: "B", completed: false },
        { id: "3", title: "C", completed: true },
        { id: "4", title: "D", completed: false },
      ];
      expect(getSubtaskProgress(subtasks)).toBe(50);
    });

    it("rounds to nearest integer", () => {
      const subtasks = [
        { id: "1", title: "A", completed: true },
        { id: "2", title: "B", completed: false },
        { id: "3", title: "C", completed: false },
      ];
      // 1/3 = 33.33... should round to 33
      expect(getSubtaskProgress(subtasks)).toBe(33);
    });
  });

  describe("getCompletedSubtaskCount", () => {
    it("returns 0 for undefined", () => {
      expect(getCompletedSubtaskCount(undefined)).toBe(0);
    });

    it("returns 0 for empty array", () => {
      expect(getCompletedSubtaskCount([])).toBe(0);
    });

    it("counts completed subtasks", () => {
      const subtasks = [
        { id: "1", title: "A", completed: true },
        { id: "2", title: "B", completed: false },
        { id: "3", title: "C", completed: true },
      ];
      expect(getCompletedSubtaskCount(subtasks)).toBe(2);
    });
  });

  describe("getTotalTaskCount", () => {
    it("returns 0 for empty columns", () => {
      expect(getTotalTaskCount([])).toBe(0);
    });

    it("sums tasks across columns", () => {
      const columns = [
        { tasks: [{}, {}, {}] },
        { tasks: [{}, {}] },
        { tasks: [{}] },
      ];
      expect(getTotalTaskCount(columns)).toBe(6);
    });

    it("handles columns with no tasks", () => {
      const columns = [
        { tasks: [] },
        { tasks: [{}, {}] },
        { tasks: [] },
      ];
      expect(getTotalTaskCount(columns)).toBe(2);
    });
  });

  describe("calculateProgressPercent", () => {
    it("returns 0 for no tasks", () => {
      expect(calculateProgressPercent(0, 0)).toBe(0);
    });

    it("returns 100 for all done", () => {
      expect(calculateProgressPercent(10, 10)).toBe(100);
    });

    it("returns 0 for none done", () => {
      expect(calculateProgressPercent(10, 0)).toBe(0);
    });

    it("calculates percentage correctly", () => {
      expect(calculateProgressPercent(10, 5)).toBe(50);
      expect(calculateProgressPercent(100, 75)).toBe(75);
    });

    it("rounds to nearest integer", () => {
      expect(calculateProgressPercent(3, 1)).toBe(33);
      expect(calculateProgressPercent(3, 2)).toBe(67);
    });
  });

  describe("extractFilterValues", () => {
    it("returns empty arrays for empty tasks", () => {
      const result = extractFilterValues([]);
      expect(result.tags).toEqual([]);
      expect(result.assignees).toEqual([]);
      expect(result.priorities).toEqual([]);
    });

    it("extracts unique tags sorted alphabetically", () => {
      const tasks = [
        { tags: ["bug", "frontend"] },
        { tags: ["bug", "backend"] },
        { tags: ["feature"] },
      ];
      const result = extractFilterValues(tasks);
      expect(result.tags).toEqual(["backend", "bug", "feature", "frontend"]);
    });

    it("extracts unique assignees sorted alphabetically", () => {
      const tasks = [
        { assignee: "alice" },
        { assignee: "bob" },
        { assignee: "alice" },
      ];
      const result = extractFilterValues(tasks);
      expect(result.assignees).toEqual(["alice", "bob"]);
    });

    it("sorts priorities in predefined order", () => {
      const tasks = [
        { priority: "low" },
        { priority: "critical" },
        { priority: "medium" },
        { priority: "high" },
      ];
      const result = extractFilterValues(tasks);
      expect(result.priorities).toEqual(["critical", "high", "medium", "low"]);
    });

    it("puts custom priorities after standard ones", () => {
      const tasks = [
        { priority: "giga" },
        { priority: "high" },
        { priority: "custom" },
        { priority: "low" },
      ];
      const result = extractFilterValues(tasks);
      // Standard ones first in order, then custom alphabetically
      expect(result.priorities).toEqual(["high", "low", "custom", "giga"]);
    });

    it("handles tasks with missing fields", () => {
      const tasks = [
        { tags: ["bug"] },
        { assignee: "alice" },
        { priority: "high" },
        {},
      ];
      const result = extractFilterValues(tasks);
      expect(result.tags).toEqual(["bug"]);
      expect(result.assignees).toEqual(["alice"]);
      expect(result.priorities).toEqual(["high"]);
    });
  });
});
