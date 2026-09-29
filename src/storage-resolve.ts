import { existsSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import {
  discoverAllProjects,
  getSpaiDirForProject,
  normalizePath,
  resolveProjectFromIdentifier,
  scanWorkspaceSubprojects,
} from "./projects.js";
import { getSpaiDir, loadIndex } from "./storage-fs.js";
import { scanProjectSpai } from "./storage-multiproject.js";
import type { SpaiIndexEntry } from "./types.js";

/**
 * Thrown when a bare SPAI id matches records in more than one project backlog.
 * Never resolved silently: the caller must qualify the id or pass a file path.
 */
export class SpaiIdCollisionError extends Error {
  constructor(id: string, candidates: SpaiIndexEntry[]) {
    const lines = candidates.map(
      (c) => `  - ${c.id} (@${c.project || "?"}): ${c.filePath || c.file}`,
    );
    super(
      `SPAI ID "${id}" odpovídá více projektům, nelze bezpečně vybrat cíl:\n` +
        lines.join("\n") +
        `\nUpřesněte cíl pomocí "${id} @<projekt>" nebo zadejte přesnou cestu k souboru.`,
    );
    this.name = "SpaiIdCollisionError";
  }
}

export interface RecordTarget {
  filePath: string;
  projectPath: string;
  dir: string;
  entry?: SpaiIndexEntry;
}

function looksLikePath(raw: string): boolean {
  return raw.includes("/") || raw.includes("\\") || /\.md$/i.test(raw);
}

function splitProjectQualifier(raw: string): {
  bare: string;
  project?: string;
} {
  const match = raw.match(/@"([^"]+)"|@(\S+)/);
  if (!match) return { bare: raw };
  const project = (match[1] ?? match[2] ?? "").replace(/[/\\]+$/, "").trim();
  const bare = raw
    .replace(match[0], " ")
    .replace(/\s+/g, " ")
    .trim();
  return { bare, project: project || undefined };
}

/** Strong match: exact id, bare sequence number, or exact file name. */
function matchEntries(
  entries: SpaiIndexEntry[],
  query: string,
): SpaiIndexEntry[] {
  const q = query.toLowerCase();
  const strong = entries.filter((entry) => {
    if (entry.id.toLowerCase() === q) return true;
    if (/^\d+$/.test(q) && entry.id.replace(/\D/g, "") === q) return true;
    return entry.file.toLowerCase() === q;
  });
  if (strong.length > 0) return strong;
  // Fallback mirrors the historical lenient readRecord: file-name substring.
  return entries.filter((entry) => entry.file.toLowerCase().includes(q));
}

function targetFromEntry(
  entry: SpaiIndexEntry,
  fallbackCwd: string,
): RecordTarget {
  const projectPath = entry.projectPath || fallbackCwd;
  const dir = entry.filePath ? dirname(entry.filePath) : getSpaiDir(projectPath);
  return {
    filePath: entry.filePath || join(dir, entry.file),
    projectPath,
    dir,
    entry,
  };
}

interface CandidateProject {
  name: string;
  path: string;
  spaiDir: string;
}

/**
 * Projects whose SPAI backlog should be searched for a bare id. Uses the same
 * discovery as the Kanban (`discoverAllProjects`) plus the cwd's ancestors and
 * their subprojects, because the SPAI-003 collision was a subproject reaching
 * the repo ROOT's docs/spai — an ancestor, not a child, of the cwd.
 *
 * ponytail: no cross-call cache; discovery re-runs per lookup. Bounded by the
 * repo boundary (stops at the nearest `.git`) so it never escapes the checkout.
 */
function discoverCandidateProjects(cwd: string): CandidateProject[] {
  const map = new Map<string, CandidateProject>();
  const add = (path: string, name: string, spaiDir: string) => {
    const normDir = normalizePath(spaiDir);
    if (map.has(normDir)) return;
    map.set(normDir, { name, path: normalizePath(path), spaiDir: normDir });
  };

  for (const p of discoverAllProjects(cwd)) {
    const spaiDir = p.spaiDir || getSpaiDirForProject(p.path);
    if (existsSync(spaiDir)) add(p.path, p.name, spaiDir);
  }

  let dir = resolve(cwd);
  for (let i = 0; i < 40; i++) {
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
    const spaiDir = getSpaiDirForProject(dir);
    if (existsSync(spaiDir)) add(dir, basename(dir), spaiDir);
    for (const sub of scanWorkspaceSubprojects(dir)) {
      const subDir = sub.spaiDir || getSpaiDirForProject(sub.path);
      if (existsSync(subDir)) add(sub.path, sub.name, subDir);
    }
    if (existsSync(join(dir, ".git"))) break;
  }

  return [...map.values()];
}

/**
 * Resolves an id / file path to a single record file. Across discovered
 * projects: 0 matches -> null, 1 -> that record, >=2 -> SpaiIdCollisionError.
 * With an explicit `dirOverride` the search is pinned to that one backlog.
 */
export async function resolveRecordTarget(
  cwd: string,
  idOrFile: string,
  dirOverride?: string,
): Promise<RecordTarget | null> {
  const raw = idOrFile.trim();
  if (!raw) return null;

  // Explicit directory override pins the search to one backlog (tests).
  if (dirOverride) {
    const dir = getSpaiDir(cwd, dirOverride);
    const index = await loadIndex(cwd, dirOverride);
    const entry = matchEntries(index.records, raw)[0];
    if (!entry) {
      const filePath = join(dir, raw);
      if (!existsSync(filePath)) return null;
      return { filePath, projectPath: cwd, dir };
    }
    return targetFromEntry(entry, cwd);
  }

  // 1. Exact file path wins and must exist.
  if (looksLikePath(raw)) {
    const abs = isAbsolute(raw) ? raw : resolve(cwd, raw);
    if (existsSync(abs) && statSync(abs).isFile()) {
      return { filePath: abs, projectPath: cwd, dir: dirname(abs) };
    }
  }

  // 2. Project-qualified id: "SPAI-013 @project" or "SPAI-013 @\"my proj\"".
  const { bare, project } = splitProjectQualifier(raw);
  if (project) {
    const resolved = resolveProjectFromIdentifier(project, undefined, cwd);
    if (!resolved.path || !existsSync(resolved.path)) {
      throw new Error(
        `Projekt "@${project}" nebyl nalezen pro rozlišení SPAI ID "${bare}".`,
      );
    }
    const dir = getSpaiDirForProject(resolved.path);
    if (!existsSync(dir)) return null;
    const entries = await scanProjectSpai({
      name: resolved.name,
      path: resolved.path,
      spaiDir: dir,
    });
    const entry = matchEntries(entries, bare)[0];
    return entry ? targetFromEntry(entry, resolved.path) : null;
  }

  // 3. Bare id: search every discovered project, never pick a collision silently.
  const candidates: SpaiIndexEntry[] = [];
  for (const proj of discoverCandidateProjects(cwd)) {
    const entries = await scanProjectSpai({
      name: proj.name,
      path: proj.path,
      spaiDir: proj.spaiDir,
    });
    candidates.push(...matchEntries(entries, raw));
  }
  if (candidates.length === 0) return null;
  if (candidates.length > 1) throw new SpaiIdCollisionError(raw, candidates);
  return targetFromEntry(candidates[0], cwd);
}
