import {
  AgentType,
  AGENT_TYPES,
  AGENT_LABELS,
  RuleType,
  RULE_TYPES,
  DEFAULT_PRIORITY_COLORS,
  isAgentType,
  isRuleType,
  isBuiltInPriority,
  createInitialBoardState,
} from "../types";

describe("board/types", () => {
  describe("AgentType constants", () => {
    it("AGENT_TYPES contains all expected agents", () => {
      expect(AGENT_TYPES).toEqual(["copilot", "cursor", "claude-code", "copy"]);
    });

    it("AGENT_LABELS has label for each agent type", () => {
      for (const agentType of AGENT_TYPES) {
        expect(AGENT_LABELS[agentType]).toBeDefined();
        expect(typeof AGENT_LABELS[agentType]).toBe("string");
      }
    });

    it("copy agent is always last (fallback)", () => {
      expect(AGENT_TYPES[AGENT_TYPES.length - 1]).toBe("copy");
    });
  });

  describe("RuleType constants", () => {
    it("RULE_TYPES contains all rule categories", () => {
      expect(RULE_TYPES).toEqual(["always", "never", "prefer", "context"]);
    });
  });

  describe("Priority colors", () => {
    it("has colors for all built-in priorities", () => {
      expect(DEFAULT_PRIORITY_COLORS.critical).toBe("#d64933");
      expect(DEFAULT_PRIORITY_COLORS.high).toBe("#867530");
      expect(DEFAULT_PRIORITY_COLORS.medium).toBe("#37505C");
      expect(DEFAULT_PRIORITY_COLORS.low).toBe("#bac1b8");
    });

    it("all colors are valid hex codes", () => {
      const hexColorRegex = /^#[0-9a-fA-F]{6}$/;
      for (const color of Object.values(DEFAULT_PRIORITY_COLORS)) {
        expect(color).toMatch(hexColorRegex);
      }
    });
  });

  describe("isAgentType", () => {
    it("returns true for valid agent types", () => {
      expect(isAgentType("copilot")).toBe(true);
      expect(isAgentType("cursor")).toBe(true);
      expect(isAgentType("claude-code")).toBe(true);
      expect(isAgentType("copy")).toBe(true);
    });

    it("returns false for invalid values", () => {
      expect(isAgentType("invalid")).toBe(false);
      expect(isAgentType("")).toBe(false);
      expect(isAgentType(null)).toBe(false);
      expect(isAgentType(undefined)).toBe(false);
      expect(isAgentType(123)).toBe(false);
      expect(isAgentType({})).toBe(false);
    });

    it("narrows type correctly", () => {
      const value: unknown = "copilot";
      if (isAgentType(value)) {
        // TypeScript should allow this assignment without error
        const agent: AgentType = value;
        expect(agent).toBe("copilot");
      }
    });
  });

  describe("isRuleType", () => {
    it("returns true for valid rule types", () => {
      expect(isRuleType("always")).toBe(true);
      expect(isRuleType("never")).toBe(true);
      expect(isRuleType("prefer")).toBe(true);
      expect(isRuleType("context")).toBe(true);
    });

    it("returns false for invalid values", () => {
      expect(isRuleType("sometimes")).toBe(false);
      expect(isRuleType("")).toBe(false);
      expect(isRuleType(null)).toBe(false);
      expect(isRuleType(undefined)).toBe(false);
    });

    it("narrows type correctly", () => {
      const value: unknown = "always";
      if (isRuleType(value)) {
        const rule: RuleType = value;
        expect(rule).toBe("always");
      }
    });
  });

  describe("isBuiltInPriority", () => {
    it("returns true for built-in priorities", () => {
      expect(isBuiltInPriority("critical")).toBe(true);
      expect(isBuiltInPriority("high")).toBe(true);
      expect(isBuiltInPriority("medium")).toBe(true);
      expect(isBuiltInPriority("low")).toBe(true);
    });

    it("returns false for custom priorities", () => {
      expect(isBuiltInPriority("giga")).toBe(false);
      expect(isBuiltInPriority("urgent")).toBe(false);
      expect(isBuiltInPriority("blocking")).toBe(false);
    });

    it("returns false for invalid values", () => {
      expect(isBuiltInPriority("")).toBe(false);
      expect(isBuiltInPriority(null)).toBe(false);
      expect(isBuiltInPriority(undefined)).toBe(false);
      expect(isBuiltInPriority(1)).toBe(false);
    });
  });

  describe("createInitialBoardState", () => {
    it("returns a fresh state object each time", () => {
      const state1 = createInitialBoardState();
      const state2 = createInitialBoardState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });

    it("has correct initial values", () => {
      const state = createInitialBoardState();

      expect(state.boardFilePath).toBeUndefined();
      expect(state.lastContentHash).toBeUndefined();
      expect(state.lastValidBoard).toBeUndefined();
      expect(state.parseErrorCount).toBe(0);
      expect(state.isFirstRender).toBe(true);
      expect(state.lastUsedAgent).toBe("copilot");
    });

    it("state can be mutated without affecting other instances", () => {
      const state1 = createInitialBoardState();
      const state2 = createInitialBoardState();

      state1.parseErrorCount = 5;
      state1.lastUsedAgent = "cursor";

      expect(state2.parseErrorCount).toBe(0);
      expect(state2.lastUsedAgent).toBe("copilot");
    });
  });
});
