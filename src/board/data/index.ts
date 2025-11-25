/**
 * Data layer module for board operations
 * Re-exports operations, queries, and ID generation from @brainfile/core
 */

// Re-export board operations from core
export {
  type BoardOperationResult,
  type TaskInput,
  type TaskPatch,
  moveTask,
  addTask,
  updateTask,
  deleteTask,
  toggleSubtask,
  updateBoardTitle,
  updateStatsConfig,
  archiveTask,
  restoreTask,
  patchTask,
  addSubtask,
  deleteSubtask,
  updateSubtask,
  setSubtasksCompleted,
  setAllSubtasksCompleted,
} from "@brainfile/core";

// Re-export query functions from core
export {
  findColumnById,
  findColumnByName,
  findTaskById,
  taskIdExists,
  getAllTasks,
  getTasksByTag,
  getTasksByPriority,
  getTasksByAssignee,
  searchTasks,
  getColumnTaskCount,
  getTotalTaskCount,
  columnExists,
  getTasksWithIncompleteSubtasks,
  getOverdueTasks,
} from "@brainfile/core";

// Re-export ID generation utilities from core
export {
  extractTaskIdNumber,
  getMaxTaskIdNumber,
  generateNextTaskId,
  generateSubtaskIdFromIndex,
  generateNextSubtaskId,
  isValidTaskId,
  isValidSubtaskId,
  getParentTaskId,
} from "@brainfile/core";
