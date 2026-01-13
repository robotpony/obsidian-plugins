import { TodoFilters, TodoItem } from "./types";

export class FilterParser {
  static parse(filterString: string): TodoFilters {
    const filters: TodoFilters = {};

    if (!filterString || filterString.trim() === "") {
      return filters;
    }

    // Split by pipe and trim
    const parts = filterString.split("|").map((p) => p.trim());

    for (const part of parts) {
      // Parse path:folder/subfolder/
      if (part.startsWith("path:")) {
        filters.path = part.substring(5).trim();
      }
      // Parse tags:#tag1,#tag2
      else if (part.startsWith("tags:")) {
        const tagString = part.substring(5).trim();
        filters.tags = tagString
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
      }
      // Parse limit:N
      else if (part.startsWith("limit:")) {
        const limitStr = part.substring(6).trim();
        const limit = parseInt(limitStr, 10);
        if (!isNaN(limit) && limit > 0) {
          filters.limit = limit;
        }
      }
      // Parse todone:show|hide
      else if (part.startsWith("todone:")) {
        const value = part.substring(7).trim().toLowerCase();
        if (value === 'show' || value === 'hide') {
          filters.todone = value;
        }
      }
    }

    return filters;
  }

  static applyFilters(todos: TodoItem[], filters: TodoFilters): TodoItem[] {
    let filtered = [...todos];

    // Apply path filter
    if (filters.path) {
      const pathPrefix = filters.path.toLowerCase();
      filtered = filtered.filter((todo) =>
        todo.filePath.toLowerCase().startsWith(pathPrefix)
      );
    }

    // Apply tags filter
    if (filters.tags && filters.tags.length > 0) {
      filtered = filtered.filter((todo) => {
        const todoTags = todo.tags.map((t) => t.toLowerCase());
        return filters.tags!.every((filterTag) =>
          todoTags.includes(filterTag.toLowerCase())
        );
      });
    }

    // Apply limit
    if (filters.limit) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }
}
