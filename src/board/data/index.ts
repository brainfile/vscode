/**
 * Data layer module for board operations
 * Re-exports operations, queries, and ID generation from @brainfile/core
 */

// Re-export board operations from core
// Re-export query functions from core
// Re-export ID generation utilities from core
export {
	addSubtask,
	addTask,
	archiveTask,
	archiveTasks,
	type BoardOperationResult,
	type BulkItemResult,
	type BulkOperationResult,
	columnExists,
	deleteSubtask,
	deleteTask,
	deleteTasks,
	extractTaskIdNumber,
	findColumnById,
	findColumnByName,
	findTaskById,
	generateNextSubtaskId,
	generateNextTaskId,
	generateSubtaskIdFromIndex,
	getAllTasks,
	getColumnTaskCount,
	getMaxTaskIdNumber,
	getOverdueTasks,
	getParentTaskId,
	getTasksByAssignee,
	getTasksByPriority,
	getTasksByTag,
	getTasksWithIncompleteSubtasks,
	getTotalTaskCount,
	isValidSubtaskId,
	isValidTaskId,
	moveTask,
	// Bulk operations
	moveTasks,
	patchTask,
	patchTasks,
	restoreTask,
	searchTasks,
	setAllSubtasksCompleted,
	setSubtasksCompleted,
	type TaskInput,
	type TaskPatch,
	taskIdExists,
	toggleSubtask,
	updateBoardTitle,
	updateStatsConfig,
	updateSubtask,
	updateTask,
} from "@brainfile/core"
