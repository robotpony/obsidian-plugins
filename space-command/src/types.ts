import { TFile } from "obsidian";

export interface TodoItem {
  file: TFile;
  filePath: string;
  folder: string;
  lineNumber: number;
  text: string;
  hasCheckbox: boolean;
  tags: string[];
  dateCreated: number;
}

export interface TodoFilters {
  path?: string;
  tags?: string[];
  limit?: number;
}

export interface ProjectInfo {
  tag: string;
  count: number;
  lastActivity: number;
}

export interface SpaceCommandSettings {
  defaultTodoneFile: string;
  showSidebarByDefault: boolean;
  dateFormat: string;
  excludeTodoneFilesFromRecent: boolean;
  defaultProjectsFolder: string;
  focusListLimit: number;
}

export const DEFAULT_SETTINGS: SpaceCommandSettings = {
  defaultTodoneFile: "todos/done.md",
  showSidebarByDefault: true,
  dateFormat: "YYYY-MM-DD",
  excludeTodoneFilesFromRecent: true,
  defaultProjectsFolder: "projects/",
  focusListLimit: 5,
};
