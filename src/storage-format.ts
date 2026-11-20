import { parseInlineMeta, parseSpai, parseSubtasks } from "./spai.js";
import type {
  SpaiNoteType,
  SpaiPriority,
  SpaiRecord,
  SpaiStatus,
} from "./types.js";

/** Title to show: the Czech one when `spai` wrote it, else the stored title. */
export function displayTitle(item: { title: string; titleCs?: string }): string {
  return item.titleCs ?? item.title;
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
  let project: string | undefined = inlineMeta.project;
  let projectPath: string | undefined = inlineMeta.projectPath;
  const tags: string[] = [...inlineMeta.tags];
  let databasePath: string | undefined;
  let titleCs: string | undefined;

  // Parse simple YAML keys if present
  if (yamlRaw) {
    const titleCsM = yamlRaw.match(/^title_cs:\s*"((?:[^"\\]|\\.)*)"\s*$/m) ?? yamlRaw.match(/^title_cs:\s*(.+?)\s*$/m);
    if (titleCsM?.[1]) titleCs = titleCsM[1].replace(/\\(["\\])/g, "$1").trim() || undefined;

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

    const projPathM = yamlRaw.match(/project_path:\s*(.+)$/m);
    if (projPathM) projectPath = projPathM[1].trim();

    const dbPathM = yamlRaw.match(/database_path:\s*(.+)$/m);
    if (dbPathM) databasePath = dbPathM[1].trim();
  }

  return {
    id,
    title,
    titleCs,
    type,
    status,
    symbol: parsed.symbol,
    timestamp,
    tags: Array.from(new Set(tags)),
    description: cleanBody.slice(0, 120),
    priority,
    deadline,
    project,
    projectPath: projectPath || inlineMeta.projectPath,
    file: fileName,
    filePath: "",
    body: cleanBody || title,
    subtasks,
    databasePath,
  };
}
