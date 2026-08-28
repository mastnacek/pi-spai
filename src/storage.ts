import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  parseInlineMeta,
  parseSpai,
  parseSubtasks,
  updateBodyStatusPrefix,
} from "./spai.js";
import type {
  SearchMatch,
  SpaiIndex,
  SpaiIndexEntry,
  SpaiNoteType,
  SpaiPriority,
  SpaiRecord,
  SpaiStatus,
} from "./types.js";

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

export async function atomicWriteFile(
  filePath: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${Date.now()}.${process.pid}.tmp`;
  try {
    await writeFile(tmpPath, content, "utf8");
    await rename(tmpPath, filePath);
  } catch (err) {
    try {
      await unlink(tmpPath);
    } catch {
      // Ignore
    }
    throw err;
  }
}

/**
 * Strips diacritics using Unicode NFD and creates clean URL/file slugs.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export function formatDateTime(dateInput?: string | Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const d =
    dateInput instanceof Date
      ? dateInput
      : dateInput
        ? new Date(dateInput)
        : new Date();
  if (Number.isNaN(d.getTime())) {
    return formatDateTime(new Date());
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function getNextId(records: Array<{ id: string }>): string {
  let maxNum = 0;
  for (const r of records) {
    const match = r.id.match(/^SPAI-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!Number.isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }
  return `SPAI-${(maxNum + 1).toString().padStart(3, "0")}`;
}

/**
 * Builds frontmatter markdown content for a SPAI record.
 */
export function formatSpaiMarkdown(record: SpaiRecord): string {
  const frontmatterLines = [
    "---",
    `type: ${record.type}`,
    `title: "${record.title.replace(/"/g, '\\"')}"`,
    `timestamp: ${record.timestamp}`,
    `status: ${record.status}`,
    "source: pi-spai",
  ];

  if (record.tags.length > 0) {
    frontmatterLines.push(`tags: [${record.tags.join(", ")}]`);
  }

  if (record.priority || record.deadline || record.project) {
    frontmatterLines.push("facets:");
    if (record.priority)
      frontmatterLines.push(`  priority: ${record.priority}`);
    if (record.deadline)
      frontmatterLines.push(`  deadline: ${record.deadline}`);
    if (record.project) frontmatterLines.push(`  project: ${record.project}`);
  }

  if (record.symbol) {
    frontmatterLines.push(`spai_symbol: '${record.symbol}'`);
  }
  frontmatterLines.push("---");
  frontmatterLines.push("");

  const header = `# ${record.id}: ${record.title}`;
  return `${frontmatterLines.join("\n")}\n${header}\n\n${record.body.trim()}\n`;
}

/**
 * Parses markdown file with optional YAML frontmatter into a SpaiRecord.
 */
export function parseSpaiMarkdown(
  content: string,
  fileName = "",
): SpaiRecord | null {
  let yamlRaw = "";
  let body = content;

  if (content.startsWith("---\n") || content.startsWith("---\r\n")) {
    const endFm = content.indexOf("\n---", 4);
    if (endFm !== -1) {
      yamlRaw = content.slice(4, endFm).trim();
      body = content.slice(endFm + 4).trimStart();
      if (body.startsWith("\n")) body = body.slice(1);
    }
  }

  // Extract ID and Title from header
  const titleMatch =
    body.match(/^#\s*(SPAI-\d+)?:\s*(.+)$/m) || body.match(/^#\s*(.+)$/m);
  let id = "SPAI-001";
  let title = "Bez názvu";

  if (titleMatch) {
    if (titleMatch[1]) id = titleMatch[1].trim();
    if (titleMatch[2]) title = titleMatch[2].trim();
    else if (titleMatch[1]) title = titleMatch[1].trim();
  }

  const cleanBody = body.replace(/^#\s*.+$/m, "").trim();
  const parsed = parseSpai(cleanBody || title);
  const inlineMeta = parseInlineMeta(cleanBody);
  const subtasks = parseSubtasks(cleanBody);

  let type: SpaiNoteType = parsed.type;
  let status: SpaiStatus = parsed.status;
  let timestamp = formatDateTime();
  let priority: SpaiPriority | undefined = inlineMeta.priority;
  let deadline: string | undefined = inlineMeta.deadline;
  let project: string | undefined;
  const tags: string[] = [...inlineMeta.tags];

  // Parse simple YAML keys if present
  if (yamlRaw) {
    const typeM = yamlRaw.match(/^type:\s*(.+)$/m);
    if (typeM) type = typeM[1].trim() as SpaiNoteType;

    const statusM = yamlRaw.match(/^status:\s*(.+)$/m);
    if (statusM) status = statusM[1].trim() as SpaiStatus;

    const timeM = yamlRaw.match(/^timestamp:\s*(.+)$/m);
    if (timeM) timestamp = timeM[1].trim();

    const tagsM = yamlRaw.match(/^tags:\s*\[(.*)\]/m);
    if (tagsM) {
      const parsedTags = tagsM[1]
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      for (const pt of parsedTags) {
        if (!tags.includes(pt)) tags.push(pt);
      }
    }

    const prioM = yamlRaw.match(/priority:\s*(.+)$/m);
    if (prioM) priority = prioM[1].trim() as SpaiPriority;

    const deadM = yamlRaw.match(/deadline:\s*(.+)$/m);
    if (deadM) deadline = deadM[1].trim();

    const projM = yamlRaw.match(/project:\s*(.+)$/m);
    if (projM) project = projM[1].trim();
  }

  return {
    id,
    title,
    type,
    status,
    symbol: parsed.symbol,
    timestamp,
    tags: Array.from(new Set(tags)),
    description: cleanBody.slice(0, 120),
    priority,
    deadline,
    project,
    file: fileName,
    body: cleanBody,
    subtasks,
    rawContent: content,
  };
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

export async function saveRecord(
  cwd: string,
  rawText: string,
  dirOverride?: string,
  projectHint?: string,
): Promise<SpaiRecord> {
  const dir = await ensureSpaiDir(cwd, dirOverride);
  const index = await loadIndex(cwd, dirOverride);

  const parsed = parseSpai(rawText);
  const inlineMeta = parseInlineMeta(rawText);
  const subtasks = parseSubtasks(rawText);

  const id = getNextId(index.records);
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
    project: projectHint || basename(cwd),
    file: fileName,
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
    file: fileName,
  };

  index.records = index.records.filter((r) => r.id !== id);
  index.records.push(indexEntry);
  index.records.sort((a, b) => {
    const numA = parseInt(a.id.replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(b.id.replace(/\D/g, ""), 10) || 0;
    return numA - numB;
  });
  index.lastUpdated = formatDateTime();

  const indexPath = getIndexPath(cwd, dirOverride);
  await atomicWriteFile(indexPath, JSON.stringify(index, null, 2) + "\n");

  return { ...record, rawContent: markdown };
}

export async function readRecord(
  cwd: string,
  idOrFile: string,
  dirOverride?: string,
): Promise<SpaiRecord | null> {
  const dir = getSpaiDir(cwd, dirOverride);
  const index = await loadIndex(cwd, dirOverride);

  const query = idOrFile.trim().toLowerCase();
  let targetFile = idOrFile;

  for (const entry of index.records) {
    const entryIdLower = entry.id.toLowerCase();
    const entryNum = entry.id.replace(/\D/g, "");
    if (
      entryIdLower === query ||
      entryNum === query ||
      entry.file.toLowerCase() === query ||
      entry.file.toLowerCase().includes(query)
    ) {
      targetFile = entry.file;
      break;
    }
  }

  const filePath = join(dir, targetFile);
  try {
    const content = await readFile(filePath, "utf8");
    return parseSpaiMarkdown(content, basename(filePath));
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
  const record = await readRecord(cwd, id, dirOverride);
  if (!record) return null;

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

  const updatedMarkdown = formatSpaiMarkdown(record);
  const dir = getSpaiDir(cwd, dirOverride);
  const filePath = join(dir, record.file);
  await atomicWriteFile(filePath, updatedMarkdown);

  const index = await loadIndex(cwd, dirOverride);
  const entry = index.records.find((r) => r.id === record.id);
  if (entry) {
    entry.status = nextStatus;
    entry.symbol = symbol;
    entry.type = record.type;
    index.lastUpdated = formatDateTime();
    const indexPath = getIndexPath(cwd, dirOverride);
    await atomicWriteFile(indexPath, JSON.stringify(index, null, 2) + "\n");
  }

  return record;
}

export async function searchRecords(
  cwd: string,
  query: string,
  statusFilter?: SpaiStatus,
  dirOverride?: string,
): Promise<SearchMatch[]> {
  const index = await loadIndex(cwd, dirOverride);
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  const matches: SearchMatch[] = [];

  for (const entry of index.records) {
    if (statusFilter && entry.status !== statusFilter) {
      continue;
    }

    if (terms.length === 0) {
      matches.push({ ...entry, score: 1 });
      continue;
    }

    const searchable =
      `${entry.id} ${entry.title} ${entry.type} ${entry.status} ${entry.tags.join(" ")}`.toLowerCase();
    let score = 0;

    for (const term of terms) {
      if (entry.id.toLowerCase() === term) score += 10;
      else if (entry.title.toLowerCase().includes(term)) score += 5;
      else if (entry.tags.some((t) => t.includes(term))) score += 4;
      else if (searchable.includes(term)) score += 1;
    }

    if (score > 0) {
      matches.push({ ...entry, score });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}
