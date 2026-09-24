// Renderers: badges, reading mode, highlighting and directory views.
import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";


import { formatSpaiLine } from "./spai.js";


import type {
  SpaiIndex,
  SpaiNoteType,
  SpaiRecord,
  SpaiStatus,
} from "./types.js";

import {
	pinkGlow,
	cyanGlow,
	greenGlow,
	goldGlow,
	coralGlow,
	violetGlow,
	slateGlow,
	dividerGlow,
	resolveTheme,
	type StyleTheme,
} from "./theme.js";
import { SpaiStatusCounts, getStatusCounts } from "./status-counts.js";

// Re-exported so existing consumers can keep importing from this module.
export * from "./theme.js";
export * from "./status-counts.js";

/**
 * Renders a full multi-segmented colored SPAI Status Ribbon bar.
 * Matches 1:1 with mozek_rust / tui status ribbon specification:
 * Segments: [Done (green) | Working (yellow) | Waiting (violet) | Todo (pink) | Cancelled (slate)]
 * Followed by [Done/Total] and completion percentage.
 */
export function renderSpaiRibbon(
  counts: SpaiStatusCounts,
  barWidth = 24,
): string {
  const total = counts.total;
  if (total === 0 || barWidth <= 0) {
    return dividerGlow("⣿".repeat(Math.max(1, barWidth)));
  }

  const seg = (count: number): number => {
    if (total === 0) return 0;
    return Math.round((count / total) * barWidth);
  };

  let sDone = seg(counts.done);
  let sProg = seg(counts.working);
  const sWait = seg(counts.waiting);
  const sCancel = seg(counts.cancelled);
  let sPending = Math.max(0, barWidth - (sDone + sProg + sWait + sCancel));

  // Fix rounding overshoot
  const sum = sDone + sProg + sWait + sCancel + sPending;
  if (sum > barWidth) {
    const diff = sum - barWidth;
    if (sPending >= diff) sPending -= diff;
    else if (sDone >= diff) sDone -= diff;
    else if (sProg >= diff) sProg -= diff;
  }

  const pct = Math.round((counts.done / total) * 100);

  const ribbon =
    greenGlow("⣿".repeat(sDone)) +
    goldGlow("⣿".repeat(sProg)) +
    violetGlow("⣿".repeat(sWait)) +
    pinkGlow("⣿".repeat(sPending)) +
    slateGlow("⣿".repeat(sCancel));

  const stats = ` ${greenGlow(`[${counts.done}/${total}]`)} ${dividerGlow(`${pct}%`)}`;
  return `${ribbon}${stats}`;
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

  if (record.subtasks && record.subtasks.length > 0) {
    const subDone = record.subtasks.filter((s) => s.done).length;
    const subTotal = record.subtasks.length;
    const subCounts: SpaiStatusCounts = {
      done: subDone,
      working: 0,
      waiting: 0,
      todo: subTotal - subDone,
      cancelled: 0,
      ideas: 0,
      notes: 0,
      totalTasks: subTotal,
      totalItems: subTotal,
      total: subTotal,
    };
    lines.push(
      `  ${violetGlow("Podúkoly:")}    ${renderSpaiRibbon(subCounts, 20)}`,
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
  const counts = getStatusCounts(index);

  const ribbon = renderSpaiRibbon(counts, 24);

  const stats = [
    pinkGlow(`○ ${counts.todo} todo`),
    goldGlow(`◐ ${counts.working} rozpracováno`),
    violetGlow(`⏳ ${counts.waiting} čeká`),
    greenGlow(`✓ ${counts.done} hotovo`),
  ];
  if (counts.cancelled > 0) {
    stats.push(slateGlow(`✗ ${counts.cancelled} zrušeno`));
  }
  if (counts.ideas > 0) {
    stats.push(cyanGlow(`💡 ${counts.ideas} nápadů`));
  }
  if (counts.notes > 0) {
    stats.push(violetGlow(`• ${counts.notes} poznámek`));
  }

  const itemsInfo =
    counts.totalItems === counts.totalTasks
      ? `${t.bold(String(counts.totalTasks))} úkolů`
      : `${t.bold(String(counts.totalTasks))} úkolů (${counts.totalItems} položek celkem)`;

  return [
    t.bold(pinkGlow("  ◈ SPAI TASK & IDEA LEDGER")),
    `  ${violetGlow("Složka:")}   ${t.fg("dim", dirPath)}`,
    `  ${violetGlow("Ribbon:")}   ${ribbon}`,
    `  ${violetGlow("Položky:")}  ${itemsInfo}  [${stats.join("  ")}]`,
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

  const counts = getStatusCounts(index);
  const highPrio = index.records.filter(
    (r) =>
      r.priority === "high" &&
      r.type !== "Idea" &&
      r.type !== "Note" &&
      (r.status === "todo" || r.status === "working" || r.status === "waiting"),
  ).length;

  const parts: string[] = [];

  if (highPrio > 0) {
    parts.push(coralGlow(`! ${highPrio}`));
  }
  if (counts.todo > 0) {
    parts.push(pinkGlow(`. ${counts.todo}`));
  }
  if (counts.working > 0) {
    parts.push(goldGlow(`/ ${counts.working}`));
  }
  if (counts.waiting > 0) {
    parts.push(violetGlow(`/. ${counts.waiting}`));
  }
  if (counts.done > 0) {
    parts.push(greenGlow(`X ${counts.done}`));
  }
  if (counts.cancelled > 0) {
    parts.push(slateGlow(`Z ${counts.cancelled}`));
  }
  if (counts.ideas > 0) {
    parts.push(cyanGlow(`? ${counts.ideas}`));
  }
  if (counts.notes > 0) {
    parts.push(violetGlow(`- ${counts.notes}`));
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
