import { parseInlineMeta, parseSpai, parseSubtasks } from "./spai.js";
import type {
  SpaiNoteType,
  SpaiPriority,
  SpaiRecord,
  SpaiStatus,
} from "./types.js";

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

  if (record.priority || record.deadline || record.project || record.projectPath) {
    frontmatterLines.push("facets:");
    if (record.priority)
      frontmatterLines.push(`  priority: ${record.priority}`);
    if (record.deadline)
      frontmatterLines.push(`  deadline: ${record.deadline}`);
    if (record.project) frontmatterLines.push(`  project: ${record.project}`);
    if (record.projectPath)
      frontmatterLines.push(`  project_path: ${record.projectPath}`);
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
  let project: string | undefined = inlineMeta.project;
  let projectPath: string | undefined = inlineMeta.projectPath;
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

    const projPathM = yamlRaw.match(/project_path:\s*(.+)$/m);
    if (projPathM) projectPath = projPathM[1].trim();
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
    projectPath: projectPath || inlineMeta.projectPath,
    file: fileName,
    filePath: "",
    body: cleanBody || title,
    subtasks,
  };
}
