import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { formatSpaiLine } from "./spai.js";
import type {
  SpaiIndex,
  SpaiNoteType,
  SpaiRecord,
  SpaiStatus,
} from "./types.js";

export interface StyleTheme {
  fg?: (color: ThemeColor, text: string) => string;
  bg?: (color: Parameters<Theme["bg"]>[0], text: string) => string;
  bold?: (text: string) => string;
  italic?: (text: string) => string;
  underline?: (text: string) => string;
}

// Linkarzu theme colors from mozek_rust
const LINKARZU_TODO = "\x1b[38;2;249;77;255m"; // #f94dff (vivid pink)
const LINKARZU_WORKING = "\x1b[38;2;241;252;121m"; // #f1fc79 (electric yellow)
const LINKARZU_WAITING = "\x1b[38;2;152;122;251m"; // #987afb (neon violet/purple)
const LINKARZU_DONE = "\x1b[38;2;55;244;153m"; // #37f499 (neon mint green)
const LINKARZU_CANCELLED = "\x1b[38;2;135;145;170m"; // #5f6b8a (slate grey)
const LINKARZU_CYAN = "\x1b[38;2;4;209;249m"; // #04d1f9 (neon cyan / accent)
const LINKARZU_CORAL = "\x1b[38;2;241;108;117m"; // #f16c75 (coral / danger)
const LINKARZU_BORDER = "\x1b[38;2;60;75;105m"; // #314154 (border)

export function pinkGlow(text: string): string {
  return `${LINKARZU_TODO}${text}\x1b[39m`;
}

export function cyanGlow(text: string): string {
  return `${LINKARZU_CYAN}${text}\x1b[39m`;
}

export function greenGlow(text: string): string {
  return `${LINKARZU_DONE}${text}\x1b[39m`;
}

export function goldGlow(text: string): string {
  return `${LINKARZU_WORKING}${text}\x1b[39m`;
}

export function coralGlow(text: string): string {
  return `${LINKARZU_CORAL}${text}\x1b[39m`;
}

export function violetGlow(text: string): string {
  return `${LINKARZU_WAITING}${text}\x1b[39m`;
}

export function slateGlow(text: string): string {
  return `${LINKARZU_CANCELLED}${text}\x1b[39m`;
}

export function dividerGlow(text: string): string {
  return `${LINKARZU_BORDER}${text}\x1b[39m`;
}

export function defaultBold(text: string): string {
  return `\x1b[1m${text}\x1b[22m`;
}

export function defaultItalic(text: string): string {
  return `\x1b[3m${text}\x1b[23m`;
}

export function defaultUnderline(text: string): string {
  return `\x1b[4m${text}\x1b[24m`;
}

export function resolveTheme(theme?: StyleTheme): Required<StyleTheme> {
  return {
    fg: (color, text) => (theme?.fg ? theme.fg(color, text) : pinkGlow(text)),
    bg: (color, text) => (theme?.bg ? theme.bg(color, text) : text),
    bold: (text) => (theme?.bold ? theme.bold(text) : defaultBold(text)),
    italic: (text) =>
      theme?.italic ? theme.italic(text) : defaultItalic(text),
    underline: (text) =>
      theme?.underline ? theme.underline(text) : defaultUnderline(text),
  };
}

export function renderSpaiStatusBadge(status: SpaiStatus): string {
  switch (status) {
    case "done":
      return greenGlow("✓ done");
    case "working":
      return goldGlow("◐ working");
    case "waiting":
      return violetGlow("⏳ waiting");
    case "todo":
      return pinkGlow("○ todo");
    case "cancelled":
      return slateGlow("✗ cancelled");
    case "idea":
      return cyanGlow("💡 idea");
    case "note":
    default:
      return violetGlow("• note");
  }
}

export function renderSpaiTypeBadge(type: SpaiNoteType): string {
  switch (type) {
    case "Todo":
      return pinkGlow("[TODO]");
    case "Idea":
      return cyanGlow("[IDEA]");
    case "Note":
    default:
      return violetGlow("[NOTE]");
  }
}

/**
 * Strips raw Markdown syntax characters.
 */
export function stripMarkdownSyntax(text: string): string {
  return text
    .replace(/\*\*\*(.*?)\*\*\*/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/___(.*?)___/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#+\s+/gm, "");
}

/**
 * Formats a SPAI record into clean TUI Reading Mode.
 */
export function formatReadingMode(
  record: SpaiRecord,
  theme?: StyleTheme,
): string {
  const t = resolveTheme(theme);
  const divider = dividerGlow("━".repeat(68));
  const pipe = pinkGlow("│");

  const lines = [
    t.bold(pinkGlow(`◈ ${record.id}: ${record.title.toUpperCase()}`)),
    divider,
    `  ${violetGlow("Typ:")}         ${renderSpaiTypeBadge(record.type)}  ${renderSpaiStatusBadge(record.status)}`,
    `  ${violetGlow("Vytvořeno:")}   ${t.fg("dim", record.timestamp)}`,
    `  ${violetGlow("Projekt:")}     ${t.fg("dim", record.project || "nezadáno")}`,
  ];

  if (record.deadline) {
    lines.push(
      `  ${violetGlow("Termín:")}      ${goldGlow(`⏰ ${record.deadline}`)}`,
    );
  }
  if (record.priority) {
    lines.push(
      `  ${violetGlow("Priorita:")}    ${coralGlow(`⚡ ${record.priority.toUpperCase()}`)}`,
    );
  }
  if (record.tags.length > 0) {
    lines.push(
      `  ${violetGlow("Štítky:")}      ${violetGlow(record.tags.map((tg) => `:${tg}:`).join(" "))}`,
    );
  }

  lines.push(divider);
  lines.push("");
  lines.push(`  ${t.bold(cyanGlow("◆ OBSAH A PODÚKOLY"))}`);

  const bodyLines = record.body
    .split("\n")
    .map((l) => `  ${pipe} ${formatSpaiLine(stripMarkdownSyntax(l))}`)
    .join("\n");

  lines.push(bodyLines);
  lines.push("");
  lines.push(divider);

  return lines.join("\n");
}

/**
 * Renders SPAI header summary box for TUI.
 */
export function renderDirectoryHeader(
  index: SpaiIndex,
  dirPath: string,
  theme?: StyleTheme,
): string[] {
  const t = resolveTheme(theme);
  const todos = index.records.filter((r) => r.status === "todo").length;
  const working = index.records.filter((r) => r.status === "working").length;
  const waiting = index.records.filter((r) => r.status === "waiting").length;
  const done = index.records.filter((r) => r.status === "done").length;
  const ideas = index.records.filter((r) => r.type === "Idea").length;
  const notes = index.records.filter((r) => r.type === "Note").length;

  const stats = [
    pinkGlow(`○ ${todos} todo`),
    goldGlow(`◐ ${working} rozpracováno`),
    violetGlow(`⏳ ${waiting} čeká`),
    greenGlow(`✓ ${done} hotovo`),
    cyanGlow(`💡 ${ideas} nápadů`),
    violetGlow(`• ${notes} poznámek`),
  ].join("  ");

  return [
    t.bold(pinkGlow("  ◈ SPAI TASK & IDEA LEDGER")),
    `  ${violetGlow("Složka:")}   ${t.fg("dim", dirPath)}`,
    `  ${violetGlow("Položky:")}  ${t.bold(String(index.records.length))} celkem  [${stats}]`,
    `  ${violetGlow("Změněno:")}  ${t.fg("dim", index.lastUpdated || "nikdy")}`,
  ];
}

/**
 * Formats a compact, colorful SPAI syntax dashboard statusline string for the Pi agent.
 * Only displays indicators that have active / non-zero counts to save statusline space.
 * Returns undefined if there are no records or all counts are zero.
 */
export function formatStatusLine(index?: SpaiIndex | null): string | undefined {
  if (!index || !index.records || index.records.length === 0) {
    return undefined;
  }

  const todos = index.records.filter((r) => r.status === "todo").length;
  const working = index.records.filter((r) => r.status === "working").length;
  const waiting = index.records.filter((r) => r.status === "waiting").length;
  const done = index.records.filter((r) => r.status === "done").length;
  const cancelled = index.records.filter(
    (r) => r.status === "cancelled",
  ).length;
  const ideas = index.records.filter(
    (r) =>
      r.status === "idea" ||
      (r.type === "Idea" &&
        r.status !== "todo" &&
        r.status !== "working" &&
        r.status !== "waiting" &&
        r.status !== "done" &&
        r.status !== "cancelled"),
  ).length;
  const notes = index.records.filter(
    (r) =>
      r.status === "note" ||
      (r.type === "Note" &&
        r.status !== "todo" &&
        r.status !== "working" &&
        r.status !== "waiting" &&
        r.status !== "done" &&
        r.status !== "cancelled" &&
        r.status !== "inbox"),
  ).length;
  const highPrio = index.records.filter(
    (r) =>
      r.priority === "high" &&
      (r.status === "todo" ||
        r.status === "working" ||
        r.status === "waiting"),
  ).length;

  const parts: string[] = [];

  if (highPrio > 0) {
    parts.push(coralGlow(`! ${highPrio}`));
  }
  if (todos > 0) {
    parts.push(pinkGlow(`. ${todos}`));
  }
  if (working > 0) {
    parts.push(goldGlow(`/ ${working}`));
  }
  if (waiting > 0) {
    parts.push(violetGlow(`/. ${waiting}`));
  }
  if (done > 0) {
    parts.push(greenGlow(`X ${done}`));
  }
  if (cancelled > 0) {
    parts.push(slateGlow(`Z ${cancelled}`));
  }
  if (ideas > 0) {
    parts.push(cyanGlow(`? ${ideas}`));
  }
  if (notes > 0) {
    parts.push(violetGlow(`- ${notes}`));
  }

  if (parts.length === 0) {
    return undefined;
  }

  const prefix = pinkGlow("SPAI:");
  return `${prefix} ${parts.join("  ")}`;
}

/**
 * Renders ASCII table of SPAI tasks/ideas/notes.
 */
export function renderDirectoryTable(
  index: SpaiIndex,
  dirPath = "docs/spai",
  theme?: StyleTheme,
): string {
  const t = resolveTheme(theme);
  const lines: string[] = [];

  lines.push(
    dividerGlow(
      "┌─ ◈ SPAI PROJEKTOVÝ LEDGER ─────────────────────────────────────────────────┐",
    ),
  );
  for (const hLine of renderDirectoryHeader(index, dirPath, theme)) {
    lines.push(hLine);
  }
  lines.push(
    dividerGlow(
      "├──────────┬─────────────┬──────────────┬────────────────────────────────────┤",
    ),
  );
  lines.push(
    `│ ${t.bold(pinkGlow("ID       "))} │ ${t.bold(pinkGlow("STAV        "))} │ ${t.bold(pinkGlow("TYP          "))} │ ${t.bold(pinkGlow("TITULEK A ŠTÍTKY                     "))} │`,
  );
  lines.push(
    dividerGlow(
      "├──────────┼─────────────┼──────────────┼────────────────────────────────────┤",
    ),
  );

  if (index.records.length === 0) {
    lines.push(
      `│ ${t.fg("dim", "Žádné SPAI úkoly, nápady ani poznámky v docs/spai/                    ")} │`,
    );
  } else {
    for (const r of index.records) {
      const idCol = t.bold(pinkGlow(r.id.padEnd(8)));
      const statusCol = renderSpaiStatusBadge(r.status).padEnd(17);
      const typeCol = renderSpaiTypeBadge(r.type).padEnd(18);
      const tagsStr =
        r.tags.length > 0 ? ` ${violetGlow(`:${r.tags.join(":")}:`)}` : "";
      const truncatedTitle =
        r.title.length > 28 ? `${r.title.slice(0, 25)}...` : r.title;
      const titleCol = `${truncatedTitle}${tagsStr}`.padEnd(34);

      lines.push(`│ ${idCol} │ ${statusCol} │ ${typeCol} │ ${titleCol} │`);
    }
  }

  lines.push(
    dividerGlow(
      "└──────────┴─────────────┴──────────────┴────────────────────────────────────┘",
    ),
  );
  lines.push(
    t.fg(
      "dim",
      "  Příkazy: /spai list • /spai new <text> • /spai show <id> • /spai toggle <id>",
    ),
  );

  return lines.join("\n");
}
