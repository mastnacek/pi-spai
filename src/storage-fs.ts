import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { formatDateTime, parseSpaiMarkdown } from "./storage-format.js";
import type { SpaiIndex, SpaiIndexEntry } from "./types.js";

export const DEFAULT_SPAI_DIR = join("docs", "spai");
export const CANDIDATE_SPAI_DIRS = [join("docs", "spai"), join(".pi", "spai")];
const INDEX_FILENAME = ".index.json";

export const PROJECT_ROOT_MARKERS = [
  ".git",
  "package.json",
  "Cargo.toml",
  "pyproject.toml",
  "go.mod",
  join("docs", "spai"),
  join(".pi", "spai"),
];

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

export function getIndexPath(cwd: string, dirOverride?: string): string {
  return join(getSpaiDir(cwd, dirOverride), INDEX_FILENAME);
}

export async function ensureSpaiDir(
  cwd: string,
  dirOverride?: string,
): Promise<string> {
  const dir = getSpaiDir(cwd, dirOverride);
  await mkdir(dir, { recursive: true });
  return dir;
}

let writeSeq = 0;
const writeQueues = new Map<string, Promise<void>>();

function getTempPath(filePath: string): string {
  const seq = (writeSeq = (writeSeq + 1) % 1000000);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${filePath}.${Date.now()}.${process.pid}.${seq}.${rand}.tmp`;
}

async function safeRename(src: string, dest: string): Promise<void> {
  const maxRetries = 8;
  let delay = 10;
  for (let i = 0; i < maxRetries; i++) {
    try {
      await rename(src, dest);
      return;
    } catch (err) {
      const code = (err as { code?: string } | null | undefined)?.code;
      if (
        (code === "EPERM" ||
          code === "EACCES" ||
          code === "EBUSY" ||
          code === "ENOENT") &&
        i < maxRetries - 1
      ) {
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 200);
        continue;
      }
      try {
        await copyFile(src, dest);
        await unlink(src);
        return;
      } catch {
        throw err;
      }
    }
  }
}

async function doAtomicWrite(
  filePath: string,
  content: string,
): Promise<void> {
  const targetDir = dirname(filePath);
  await mkdir(targetDir, { recursive: true });

  const tempPath = getTempPath(filePath);
  try {
    await writeFile(tempPath, content, { encoding: "utf8" });
    await safeRename(tempPath, filePath);
  } catch (err) {
    try {
      await unlink(tempPath);
    } catch {
      // Ignore
    }
    throw err;
  }
}

export async function atomicWriteFile(
  filePath: string,
  content: string,
): Promise<void> {
  const normalizedPath = resolve(filePath);
  const previous = writeQueues.get(normalizedPath) ?? Promise.resolve();
  let release: () => void = () => {};
  const next = new Promise<void>((r) => {
    release = r;
  });
  writeQueues.set(normalizedPath, next);

  try {
    try {
      await previous;
    } catch {
      // Ignore failure from preceding write in queue
    }
    await doAtomicWrite(normalizedPath, content);
  } finally {
    release();
    if (writeQueues.get(normalizedPath) === next) {
      writeQueues.delete(normalizedPath);
    }
  }
}

export async function rebuildIndex(
  cwd: string,
  dirOverride?: string,
): Promise<SpaiIndex> {
  const dir = await ensureSpaiDir(cwd, dirOverride);
  const entries: SpaiIndexEntry[] = [];

  try {
    const files = await readdir(dir);
    for (const file of files) {
      if (file.endsWith(".md") && !file.startsWith(".")) {
        const filePath = join(dir, file);
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
              project: parsed.project,
              projectPath: parsed.projectPath,
              file,
            });
          }
        } catch {
          // Skip
        }
      }
    }
  } catch {
    // Ignore
  }

  entries.sort((a, b) => {
    const numA = parseInt(a.id.replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(b.id.replace(/\D/g, ""), 10) || 0;
    return numA - numB;
  });

  const index: SpaiIndex = {
    version: 1,
    lastUpdated: formatDateTime(),
    records: entries,
  };

  const indexPath = getIndexPath(cwd, dirOverride);
  await atomicWriteFile(indexPath, JSON.stringify(index, null, 2) + "\n");
  return index;
}

export async function loadIndex(
  cwd: string,
  dirOverride?: string,
): Promise<SpaiIndex> {
  const indexPath = getIndexPath(cwd, dirOverride);
  try {
    const raw = await readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw) as SpaiIndex;
    if (parsed && Array.isArray(parsed.records)) {
      return parsed;
    }
  } catch {
    // Rebuild
  }
  return rebuildIndex(cwd, dirOverride);
}
