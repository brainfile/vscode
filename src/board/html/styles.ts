/**
 * CSS generation for board HTML
 */

import { getPriorityClassName } from "./utils";
import type { PriorityConfig } from "../types";
import { DEFAULT_PRIORITY_COLORS } from "../types";

/**
 * Generate dynamic priority CSS based on configuration
 * @param config - Priority color configuration
 * @returns CSS string for priority styles
 */
export function generatePriorityCSS(config: PriorityConfig): string {
  let css = "/* Priority colors from settings */\n";

  // Built-in priority colors
  css += `    .task.priority-critical { border-left-color: ${config.criticalColor}; }\n`;
  css += `    .task-priority-label.priority-critical { color: ${config.criticalColor}; }\n`;
  css += `    .task.priority-high { border-left-color: ${config.highColor}; }\n`;
  css += `    .task-priority-label.priority-high { color: ${config.highColor}; }\n`;
  css += `    .task.priority-medium { border-left-color: ${config.mediumColor}; }\n`;
  css += `    .task-priority-label.priority-medium { color: ${config.mediumColor}; }\n`;
  css += `    .task.priority-low { border-left-color: ${config.lowColor}; }\n`;
  css += `    .task-priority-label.priority-low { color: ${config.lowColor}; }\n`;

  // Custom priorities
  for (const [priority, color] of Object.entries(config.custom)) {
    const className = getPriorityClassName(priority);
    css += `    .task.${className} { border-left-color: ${color}; }\n`;
    css += `    .task-priority-label.${className} { color: ${color}; }\n`;
  }

  return css;
}

/**
 * Create default priority config with standard colors
 */
export function createDefaultPriorityConfig(): PriorityConfig {
  return {
    criticalColor: DEFAULT_PRIORITY_COLORS.critical,
    highColor: DEFAULT_PRIORITY_COLORS.high,
    mediumColor: DEFAULT_PRIORITY_COLORS.medium,
    lowColor: DEFAULT_PRIORITY_COLORS.low,
    custom: {},
  };
}

/**
 * Merge user config with defaults
 * @param userConfig - Partial config from settings
 * @returns Complete priority config
 */
export function mergePriorityConfig(
  userConfig: Partial<PriorityConfig>
): PriorityConfig {
  const defaults = createDefaultPriorityConfig();
  return {
    criticalColor: userConfig.criticalColor ?? defaults.criticalColor,
    highColor: userConfig.highColor ?? defaults.highColor,
    mediumColor: userConfig.mediumColor ?? defaults.mediumColor,
    lowColor: userConfig.lowColor ?? defaults.lowColor,
    custom: { ...defaults.custom, ...userConfig.custom },
  };
}
