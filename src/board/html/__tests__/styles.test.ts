import {
  generatePriorityCSS,
  createDefaultPriorityConfig,
  mergePriorityConfig,
} from "../styles";
import { DEFAULT_PRIORITY_COLORS } from "../../types";

describe("board/html/styles", () => {
  describe("generatePriorityCSS", () => {
    it("generates CSS for built-in priorities", () => {
      const config = createDefaultPriorityConfig();
      const css = generatePriorityCSS(config);

      expect(css).toContain(".task.priority-critical");
      expect(css).toContain(".task.priority-high");
      expect(css).toContain(".task.priority-medium");
      expect(css).toContain(".task.priority-low");
    });

    it("uses configured colors", () => {
      const config = {
        criticalColor: "#ff0000",
        highColor: "#ff9900",
        mediumColor: "#0099ff",
        lowColor: "#00ff00",
        custom: {},
      };
      const css = generatePriorityCSS(config);

      expect(css).toContain("border-left-color: #ff0000");
      expect(css).toContain("border-left-color: #ff9900");
      expect(css).toContain("border-left-color: #0099ff");
      expect(css).toContain("border-left-color: #00ff00");
    });

    it("generates CSS for both task and label", () => {
      const config = createDefaultPriorityConfig();
      const css = generatePriorityCSS(config);

      // Each priority should have both task border and label color
      expect(css).toContain(".task.priority-critical { border-left-color:");
      expect(css).toContain(".task-priority-label.priority-critical { color:");
    });

    it("includes custom priorities", () => {
      const config = {
        ...createDefaultPriorityConfig(),
        custom: {
          giga: "#ff00ff",
          urgent: "#ff0000",
        },
      };
      const css = generatePriorityCSS(config);

      expect(css).toContain(".task.priority-giga { border-left-color: #ff00ff");
      expect(css).toContain(".task-priority-label.priority-giga { color: #ff00ff");
      expect(css).toContain(".task.priority-urgent { border-left-color: #ff0000");
    });

    it("handles empty custom priorities", () => {
      const config = createDefaultPriorityConfig();
      const css = generatePriorityCSS(config);

      // Should not throw and should have the standard priorities
      expect(css).toContain("priority-critical");
      expect(css).toContain("priority-high");
    });
  });

  describe("createDefaultPriorityConfig", () => {
    it("returns default colors", () => {
      const config = createDefaultPriorityConfig();

      expect(config.criticalColor).toBe(DEFAULT_PRIORITY_COLORS.critical);
      expect(config.highColor).toBe(DEFAULT_PRIORITY_COLORS.high);
      expect(config.mediumColor).toBe(DEFAULT_PRIORITY_COLORS.medium);
      expect(config.lowColor).toBe(DEFAULT_PRIORITY_COLORS.low);
    });

    it("returns empty custom object", () => {
      const config = createDefaultPriorityConfig();
      expect(config.custom).toEqual({});
    });

    it("returns fresh object each time", () => {
      const config1 = createDefaultPriorityConfig();
      const config2 = createDefaultPriorityConfig();

      expect(config1).not.toBe(config2);
      config1.custom["test"] = "#000";
      expect(config2.custom).toEqual({});
    });
  });

  describe("mergePriorityConfig", () => {
    it("uses defaults for missing values", () => {
      const config = mergePriorityConfig({});

      expect(config.criticalColor).toBe(DEFAULT_PRIORITY_COLORS.critical);
      expect(config.highColor).toBe(DEFAULT_PRIORITY_COLORS.high);
      expect(config.mediumColor).toBe(DEFAULT_PRIORITY_COLORS.medium);
      expect(config.lowColor).toBe(DEFAULT_PRIORITY_COLORS.low);
    });

    it("overrides with provided values", () => {
      const config = mergePriorityConfig({
        criticalColor: "#111111",
        highColor: "#222222",
      });

      expect(config.criticalColor).toBe("#111111");
      expect(config.highColor).toBe("#222222");
      expect(config.mediumColor).toBe(DEFAULT_PRIORITY_COLORS.medium);
      expect(config.lowColor).toBe(DEFAULT_PRIORITY_COLORS.low);
    });

    it("merges custom priorities", () => {
      const config = mergePriorityConfig({
        custom: { giga: "#ff00ff" },
      });

      expect(config.custom).toEqual({ giga: "#ff00ff" });
    });

    it("preserves all fields when fully specified", () => {
      const userConfig = {
        criticalColor: "#111",
        highColor: "#222",
        mediumColor: "#333",
        lowColor: "#444",
        custom: { special: "#555" },
      };
      const config = mergePriorityConfig(userConfig);

      expect(config.criticalColor).toBe("#111");
      expect(config.highColor).toBe("#222");
      expect(config.mediumColor).toBe("#333");
      expect(config.lowColor).toBe("#444");
      expect(config.custom).toEqual({ special: "#555" });
    });
  });
});
