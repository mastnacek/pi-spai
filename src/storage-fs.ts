import { existsSync } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { formatDateTime, parseSpaiMarkdown } from "./storage-format.js";
import type { SpaiIndex, SpaiIndexEntry, Subtask } from "./types.js";

const DEFAULT_SPAI_DIR = join("docs", "spai");
const CANDIDATE_SPAI_DIRS = [join("docs", "spai"), join(".pi", "spai")];
/** Version of the in-memory index shape (2: databasePath, steps; titleCs is optional). */
export const INDEX_VERSION = 2;

/**
 * Returns path to the SPAI directory for a given workspace.
 */
export function getSpaiDir(cwd: string, dirOverride?: string): string {
  if (dirOverride) {
    return join(cwd, dirOverride);
  }
  for (const candidate of CANDIDATE_SPAI_DIRS) {
    const full = join(cwd, candidate);
    if (existsSync(full)) {
      return full;
    }
  }
  return join(cwd, DEFAULT_SPAI_DIR);
}

export async function ensureSpaiDir(
  cwd: string,
  dirOverride?: string,
): Promise<string> {
  const dir = getSpaiDir(cwd, dirOverride);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Plan progress for the index; undefined when the item has no `## Plán`. */
export function stepsOf(
  subtasks: Subtask[],
): SpaiIndexEntry["steps"] | undefined {
  if (subtasks.length === 0) return undefined;
  return {
    done: subtasks.filter((s) => s.done).length,
    total: subtasks.length,
  };
}

/**
 * Reads the backlog of one project from its record files.
 *
 * The files are the truth and the `spai` binary is their only writer, so there
 * is no cached `.index.json` to trust or to keep in step: the index is built in
 * memory on every load and never written.
 */
export async function loadIndex(
  cwd: string,
  dirOverride?: string,
): Promise<SpaiIndex> {
  const dir = getSpaiDir(cwd, dirOverride);
  const entries: SpaiIndexEntry[] = [];

  try {
    for (const file of await readdir(dir)) {
      if (!file.endsWith(".md") || file.startsWith(".")) continue;
      try {
        const parsed = parseSpaiMarkdown(await readFile(join(dir, file), "utf8"), file);
        if (parsed) {
          entries.push({
            id: parsed.id,
            title: parsed.title,
            titleCs: parsed.titleCs,
            type: parsed.type,
            status: parsed.status,
            symbol: parsed.symbol,
            timestamp: parsed.timestamp,
            tags: parsed.tags,
            priority: parsed.priority,
            deadline: parsed.deadline,
            project: parsed.project,
            projectPath: parsed.projectPath,
            file,
            databasePath: parsed.databasePath,
            steps: stepsOf(parsed.subtasks),
          });
        }
      } catch {
        // Unreadable file: skip it.
      }
    }
  } catch {
    // Missing directory: an empty backlog.
  }

  entries.sort((a, b) => {
    const numA = parseInt(a.id.replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(b.id.replace(/\D/g, ""), 10) || 0;
    return numA - numB;
  });

  return { version: INDEX_VERSION, lastUpdated: formatDateTime(), records: entries };
}
