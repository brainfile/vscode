/**
 * Agent prompt building for "Send to Agent" feature
 */

import type { Task } from "@brainfile/core";

/**
 * Context for building an agent prompt
 */
export interface AgentPromptContext {
  boardTitle: string;
  columnTitle: string;
  task: Task;
}

/**
 * Build a prompt for an AI agent to work on a task
 * @param context - The task context
 * @returns Formatted prompt string
 */
export function buildAgentPrompt(context: AgentPromptContext): string {
  const { boardTitle, columnTitle, task } = context;
  const lines: string[] = [];

  // Opening instruction
  lines.push(`Review task ${task.id} and summarize your understanding before making changes.`);
  lines.push("");

  // Context info
  lines.push(`Board: ${boardTitle}`);
  lines.push(`Column: ${columnTitle}`);
  lines.push(`Title: ${task.title}`);

  // Optional fields
  if (task.description) {
    lines.push(`Description:\n${task.description}`);
  }

  if (task.priority) {
    lines.push(`Priority: ${task.priority}`);
  }

  if (task.tags && task.tags.length > 0) {
    lines.push(`Tags: ${task.tags.join(", ")}`);
  }

  if (task.relatedFiles && task.relatedFiles.length > 0) {
    lines.push(`Related files:\n${task.relatedFiles.map((f) => `- ${f}`).join("\n")}`);
  }

  if (task.subtasks && task.subtasks.length > 0) {
    lines.push("Subtasks:");
    task.subtasks.forEach((st) => {
      const checkbox = st.completed ? "x" : " ";
      lines.push(`- [${checkbox}] ${st.title} (${st.id})`);
    });
  }

  // Closing instructions
  lines.push("");
  lines.push("Please respond with:");
  lines.push("1) Your understanding of the task");
  lines.push("2) Any risks or open questions");
  lines.push("3) A brief plan before edits");

  return lines.join("\n");
}

/**
 * Build a shorter prompt for clipboard copy
 * @param context - The task context
 * @returns Shorter formatted prompt string
 */
export function buildClipboardPrompt(context: AgentPromptContext): string {
  // For clipboard, we use the full prompt since user will paste it manually
  return buildAgentPrompt(context);
}
