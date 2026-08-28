import type {
  InlineMeta,
  SpaiNoteType,
  SpaiPrefixDef,
  SpaiPriority,
  SpaiStatus,
  Subtask,
} from "./types.js";

/**
 * Standard SPAI Prefix Table in exact order of precedence.
 */
export const SPAI_PREFIXES: SpaiPrefixDef[] = [
  { prefix: "/. ", marker: "/.", symbol: "/.", type: "Todo", status: "waiting" },
  { prefix: ". ", marker: ".", symbol: ".", type: "Todo", status: "todo", isDefault: true },
  { prefix: "/ ", marker: "/", symbol: "/", type: "Todo", status: "working" },
  { prefix: "x ", marker: "x", symbol: "x", type: "Todo", status: "done" },
  { prefix: "X ", marker: "X", symbol: "x", type: "Todo", status: "done" },
  { prefix: "z ", marker: "z", symbol: "z", type: "Todo", status: "cancelled" },
  { prefix: "Z ", marker: "Z", symbol: "z", type: "Todo", status: "cancelled" },
  { prefix: "- ", marker: "-", symbol: "-", type: "Note", status: "note", isDefault: true },
  { prefix: "? ", marker: "?", symbol: "?", type: "Idea", status: "idea", isDefault: true },
  { prefix: "# ", marker: "#", symbol: "", type: "Note", status: "inbox", titleOnly: true },
];

export const NO_PREFIX_DEF: SpaiPrefixDef = {
  prefix: "",
  marker: "",
  symbol: "",
  type: "Note",
  status: "inbox",
};

/**
 * Matches literal SPAI prefix at the start of a line.
 */
export function matchSpaiPrefix(line: string): SpaiPrefixDef | null {
  for (const def of SPAI_PREFIXES) {
    if (line.startsWith(def.prefix)) {
      return def;
    }
  }
  return null;
}

/**
 * Strips SPAI prefix from a line if present.
 */
export function stripSpaiPrefix(line: string): string {
  const match = matchSpaiPrefix(line);
  if (match) {
    return line.slice(match.prefix.length);
  }
  return line;
}

/**
 * Extracts chained inline tags :tag1:tag2: from text.
 */
export function extractInlineTags(text: string): { tags: string[]; cleanText: string } {
  const tags: string[] = [];
  const tagBlockRe = /(?:^|\s):([A-Za-z0-9_./-]+(?::[A-Za-z0-9_./-]+)*):(?:\s|$)/g;

  const cleanText = text.replace(tagBlockRe, (_m, tagChain: string) => {
    const split = tagChain.split(":").filter(Boolean);
    for (const t of split) {
      tags.push(t.toLowerCase());
    }
    return " ";
  }).trim();

  return { tags: Array.from(new Set(tags)), cleanText };
}

/**
 * Extracts priority mark `!` from text (at start or inline).
 */
export function extractPriority(text: string): { priority?: SpaiPriority; cleanText: string } {
  const prioRe = /(?:^|\s)!(?:\s|$)/;
  if (prioRe.test(text)) {
    return {
      priority: "high",
      cleanText: text.replace(prioRe, " ").trim(),
    };
  }
  return { cleanText: text };
}

/**
 * Extracts deadline `@YYYY-MM-DD` or `@DD.MM.` from text.
 */
export function extractDeadline(text: string): { deadline?: string; cleanText: string } {
  const deadlineRe = /(?:^|\s)@(?:(\d{4}-\d{2}-\d{2})|(\d{1,2}\.\d{1,2}\.(?:\d{4})?))(?:\s|$)/;
  const match = text.match(deadlineRe);
  if (match) {
    let dateStr = match[1] || match[2];
    if (match[2] && !match[1]) {
      const parts = match[2].split(".").filter(Boolean);
      const day = parts[0]?.padStart(2, "0");
      const month = parts[1]?.padStart(2, "0");
      const year = parts[2] || new Date().getFullYear().toString();
      dateStr = `${year}-${month}-${day}`;
    }
    const cleanText = text.replace(deadlineRe, " ").trim();
    return { deadline: dateStr, cleanText };
  }
  return { cleanText: text };
}

/**
 * Parses all inline metadata (`!`, `@deadline`, `:tags:`) from text.
 */
export function parseInlineMeta(text: string): InlineMeta {
  const p = extractPriority(text);
  const d = extractDeadline(p.cleanText);
  const t = extractInlineTags(d.cleanText);
  return {
    priority: p.priority,
    deadline: d.deadline,
    tags: t.tags,
    cleanBody: t.cleanText,
  };
}

/**
 * Parses full SPAI note structure from raw text.
 */
export function parseSpai(
  text: string,
  manualType?: SpaiNoteType,
): {
  type: SpaiNoteType;
  status: SpaiStatus;
  symbol: string;
  title: string;
  firstLineIndex: number;
} {
  const lines = text.split("\n");
  const firstLineIdx = lines.findIndex((l) => l.trim().length > 0);

  if (firstLineIdx === -1) {
    return {
      type: manualType || "Note",
      status: "inbox",
      symbol: "",
      title: "Prázdná poznámka",
      firstLineIndex: -1,
    };
  }

  const rawFirstLine = lines[firstLineIdx] ?? "";
  const prefixMatch = matchSpaiPrefix(rawFirstLine);

  const noteType: SpaiNoteType = manualType || prefixMatch?.type || "Note";
  const status: SpaiStatus = prefixMatch?.status || (noteType === "Todo" ? "todo" : "note");
  const symbol = prefixMatch?.symbol ?? "";

  // Title extraction
  let title = prefixMatch ? rawFirstLine.slice(prefixMatch.prefix.length).trim() : rawFirstLine.trim();
  if (title.startsWith("# ")) {
    title = title.slice(2).trim();
  }
  const cleanTitleMeta = parseInlineMeta(title);
  title = cleanTitleMeta.cleanBody || "Nová položka";

  return {
    type: noteType,
    status,
    symbol,
    title,
    firstLineIndex: firstLineIdx,
  };
}

/**
 * Parses subtasks inside text.
 */
export function parseSubtasks(text: string): Subtask[] {
  const lines = text.split("\n");
  const subtasks: Subtask[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const prefix = matchSpaiPrefix(line.trimStart());
    if (prefix && (prefix.type === "Todo" || prefix.status === "done" || prefix.status === "working")) {
      subtasks.push({
        lineIndex: i,
        status: prefix.status,
        done: prefix.status === "done",
        text: line.trimStart().slice(prefix.prefix.length).trim(),
      });
    }
  }

  return subtasks;
}

/**
 * Toggles a subtask done status in markdown text.
 */
export function toggleSubtaskDone(text: string, lineIndex: number): string {
  const lines = text.split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) {
    return text;
  }

  const line = lines[lineIndex] ?? "";
  const trimmed = line.trimStart();
  const indent = line.slice(0, line.length - trimmed.length);
  const match = matchSpaiPrefix(trimmed);

  if (match) {
    const newPrefix = match.status === "done" ? ". " : "x ";
    const rest = trimmed.slice(match.prefix.length);
    lines[lineIndex] = `${indent}${newPrefix}${rest}`;
    return lines.join("\n");
  }

  return text;
}

function getStatusGlyph(status: SpaiStatus): string {
  switch (status) {
    case "done":
      return "✓ ";
    case "working":
      return "◐ ";
    case "waiting":
      return "⏳ ";
    case "todo":
      return "○ ";
    case "cancelled":
      return "✗ ";
    case "idea":
      return "💡 ";
    case "note":
    default:
      return "• ";
  }
}

/**
 * Formats a text line in SPAI aware Reading Mode.
 */
export function formatSpaiLine(line: string): string {
  const trimmed = line.trimStart();
  const indent = line.slice(0, line.length - trimmed.length);

  const match = matchSpaiPrefix(trimmed);
  if (match) {
    const textWithoutPrefix = trimmed.slice(match.prefix.length);
    const { tags, cleanText } = extractInlineTags(textWithoutPrefix);
    const glyph = getStatusGlyph(match.status);
    const tagBadge = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
    return `${indent}${glyph}${cleanText}${tagBadge}`;
  }

  if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
    const rest = trimmed.slice(2);
    const { tags, cleanText } = extractInlineTags(rest);
    const tagBadge = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
    return `${indent}• ${cleanText}${tagBadge}`;
  }

  return line;
}
