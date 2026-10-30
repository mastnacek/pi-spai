import { existsSync } from "node:fs";
import { join } from "node:path";
import { normalizePath } from "./projects-scanner.js";
import { loadIndex } from "./storage-fs.js";
import { findWorktreeRoot } from "./storage-resolve.js";
import type { SpaiIndexEntry } from "./types.js";

const OPEN = new Set(["todo", "working", "waiting"]);
const SHOWN = 5;

/** Comparable path: forward slashes, no trailing slash, case-insensitive (Windows). */
const key = (p: string) => normalizePath(p).toLowerCase();

/** Oldest first: by deadline, items without one last, then by id. */
function byAge(a: SpaiIndexEntry, b: SpaiIndexEntry): number {
  const da = a.deadline ?? "9999";
  const db = b.deadline ?? "9999";
  return da === db ? a.id.localeCompare(b.id) : da.localeCompare(db);
}

/** Czech plural: 1 otevřený Notes úkol, 2–4 otevřené … úkoly, 5+ otevřených … úkolů. */
function tasks(n: number): string {
  if (n === 1) return "1 otevřený Notes úkol";
  if (n >= 2 && n <= 4) return `${n} otevřené Notes úkoly`;
  return `${n} otevřených Notes úkolů`;
}

function line(r: SpaiIndexEntry): string {
  const steps = r.steps ? ` [${r.steps.done}/${r.steps.total}]` : "";
  const dl = r.deadline ? ` (${r.deadline})` : "";
  return `  ${r.id}${dl}${steps} ${r.title}`;
}

/** Tasks waiting for the user (a review wrote the proposal), at most `n`. */
function waitingBlock(list: SpaiIndexEntry[], n: number): string[] {
  const waiting = list.filter((r) => r.status === "waiting");
  if (waiting.length === 0) return [];
  const more = waiting.length > n ? [`  … a dalších ${waiting.length - n}`] : [];
  return [
    `✋ Čeká na tebe – návrh hotový (${waiting.length}):`,
    ...waiting.slice(0, n).map(line),
    ...more,
  ];
}

/**
 * Reminder about open tasks that point at a database folder (`database_path`),
 * shown where you can act on them; tasks waiting for the user come first:
 * - cwd inside a database folder -> that database's tasks, oldest first;
 * - cwd at the worktree root     -> a summary across all databases.
 * Anywhere else it stays silent. Tasks live in the worktree root's backlog.
 */
export async function buildDbReminder(cwd: string): Promise<string | null> {
  const root = findWorktreeRoot(cwd);
  if (!existsSync(join(root, "docs", "spai"))) return null;

  const index = await loadIndex(root);
  const open = index.records
    .filter((r) => r.databasePath && OPEN.has(r.status))
    .sort(byAge);
  if (open.length === 0) return null;

  const here = key(cwd);
  if (here === key(root)) {
    const dbs = new Set(open.map((r) => key(r.databasePath as string)));
    const rest = open.filter((r) => r.status !== "waiting");
    return [
      `📌 ${tasks(open.length)} v ${dbs.size === 1 ? "1 databázi" : `${dbs.size} databázích`}.`,
      ...waitingBlock(open, 5),
      ...(rest.length > 0 ? ["Nejstarší:", ...rest.slice(0, 3).map(line)] : []),
    ].join("\n");
  }

  const mine = open.filter((r) => {
    const db = key(r.databasePath as string);
    return here === db || here.startsWith(`${db}/`);
  });
  if (mine.length === 0) return null;

  const rest = mine.filter((r) => r.status !== "waiting");
  const more = rest.length > SHOWN ? [`  … a dalších ${rest.length - SHOWN}`] : [];
  const next = mine.find((r) => r.status === "waiting") ?? rest[0];
  return [
    `📌 ${tasks(mine.length)} k této databázi:`,
    ...waitingBlock(mine, SHOWN),
    ...rest.slice(0, SHOWN).map(line),
    ...more,
    `  Řešení: napiš „vyřeš ${next?.id}“.`,
  ].join("\n");
}
