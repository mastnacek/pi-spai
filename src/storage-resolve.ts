import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import {
  getSpaiDirForProject,
  normalizePath,
  resolveProjectFromIdentifier,
  scanWorkspaceSubprojects,
  type ProjectSummary,
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
 * The nearest ancestor that owns a VCS checkout: the cwd itself when it is a
 * root, otherwise the first directory upward that contains a `.git` entry.
 *
 * Every id lookup is bounded by this. The SPAI-003 collision was a subproject
 * reaching its repo ROOT's `docs/spai` — an ancestor, not a child — so the walk
 * has to go up, but never past the worktree. A bare `SPAI-013` is a question
 * about the repository you are in, not about every project on the drive.
 */
export function findWorktreeRoot(cwd: string): string {
  let dir = resolve(cwd);
  for (let i = 0; i < 64; i++) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(cwd);
    dir = parent;
  }
  return resolve(cwd);
}

/**
 * Projects whose SPAI backlog should be searched for a bare id, all inside the
 * current worktree: the cwd and its ancestors up to that root, the root's
 * subprojects, and the cwd's own subprojects (`scanWorkspaceSubprojects` reads
 * the filesystem only).
 *
 * ponytail: no cross-call cache; discovery re-runs per lookup. `discoverAllProjects`
 * is deliberately NOT used here: it merges the global pi-projects cache and the
 * manual project config, so on this machine one lookup scanned ~200 projects
 * across D:\ and still missed the two that mattered. The worktree root is the
 * boundary that keeps an id lookup both correct and cheap.
 */
function discoverCandidateProjects(cwd: string): CandidateProject[] {
  const root = findWorktreeRoot(cwd);
  const map = new Map<string, CandidateProject>();
  const add = (path: string, name: string, spaiDir: string) => {
    const normDir = normalizePath(spaiDir);
    if (map.has(normDir)) return;
    map.set(normDir, { name, path: normalizePath(path), spaiDir: normDir });
  };

  let dir = resolve(cwd);
  for (let i = 0; i < 64; i++) {
    const spaiDir = getSpaiDirForProject(dir);
    if (existsSync(spaiDir)) add(dir, basename(dir), spaiDir);
    if (dir === root) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  for (const base of new Set([root, resolve(cwd)])) {
    for (const sub of scanWorkspaceSubprojects(base)) {
      const subDir = sub.spaiDir || getSpaiDirForProject(sub.path);
      if (existsSync(subDir)) add(sub.path, sub.name, subDir);
    }
    // Sibling backlogs, found directly: a directory is a project for this lookup
    // when it HAS a spai dir. `scanWorkspaceSubprojects` only reports directories
    // carrying a code marker, so a plain sibling with a backlog would otherwise be
    // invisible and its SPAI-013 would collide silently with the cwd's.
    let children: string[] = [];
    try {
      children = readdirSync(base, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => join(base, e.name));
    } catch {
      // An unreadable base contributes nothing; the lookup continues with what it has.
    }
    for (const child of children) {
      const spaiDir = getSpaiDirForProject(child);
      if (existsSync(spaiDir)) add(child, basename(child), spaiDir);
    }
  }

  return [...map.values()];
}

/**
 * Resolve a `@project` qualifier against the worktree-scoped candidate set, then
 * against the global list as a fallback so an explicitly named project outside
 * this worktree still works.
 */
function resolveScopedProject(
  identifier: string,
  cwd: string,
  candidates: readonly CandidateProject[],
): { name: string; path?: string } {
  const wanted = identifier.replace(/^@"?|"?$/g, "").replace(/[/\\]+$/, "").toLowerCase();
  const hit = candidates.find(
    (c) => c.name.toLowerCase() === wanted || c.path.toLowerCase() === wanted,
  );
  if (hit) return { name: hit.name, path: hit.path };
  const global = resolveProjectFromIdentifier(identifier, undefined, cwd);
  if (global.path) return global;
  const summaries: ProjectSummary[] = candidates.map((c) => ({
    name: c.name,
    path: c.path,
    spaiDir: c.spaiDir,
    hasSpai: true,
  }));
  return resolveProjectFromIdentifier(identifier, () => summaries, cwd);
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

  const candidates = discoverCandidateProjects(cwd);

  // 2. Project-qualified id: "SPAI-013 @project" or "SPAI-013 @\"my proj\"".
  const { bare, project } = splitProjectQualifier(raw);
  if (project) {
    const resolved = resolveScopedProject(project, cwd, candidates);
    if (!resolved.path || !existsSync(resolved.path)) {
      throw new Error(
        `Projekt "@${project}" nebyl nalezen pro rozlišení SPAI ID "${bare}". Hledáno v pracovním stromu ${findWorktreeRoot(cwd)}.`,
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

  // 3. Bare id: search every project in the worktree, never pick a collision silently.
  const matches: SpaiIndexEntry[] = [];
  for (const proj of candidates) {
    const entries = await scanProjectSpai({
      name: proj.name,
      path: proj.path,
      spaiDir: proj.spaiDir,
    });
    matches.push(...matchEntries(entries, raw));
  }
  if (matches.length === 0) return null;
  if (matches.length > 1) throw new SpaiIdCollisionError(raw, matches);
  return targetFromEntry(matches[0], cwd);
}
