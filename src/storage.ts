import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { resolveProjectFromIdentifier } from "./projects.js";
import { extractProject, parseInlineMeta } from "./spai.js";
import { addRecord, setStatus, type AddOutcome } from "./spai-cli.js";
import { formatDateTime, parseSpaiMarkdown } from "./storage-format.js";
import {
  ensureSpaiDir,
  getSpaiDir,
  loadIndex,
} from "./storage-fs.js";
import {
  loadAllProjectsIndex,
  scanProjectSpai,
} from "./storage-multiproject.js";
import type { SearchMatch, SpaiRecord, SpaiStatus } from "./types.js";

export {
  ensureSpaiDir, formatDateTime, getSpaiDir, loadAllProjectsIndex,
  loadIndex, parseSpaiMarkdown, scanProjectSpai,
};
export { SpaiIdCollisionError, resolveRecordTarget } from "./storage-resolve.js";
import { resolveRecordTarget } from "./storage-resolve.js";

/**
 * Writes a new record through `spai add`. Nothing is written by this module:
 * ids, files, translations, vectors and the duplicate check are `spai`'s.
 *
 * The project is resolved here (inline `@project` token or `projectHint`) to a
 * folder passed as `--project`; the token is then dropped from the text, because
 * `spai` rejects an `@project` it does not know. An unresolved token is left in
 * the text, so `spai` fails loudly instead of the record landing in the wrong
 * backlog. A duplicate stops the write (`written: false`) unless `force`.
 */
export async function saveRecord(
  cwd: string,
  rawText: string,
  projectHint?: string,
  force = false,
): Promise<AddOutcome> {
  const inline = parseInlineMeta(rawText, undefined, cwd);
  let projectPath = inline.projectPath;
  if (!projectPath && projectHint) {
    projectPath = resolveProjectFromIdentifier(projectHint, undefined, cwd).path;
  }
  if (!projectPath && inline.project) {
    projectPath = resolveProjectFromIdentifier(inline.project, undefined, cwd).path;
  }

  const resolved = projectPath && existsSync(projectPath) ? projectPath : undefined;
  const text = resolved ? extractProject(rawText, undefined, cwd).cleanText : rawText;
  return addRecord(cwd, text, { project: resolved ?? cwd, force });
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

/** The project folder of a record file: `<project>/docs/spai/<file>` (or `.pi/spai`). */
function projectOfDir(dir: string, fallback: string): string {
  return basename(dir) === "spai" ? dirname(dirname(dir)) : fallback;
}

/**
 * Changes the status through `spai set`; `null` when the record does not exist.
 * The lookup (id, bare number, file path, collisions) stays here; the change is `spai`'s.
 */
export async function updateRecordStatus(
  cwd: string,
  id: string,
  nextStatus: SpaiStatus,
  dirOverride?: string,
): Promise<SpaiRecord | null> {
  const target = await resolveRecordTarget(cwd, id, dirOverride);
  if (!target) return null;

  let recordId = target.entry?.id;
  if (!recordId) {
    try {
      recordId = parseSpaiMarkdown(await readFile(target.filePath, "utf8"), basename(target.filePath))?.id;
    } catch {
      return null;
    }
  }
  if (!recordId) return null;

  await setStatus(cwd, recordId, nextStatus, projectOfDir(target.dir, target.projectPath));
  return readRecord(cwd, target.filePath, dirOverride);
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
