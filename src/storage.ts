import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { resolveProjectFromIdentifier } from "./projects.js";
import {
  parseInlineMeta,
  parseSpai,
  parseSubtasks,
  updateBodyStatusPrefix,
} from "./spai.js";
import {
  formatDateTime,
  formatRecordCreated,
  formatPreservingFrontmatter,
  formatSpaiMarkdown,
  getNextId,
  idsFromFileNames,
  parseSpaiMarkdown,
  slugify,
} from "./storage-format.js";
import {
  atomicWriteFile,
  CANDIDATE_SPAI_DIRS,
  DEFAULT_SPAI_DIR,
  ensureSpaiDir,
  getIndexPath,
  getSpaiDir,
  loadIndex,
  PROJECT_ROOT_MARKERS,
  rebuildIndex,
  stepsOf,
  withDirLock,
} from "./storage-fs.js";
import {
  loadAllProjectsIndex,
  scanProjectSpai,
} from "./storage-multiproject.js";
import type {
  SearchMatch,
  SpaiIndexEntry,
  SpaiRecord,
  SpaiStatus,
} from "./types.js";

export {
  atomicWriteFile, CANDIDATE_SPAI_DIRS, DEFAULT_SPAI_DIR, ensureSpaiDir,
  formatDateTime, formatSpaiMarkdown, getIndexPath, getNextId, getSpaiDir,
  loadAllProjectsIndex, loadIndex, parseSpaiMarkdown, PROJECT_ROOT_MARKERS,
  rebuildIndex, scanProjectSpai, slugify,
};
export { SpaiIdCollisionError, resolveRecordTarget } from "./storage-resolve.js";
import { resolveRecordTarget } from "./storage-resolve.js";

/**
 * Ids currently present in a backlog directory, read from file names.
 *
 * Unioned with the index when allocating the next id: the index is a cache, and
 * an id that exists on disk but not in the cache must still be reserved
 * (SPAI-009). An unreadable directory contributes nothing rather than failing
 * the write.
 */
async function idsInDirectory(dir: string): Promise<string[]> {
  try {
    return idsFromFileNames(await readdir(dir));
  } catch {
    return [];
  }
}

export async function saveRecord(  cwd: string,
  rawText: string,
  dirOverride?: string,
  projectHint?: string,
): Promise<SpaiRecord> {
  const parsed = parseSpai(rawText, undefined, undefined, cwd);
  const inlineMeta = parseInlineMeta(rawText, undefined, cwd);
  const subtasks = parseSubtasks(rawText);

  let targetCwd = cwd;
  let projectName = inlineMeta.project;
  let projectPath = inlineMeta.projectPath;

  if (projectHint) {
    const resolved = resolveProjectFromIdentifier(projectHint, undefined, cwd);
    projectName = projectName || resolved.name;
    projectPath = projectPath || resolved.path;
  } else if (!projectPath && inlineMeta.project) {
    const resolved = resolveProjectFromIdentifier(inlineMeta.project, undefined, cwd);
    projectName = resolved.name;
    projectPath = resolved.path;
  }

  if (!dirOverride && projectPath && existsSync(projectPath)) {
    targetCwd = projectPath;
  }

  const dir = await ensureSpaiDir(targetCwd, dirOverride);
  return withDirLock(dir, async () => {
    // Re-read the index after acquiring the lock so the next id is correct even
    // when another record was written while we were waiting. The directory
    // listing is unioned in as well: a file the index never saw must still
    // advance the counter, or its id gets reused (SPAI-009).
    const index = await loadIndex(targetCwd, dirOverride);
    const listingIds = await idsInDirectory(dir);

    const id = getNextId([
      ...index.records,
      ...listingIds.map((listingId) => ({ id: listingId })),
    ]);
    const timestamp = formatDateTime();
    const datePrefix = timestamp.split(" ")[0] || "2026-08-27";
    const slug = slugify(parsed.title) || "polozka";
    const fileName = `${datePrefix}-${id}-${slug}.md`;
    const filePath = join(dir, fileName);

    const record: SpaiRecord = {
      id,
      title: parsed.title,
      type: parsed.type,
      status: parsed.status,
      symbol: parsed.symbol,
      timestamp,
      tags: inlineMeta.tags,
      description: inlineMeta.cleanBody.slice(0, 120),
      priority: inlineMeta.priority,
      deadline: inlineMeta.deadline,
      project: projectName || basename(targetCwd),
      projectPath: targetCwd,
      file: fileName,
      filePath,
      body: rawText,
      subtasks,
    };

    const markdown = formatSpaiMarkdown(record);
    await atomicWriteFile(filePath, markdown);

    const indexEntry: SpaiIndexEntry = {
      id: record.id,
      title: record.title,
      type: record.type,
      status: record.status,
      symbol: record.symbol,
      timestamp: record.timestamp,
      tags: record.tags,
      priority: record.priority,
      deadline: record.deadline,
      project: record.project,
      projectPath: record.projectPath,
      file: record.file,
      databasePath: record.databasePath,
      steps: stepsOf(record.subtasks),
    };

    index.records = index.records.filter((r) => r.id !== id);
    index.records.push(indexEntry);
    index.records.sort((a, b) => {
      const numA = parseInt(a.id.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.id.replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    });
    index.lastUpdated = formatDateTime();

    const indexPath = getIndexPath(targetCwd, dirOverride);
    await atomicWriteFile(indexPath, JSON.stringify(index, null, 2) + "\n");

    return { ...record, rawContent: markdown };
  });
}

export async function readRecord(
  cwd: string,
  idOrFile: string,
  dirOverride?: string,
): Promise<SpaiRecord | null> {
  const target = await resolveRecordTarget(cwd, idOrFile, dirOverride);
  if (!target) return null;

  try {
    const content = await readFile(target.filePath, "utf8");
    const parsed = parseSpaiMarkdown(content, basename(target.filePath));
    if (parsed) {
      parsed.filePath = target.filePath;
      parsed.projectPath = target.projectPath;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function updateRecordStatus(
  cwd: string,
  id: string,
  nextStatus: SpaiStatus,
  dirOverride?: string,
): Promise<SpaiRecord | null> {
  const target = await resolveRecordTarget(cwd, id, dirOverride);
  if (!target) return null;

  return withDirLock(target.dir, async () => {
    let content: string;
    try {
      content = await readFile(target.filePath, "utf8");
    } catch {
      return null;
    }
    const record = parseSpaiMarkdown(content, basename(target.filePath));
    if (!record) return null;
    record.filePath = target.filePath;
    record.projectPath = target.projectPath;

    record.status = nextStatus;
    const { body: updatedBody, symbol } = updateBodyStatusPrefix(
      record.body,
      nextStatus,
    );
    record.body = updatedBody;
    record.symbol = symbol;

    if (
      record.type === "Idea" &&
      (nextStatus === "todo" || nextStatus === "working")
    ) {
      record.type = "Todo";
    }

    const updatedMarkdown = formatPreservingFrontmatter(content, record);
    await atomicWriteFile(target.filePath, updatedMarkdown);

    // Re-read the index under the lock so a concurrent save cannot be lost.
    const index = await loadIndex(target.projectPath, dirOverride);
    const entry = index.records.find((r) => r.id === record.id);
    if (entry) {
      entry.status = nextStatus;
      entry.symbol = symbol;
      entry.type = record.type;
      index.lastUpdated = formatDateTime();
      const indexPath = getIndexPath(target.projectPath, dirOverride);
      await atomicWriteFile(indexPath, JSON.stringify(index, null, 2) + "\n");
    }

    return record;
  });
}

export async function searchRecords(
  cwd: string,
  query: string,
  statusFilter?: SpaiStatus,
  dirOverride?: string,
  projectFilter?: string,
): Promise<SearchMatch[]> {
  let targetCwd = cwd;
  // When the project filter resolves to a directory, scoping by that directory
  // already selects the project, so the fragile name comparison is dropped
  // (it failed for path identifiers and for exact ids with a project filter).
  let projectNameFilter = projectFilter;
  if (!dirOverride && projectFilter) {
    const resolved = resolveProjectFromIdentifier(projectFilter, undefined, cwd);
    if (resolved.path && existsSync(resolved.path)) {
      targetCwd = resolved.path;
      projectNameFilter = undefined;
    }
  }

  const index = await loadIndex(targetCwd, dirOverride);
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const matches: SearchMatch[] = [];

  for (const entry of index.records) {
    if (statusFilter && entry.status !== statusFilter) {
      continue;
    }

    if (
      projectNameFilter &&
      entry.project?.toLowerCase() !== projectNameFilter.toLowerCase()
    ) {
      continue;
    }

    if (terms.length === 0) {
      matches.push({ ...entry, score: 1 });
      continue;
    }

    const searchable =
      `${entry.id} ${entry.title} ${entry.type} ${entry.status} ${entry.project ?? ""} ${entry.tags.join(" ")}`.toLowerCase();
    let score = 0;

    for (const term of terms) {
      if (entry.id.toLowerCase() === term) score += 10;
      else if (entry.title.toLowerCase().includes(term)) score += 5;
      else if (entry.project && entry.project.toLowerCase().includes(term)) score += 5;
      else if (entry.tags.some((t) => t.includes(term))) score += 4;
      else if (searchable.includes(term)) score += 1;
    }

    if (score > 0) {
      matches.push({ ...entry, score });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}
