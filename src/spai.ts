import type {
  InlineMeta,
  SpaiNoteType,
  SpaiPrefixDef,
  SpaiPriority,
  SpaiStatus,
  Subtask,
} from "./types.js";
import { resolveProjectFromIdentifier, type ProjectSummary } from "./projects.js";
import {
  cycleNextStatus,
  formatSpaiLine,
  getStatusGlyph,
  getStatusPrefix,
  toggleSubtaskDone,
  updateBodyStatusPrefix,
} from "./spai-status.js";

export {
  cycleNextStatus,
  formatSpaiLine,
  getStatusGlyph,
  getStatusPrefix,
  toggleSubtaskDone,
  updateBodyStatusPrefix,
};

/**
 * Standard SPAI Prefix Table in exact order of precedence.
 */
export const SPAI_PREFIXES: SpaiPrefixDef[] = [
  {
    prefix: "/. ",
    marker: "/.",
    symbol: "/.",
    type: "Todo",
    status: "waiting",
  },
  {
    prefix: ". ",
    marker: ".",
    symbol: ".",
    type: "Todo",
    status: "todo",
    isDefault: true,
  },
  { prefix: "/ ", marker: "/", symbol: "/", type: "Todo", status: "working" },
  { prefix: "x ", marker: "x", symbol: "x", type: "Todo", status: "done" },
  { prefix: "X ", marker: "X", symbol: "x", type: "Todo", status: "done" },
  { prefix: "z ", marker: "z", symbol: "z", type: "Todo", status: "cancelled" },
  { prefix: "Z ", marker: "Z", symbol: "z", type: "Todo", status: "cancelled" },
  {
    prefix: "- ",
    marker: "-",
    symbol: "-",
    type: "Note",
    status: "note",
    isDefault: true,
  },
  {
    prefix: "? ",
    marker: "?",
    symbol: "?",
    type: "Idea",
    status: "idea",
    isDefault: true,
  },
  {
    prefix: "# ",
    marker: "#",
    symbol: "",
    type: "Note",
    status: "inbox",
    titleOnly: true,
  },
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
export function extractInlineTags(text: string): {
  tags: string[];
  cleanText: string;
} {
  const tags: string[] = [];
  // Trailing boundary is a lookahead, not a consumed whitespace: consuming it
  // would swallow the separator in front of the next `:tag:` block and drop
  // every second tag in `:bl: :email: :okruhy:`.
  const tagBlockRe =
    /(?:^|\s):([A-Za-z0-9_./-]+(?::[A-Za-z0-9_./-]+)*):(?=\s|$)/g;

  let match: RegExpExecArray | null;
  const cleanText = text.replace(tagBlockRe, (fullMatch, tagGroup) => {
    if (tagGroup) {
      const parts = tagGroup.split(":").filter(Boolean);
      for (const p of parts) {
        if (!tags.includes(p)) {
          tags.push(p);
        }
      }
    }
    return " ";
  });

  return {
    tags,
    cleanText: cleanText.replace(/\s{2,}/g, " ").trim(),
  };
}

/**
 * Extracts priority markers `!` or `!high` from text.
 */
export function extractPriority(text: string): {
  priority?: SpaiPriority;
  cleanText: string;
} {
  const priorityRe = /(?:^|\s)!(high|low|medium)?(?:\s|$)/i;
  const match = text.match(priorityRe);
  if (match) {
    const rawVal = match[1]?.toLowerCase();
    const priority: SpaiPriority =
      rawVal === "low" ? "low" : rawVal === "medium" ? "medium" : "high";
    const cleanText = text.replace(priorityRe, " ").trim();
    return { priority, cleanText };
  }
  return { cleanText: text };
}

/**
 * Extracts deadline `@YYYY-MM-DD` or `@DD.MM.` or `@DD.MM.YYYY` from text.
 */
export function extractDeadline(text: string): {
  deadline?: string;
  cleanText: string;
} {
  const deadlineRe =
    /(?:^|\s)@(?:(\d{4}-\d{2}-\d{2})|(\d{1,2}\.\d{1,2}\.(?:\d{4})?))(?:\s|$)/;
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
 * Extracts project binding `@projectName`, `@"project name"`, `@path` or `@"path"` from text.
 * Skips dates (e.g. @2026-09-01, @01.09.). Supports resolving against workspace baseCwd.
 */
export function extractProject(
  text: string,
  getProjects?: () => ProjectSummary[],
  baseCwd?: string,
): {
  project?: string;
  projectPath?: string;
  cleanText: string;
} {
  const projectRe =
    /(?:^|\s)@(?:"([^"\n]+)"|([a-zA-Z0-9_./:\\-]+))(?:\s|$)/;
  const match = text.match(projectRe);
  if (match) {
    const rawVal = match[1] ?? match[2];
    if (
      !rawVal ||
      /^\d{4}-\d{2}-\d{2}$/.test(rawVal) ||
      /^\d{1,2}\.\d{1,2}\.(?:\d{4})?$/.test(rawVal)
    ) {
      return { cleanText: text };
    }
    const cleanText = text.replace(projectRe, " ").trim();
    const resolved = resolveProjectFromIdentifier(rawVal, getProjects, baseCwd);
    return {
      project: resolved.name,
      projectPath: resolved.path,
      cleanText,
    };
  }
  return { cleanText: text };
}

/**
 * Parses all inline metadata (`!`, `@deadline`, `@project`, `:tags:`) from text.
 */
export function parseInlineMeta(
  text: string,
  getProjects?: () => ProjectSummary[],
  baseCwd?: string,
): InlineMeta {
  const p = extractPriority(text);
  const d = extractDeadline(p.cleanText);
  const pr = extractProject(d.cleanText, getProjects, baseCwd);
  const t = extractInlineTags(pr.cleanText);
  return {
    priority: p.priority,
    deadline: d.deadline,
    project: pr.project,
    projectPath: pr.projectPath,
    tags: t.tags,
    cleanBody: t.cleanText,
  };
}

/**
 * Parses full SPAI note structure from raw text.
 * Gracefully handles leading `@project` binding or inline priority metadata.
 */
export function parseSpai(
  text: string,
  manualType?: SpaiNoteType,
  getProjects?: () => ProjectSummary[],
  baseCwd?: string,
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

  // 1. Detect if leading metadata (such as leading @project or !priority) is present
  const firstLineMeta = parseInlineMeta(rawFirstLine, getProjects, baseCwd);
  const cleanFirstLine = firstLineMeta.cleanBody.trim();

  // Try matching prefix on cleanFirstLine first, fallback to rawFirstLine
  const prefixMatch =
    matchSpaiPrefix(cleanFirstLine) || matchSpaiPrefix(rawFirstLine);

  const noteType: SpaiNoteType = manualType || prefixMatch?.type || "Note";
  const status: SpaiStatus =
    prefixMatch?.status || (noteType === "Todo" ? "todo" : "note");
  const symbol = prefixMatch?.symbol ?? "";

  // Title extraction
  let title = prefixMatch
    ? cleanFirstLine.startsWith(prefixMatch.prefix)
      ? cleanFirstLine.slice(prefixMatch.prefix.length).trim()
      : rawFirstLine.slice(prefixMatch.prefix.length).trim()
    : cleanFirstLine || rawFirstLine.trim();

  if (title.startsWith("# ")) {
    title = title.slice(2).trim();
  }
  const cleanTitleMeta = parseInlineMeta(title, getProjects, baseCwd);
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
    if (
      prefix &&
      (prefix.type === "Todo" ||
        prefix.status === "done" ||
        prefix.status === "working")
    ) {
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
