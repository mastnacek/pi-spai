import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { getSpaiDirForProject, type ProjectSummary } from "./projects.js";
import { formatDateTime, parseSpaiMarkdown } from "./storage-format.js";
import type { SpaiIndex, SpaiIndexEntry } from "./types.js";

/**
 * Scans a single project's SPAI directory and returns index entries annotated
 * with the owning project (name, path, file path).
 */
export async function scanProjectSpai(
  project: ProjectSummary,
): Promise<SpaiIndexEntry[]> {
  const spaiDir = project.spaiDir || getSpaiDirForProject(project.path);
  if (!existsSync(spaiDir)) return [];

  const entries: SpaiIndexEntry[] = [];
  try {
    const files = await readdir(spaiDir);
    for (const file of files) {
      if (!file.endsWith(".md") || file.startsWith(".")) continue;
      const filePath = join(spaiDir, file);
      try {
        const content = await readFile(filePath, "utf8");
        const parsed = parseSpaiMarkdown(content, file);
        if (parsed) {
          entries.push({
            id: parsed.id,
            title: parsed.title,
            type: parsed.type,
            status: parsed.status,
            symbol: parsed.symbol,
            timestamp: parsed.timestamp,
            tags: parsed.tags,
            priority: parsed.priority,
            deadline: parsed.deadline,
            project: project.name,
            projectPath: project.path,
            filePath,
            file,
          });
        }
      } catch {
        // Skip unreadable file
      }
    }
  } catch {
    // Skip unreadable dir
  }

  entries.sort((a, b) => {
    const numA = parseInt(a.id.replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(b.id.replace(/\D/g, ""), 10) || 0;
    return numA - numB;
  });
  return entries;
}

/**
 * Aggregates tasks across all discovered projects into one merged index.
 * Entries carry project + projectPath so the Kanban can switch and write back
 * to the correct project.
 */
export async function loadAllProjectsIndex(
  projects: ProjectSummary[],
): Promise<{
  index: SpaiIndex;
  projectsWithCounts: ProjectSummary[];
}> {
  const allEntries: SpaiIndexEntry[] = [];
  const updatedProjects: ProjectSummary[] = [];

  for (const proj of projects) {
    const entries = await scanProjectSpai(proj);
    allEntries.push(...entries);
    updatedProjects.push({
      ...proj,
      taskCount: entries.length,
      hasSpai:
        entries.length > 0 ||
        existsSync(proj.spaiDir || getSpaiDirForProject(proj.path)),
    });
  }

  allEntries.sort((a, b) => {
    const pCmp = (a.project || "").localeCompare(b.project || "", undefined, {
      sensitivity: "base",
    });
    if (pCmp !== 0) return pCmp;
    const numA = parseInt(a.id.replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(b.id.replace(/\D/g, ""), 10) || 0;
    return numA - numB;
  });

  const index: SpaiIndex = {
    version: 1,
    lastUpdated: formatDateTime(),
    records: allEntries,
  };

  return { index, projectsWithCounts: updatedProjects };
}
