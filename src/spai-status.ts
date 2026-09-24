import type { SpaiNoteType, SpaiStatus } from "./types.js";
import { extractInlineTags, matchSpaiPrefix } from "./spai.js";

export function getStatusGlyph(status: SpaiStatus): string {
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

/**
 * Gets the standard prefix string and symbol for a given SPAI status.
 */
export function getStatusPrefix(status: SpaiStatus): {
  prefix: string;
  symbol: string;
} {
  switch (status) {
    case "working":
      return { prefix: "/ ", symbol: "/" };
    case "waiting":
      return { prefix: "/. ", symbol: "/." };
    case "done":
      return { prefix: "x ", symbol: "x" };
    case "cancelled":
      return { prefix: "z ", symbol: "z" };
    case "idea":
      return { prefix: "? ", symbol: "?" };
    case "note":
      return { prefix: "- ", symbol: "-" };
    case "todo":
    default:
      return { prefix: ". ", symbol: "." };
  }
}

/**
 * Cycles through the complete SPAI status loop.
 */
export function cycleNextStatus(
  current: SpaiStatus,
  type: SpaiNoteType = "Todo",
): SpaiStatus {
  if (type === "Idea") {
    if (current === "idea") return "todo";
    if (current === "todo") return "working";
    if (current === "working") return "waiting";
    if (current === "waiting") return "done";
    if (current === "done") return "cancelled";
    return "idea";
  }

  if (type === "Note") {
    if (current === "note") return "todo";
    if (current === "todo") return "done";
    return "note";
  }

  // Full Todo loop: todo (○) ➔ working (◐) ➔ waiting (⏳) ➔ done (✓) ➔ cancelled (✗) ➔ todo (○)
  switch (current) {
    case "todo":
      return "working";
    case "working":
      return "waiting";
    case "waiting":
      return "done";
    case "done":
      return "cancelled";
    case "cancelled":
    default:
      return "todo";
  }
}

/**
 * Updates the leading SPAI status prefix on the first non-empty line of markdown text.
 */
export function updateBodyStatusPrefix(
  body: string,
  newStatus: SpaiStatus,
): { body: string; symbol: string } {
  const { prefix: newPrefix, symbol } = getStatusPrefix(newStatus);
  const lines = body.split("\n");
  const firstTextIdx = lines.findIndex((l) => l.trim().length > 0);

  if (firstTextIdx !== -1) {
    const rawLine = lines[firstTextIdx] ?? "";
    const trimmed = rawLine.trimStart();
    const indent = rawLine.slice(0, rawLine.length - trimmed.length);
    const existingPrefix = matchSpaiPrefix(trimmed);

    if (existingPrefix) {
      const rest = trimmed.slice(existingPrefix.prefix.length);
      lines[firstTextIdx] = `${indent}${newPrefix}${rest}`;
    } else {
      lines[firstTextIdx] = `${indent}${newPrefix}${trimmed}`;
    }
    return { body: lines.join("\n"), symbol };
  }

  return { body, symbol };
}

/**
 * Toggles done state on a subtask line.
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
