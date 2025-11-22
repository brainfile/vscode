import { buildAgentPrompt, AgentPromptContext } from "../promptBuilder";
import type { Task } from "@brainfile/core";

describe("board/agents/promptBuilder", () => {
  const createTask = (overrides: Partial<Task> = {}): Task => ({
    id: "task-1",
    title: "Implement feature X",
    ...overrides,
  });

  const createContext = (overrides: Partial<AgentPromptContext> = {}): AgentPromptContext => ({
    boardTitle: "My Project",
    columnTitle: "In Progress",
    task: createTask(),
    ...overrides,
  });

  describe("buildAgentPrompt", () => {
    it("includes task ID in opening line", () => {
      const prompt = buildAgentPrompt(createContext());
      expect(prompt).toContain("Review task task-1");
    });

    it("includes board and column context", () => {
      const prompt = buildAgentPrompt(createContext({
        boardTitle: "Test Board",
        columnTitle: "To Do",
      }));
      expect(prompt).toContain("Board: Test Board");
      expect(prompt).toContain("Column: To Do");
    });

    it("includes task title", () => {
      const prompt = buildAgentPrompt(createContext({
        task: createTask({ title: "Fix authentication bug" }),
      }));
      expect(prompt).toContain("Title: Fix authentication bug");
    });

    it("includes description when present", () => {
      const prompt = buildAgentPrompt(createContext({
        task: createTask({ description: "This is a detailed description\nwith multiple lines" }),
      }));
      expect(prompt).toContain("Description:");
      expect(prompt).toContain("This is a detailed description");
      expect(prompt).toContain("with multiple lines");
    });

    it("excludes description when not present", () => {
      const prompt = buildAgentPrompt(createContext({
        task: createTask({ description: undefined }),
      }));
      expect(prompt).not.toContain("Description:");
    });

    it("includes priority when present", () => {
      const prompt = buildAgentPrompt(createContext({
        task: createTask({ priority: "high" }),
      }));
      expect(prompt).toContain("Priority: high");
    });

    it("excludes priority when not present", () => {
      const prompt = buildAgentPrompt(createContext({
        task: createTask({ priority: undefined }),
      }));
      expect(prompt).not.toContain("Priority:");
    });

    it("includes tags when present", () => {
      const prompt = buildAgentPrompt(createContext({
        task: createTask({ tags: ["bug", "frontend", "urgent"] }),
      }));
      expect(prompt).toContain("Tags: bug, frontend, urgent");
    });

    it("excludes tags when empty array", () => {
      const prompt = buildAgentPrompt(createContext({
        task: createTask({ tags: [] }),
      }));
      expect(prompt).not.toContain("Tags:");
    });

    it("includes related files when present", () => {
      const prompt = buildAgentPrompt(createContext({
        task: createTask({
          relatedFiles: ["src/auth.ts", "src/utils/validate.ts"],
        }),
      }));
      expect(prompt).toContain("Related files:");
      expect(prompt).toContain("- src/auth.ts");
      expect(prompt).toContain("- src/utils/validate.ts");
    });

    it("excludes related files when empty", () => {
      const prompt = buildAgentPrompt(createContext({
        task: createTask({ relatedFiles: [] }),
      }));
      expect(prompt).not.toContain("Related files:");
    });

    it("includes subtasks with completion status", () => {
      const prompt = buildAgentPrompt(createContext({
        task: createTask({
          subtasks: [
            { id: "st-1", title: "Research options", completed: true },
            { id: "st-2", title: "Implement solution", completed: false },
            { id: "st-3", title: "Write tests", completed: false },
          ],
        }),
      }));
      expect(prompt).toContain("Subtasks:");
      expect(prompt).toContain("- [x] Research options (st-1)");
      expect(prompt).toContain("- [ ] Implement solution (st-2)");
      expect(prompt).toContain("- [ ] Write tests (st-3)");
    });

    it("excludes subtasks when empty", () => {
      const prompt = buildAgentPrompt(createContext({
        task: createTask({ subtasks: [] }),
      }));
      expect(prompt).not.toContain("Subtasks:");
    });

    it("includes closing instructions", () => {
      const prompt = buildAgentPrompt(createContext());
      expect(prompt).toContain("Please respond with:");
      expect(prompt).toContain("1) Your understanding of the task");
      expect(prompt).toContain("2) Any risks or open questions");
      expect(prompt).toContain("3) A brief plan before edits");
    });

    it("handles a fully populated task", () => {
      const prompt = buildAgentPrompt(createContext({
        boardTitle: "E-commerce Platform",
        columnTitle: "In Progress",
        task: createTask({
          id: "task-42",
          title: "Add shopping cart persistence",
          description: "Save cart to localStorage and sync with server",
          priority: "high",
          tags: ["feature", "cart", "storage"],
          relatedFiles: ["src/cart/store.ts", "src/api/cart.ts"],
          subtasks: [
            { id: "st-1", title: "Add localStorage adapter", completed: true },
            { id: "st-2", title: "Add sync logic", completed: false },
          ],
        }),
      }));

      // Check all sections are present
      expect(prompt).toContain("Review task task-42");
      expect(prompt).toContain("Board: E-commerce Platform");
      expect(prompt).toContain("Column: In Progress");
      expect(prompt).toContain("Title: Add shopping cart persistence");
      expect(prompt).toContain("Description:");
      expect(prompt).toContain("Priority: high");
      expect(prompt).toContain("Tags: feature, cart, storage");
      expect(prompt).toContain("Related files:");
      expect(prompt).toContain("Subtasks:");
      expect(prompt).toContain("Please respond with:");
    });

    it("produces valid multiline string", () => {
      const prompt = buildAgentPrompt(createContext());
      // Should have multiple lines
      const lines = prompt.split("\n");
      expect(lines.length).toBeGreaterThan(5);
      // First line should be the instruction
      expect(lines[0]).toContain("Review task");
    });
  });
});
