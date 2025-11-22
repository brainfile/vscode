/**
 * Archive management utilities
 * Pure functions for working with brainfile archives
 */

import * as path from "path";
import type { Board, Task } from "@brainfile/core";
import { BrainfileParser, BrainfileSerializer } from "@brainfile/core";

/**
 * Get archive file path based on main board file path
 * @param boardFilePath - Path to main brainfile.md
 * @param rootPath - Workspace root path
 * @returns Archive file path or undefined
 */
export function getArchivePath(boardFilePath: string, rootPath: string): string {
  const mainFilename = path.basename(boardFilePath);
  const archiveFilename = mainFilename.replace(/\.md$/, "-archive.md");
  return path.join(rootPath, archiveFilename);
}

/**
 * Parse archive content and extract archived tasks
 * @param archiveContent - Raw content of archive file
 * @returns Array of archived tasks or empty array on failure
 */
export function parseArchive(archiveContent: string): Task[] {
  try {
    const archiveBoard = BrainfileParser.parse(archiveContent);
    if (archiveBoard && archiveBoard.archive) {
      return archiveBoard.archive;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Create an empty archive board structure
 * @param title - Optional title for the archive board
 * @returns Board object configured for archive storage
 */
export function createEmptyArchiveBoard(title: string = "Archive"): Board {
  return {
    title,
    columns: [],
    archive: [],
  };
}

/**
 * Add a task to an archive board
 * @param archiveBoard - The archive board
 * @param task - Task to archive
 * @returns Updated archive board
 */
export function addTaskToArchive(archiveBoard: Board, task: Task): Board {
  const archive = archiveBoard.archive || [];
  return {
    ...archiveBoard,
    archive: [...archive, task],
  };
}

/**
 * Serialize archive board to string
 * @param archiveBoard - Archive board to serialize
 * @returns Serialized content
 */
export function serializeArchive(archiveBoard: Board): string {
  return BrainfileSerializer.serialize(archiveBoard);
}

/**
 * Load archived tasks into a board object
 * @param board - Board to load archive into
 * @param archivedTasks - Tasks from archive file
 * @returns Board with archive populated
 */
export function loadArchiveIntoBoard(board: Board, archivedTasks: Task[]): Board {
  return {
    ...board,
    archive: archivedTasks,
  };
}
