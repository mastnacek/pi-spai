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

/**
 * One reminder line about open tasks that point at a database folder
 * (`database_path`), shown where you can act on them:
 * - cwd inside a database folder -> that database's tasks, oldest first;
 * - cwd at the worktree root     -> a summary across all databases.
 * Anywhere else it stays silent. Tasks live in the worktree root's backlog.
 */
export async function buildDbReminder(cwd: string): Promise<string | null> {
  const root = findWorktreeRoot(cwd);
  if (!existsSync(join(root, "docs", "spai"))) return null;

  const index = await loadIndex(root);
  const open = index.records.filter(
    (r) => r.databasePath && OPEN.has(r.status),
  );
  if (open.length === 0) return null;

  const here = key(cwd);
  if (here === key(root)) {
    const dbs = new Set(open.map((r) => key(r.databasePath as string)));
    const oldest = [...open].sort(byAge).slice(0, 3);
    return [
      `📌 ${tasks(open.length)} v ${dbs.size === 1 ? "1 databázi" : `${dbs.size} databázích`}. Nejstarší:`,
      ...oldest.map(line),
    ].join("\n");
  }

  const mine = open
    .filter((r) => {
      const db = key(r.databasePath as string);
      return here === db || here.startsWith(`${db}/`);
    })
    .sort(byAge);
  if (mine.length === 0) return null;

  const more = mine.length > SHOWN ? `\n  … a dalších ${mine.length - SHOWN}` : "";
  return [
    `📌 ${tasks(mine.length)} k této databázi:`,
    ...mine.slice(0, SHOWN).map(line),
  ].join("\n") + more + `\n  Řešení: napiš „vyřeš ${mine[0]?.id}“.`;
}
