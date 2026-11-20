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
