/**
 * The wide board grid and the project-picker overlay.
 * Split out of `kanban.ts`; both take an explicit `KanbanView`.
 */
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { SpaiIndex } from "./types.js";
import {
  coralGlow,
  cyanGlow,
  defaultBold,
  dividerGlow,
  getStatusCounts,
  goldGlow,
  greenGlow,
  pinkGlow,
  renderSpaiRibbon,
  slateGlow,
  violetGlow,
} from "./viewer.js";
import { KANBAN_COLUMNS } from "./kanban-model.js";
import { getVisibleRecords, getColumnTasks, getSelectedRecord, getPickerOptions, getFilterLabel, padToWidth, computeColWidths, colBadge, KanbanView } from "./kanban-view.js";

export function renderProjectPicker(view: KanbanView, width: number) : string[] {
  const lines: string[] = [];
  const innerWidth = Math.max(10, width - 2);
  const border = (s: string) => dividerGlow(s);
  const options = getPickerOptions(view);

  lines.push(border(`╭${"─".repeat(innerWidth)}╮`));
  lines.push(
    border("│") +
      padToWidth(
        defaultBold(violetGlow(" ◈ VÝBĚR PROJEKTU ◈")),
        innerWidth,
      ) +
      border("│"),
  );
  lines.push(border(`├${"─".repeat(innerWidth)}┤`));

  options.forEach((opt, idx) => {
    const marker = opt.value === "ALL" ? "★" : "📁";
    const raw = ` ${idx === view.pickerIdx ? "▶" : " "} ${marker} ${opt.label}`;
    const styled =
      idx === view.pickerIdx
        ? defaultBold(cyanGlow(truncateToWidth(raw, innerWidth, "…")))
        : dividerGlow(truncateToWidth(raw, innerWidth, "…"));
    lines.push(border("│") + padToWidth(styled, innerWidth) + border("│"));
  });

  lines.push(border(`├${"─".repeat(innerWidth)}┤`));
  lines.push(
    border("│") +
      padToWidth(
        cyanGlow(
          "  ↑/↓ nebo j/k: výběr   enter: potvrdit   esc/q: zavřít",
        ),
        innerWidth,
      ) +
      border("│"),
  );
  lines.push(border(`╰${"─".repeat(innerWidth)}╯`));
  return lines;
}

export function renderWide(view: KanbanView, width: number) : string[] {
  const lines: string[] = [];
  const maxRows = 10;
  const numCols = KANBAN_COLUMNS.length;
  const colWidths = computeColWidths(width, numCols);

  const innerWidth = width - 2; // inside left/right border
  const border = (s: string) => dividerGlow(s);

  // 1. Top Outer Frame
  lines.push(border(`╭${"─".repeat(innerWidth)}╮`));

  // 2. Title & Live Stats Banner
  const countsWide = getStatusCounts({ records: getVisibleRecords(view) } as SpaiIndex);
  const activeTasks = countsWide.todo + countsWide.working;
  const doneTasks = countsWide.done;
  const totalTasks = countsWide.totalTasks;

  const titleLeft = defaultBold(
    pinkGlow(` ◈ SPAI KANBAN · ${getFilterLabel(view)} ◈`),
  );
  const extraInfo =
    countsWide.ideas > 0 || countsWide.notes > 0
      ? ` (${countsWide.totalItems} celkem)`
      : "";
  const statsRight = `${goldGlow(`⚡ ${activeTasks} aktivních`)}  ${greenGlow(`✓ ${doneTasks} hotovo`)}  ${violetGlow(`Σ ${totalTasks} úkolů${extraInfo}`)} `;
  const bannerSpaces = Math.max(
    1,
    innerWidth - visibleWidth(titleLeft) - visibleWidth(statsRight),
  );
  lines.push(
    border("│") +
      padToWidth(
        truncateToWidth(
          `${titleLeft}${" ".repeat(bannerSpaces)}${statsRight}`,
          innerWidth,
        ),
        innerWidth,
      ) +
      border("│"),
  );

  // 3. Status Ribbon Row
  const ribbonWide = ` ${renderSpaiRibbon(countsWide, Math.max(10, innerWidth - 14))}`;
  lines.push(border("│") + padToWidth(ribbonWide, innerWidth) + border("│"));

  // 4. Compact Hints / Hotkeys Line
  const hintText = `  ${cyanGlow("←→")}: sloupec  ${cyanGlow("↑↓")}: úkol  ${cyanGlow("1-5")}: stav  ${cyanGlow("p")}: projekt  ${cyanGlow("o")}: výběr  ${cyanGlow("r")}: realize  ${cyanGlow("enter")}: detail  ${cyanGlow("n")}: nový  ${cyanGlow("esc")}: zavřít`;
  lines.push(border("│") + padToWidth(hintText, innerWidth) + border("│"));

  // 4. Header Top Grid Border
  const headerTopSep = colWidths.map((w) => "─".repeat(w)).join("┬");
  lines.push(border(`├${headerTopSep}┤`));

  // 5. Column Headers
  const headerSegments: string[] = [];
  for (let c = 0; c < numCols; c++) {
    const col = KANBAN_COLUMNS[c];
    const w = colWidths[c] ?? 16;
    if (!col) continue;
    const tasks = getColumnTasks(view, col.status);
    const isFocused = view.focusCol === c;

    const badge = `[${col.shortcut}]`;
    const countStr = `(${tasks.length})`;

    let headerStr: string;
    if (isFocused) {
      const titleText = `${col.glyph} ${col.label} ${badge} ${countStr}`;
      headerStr = defaultBold(col.colorFn(` ▶ ${titleText}`));
    } else {
      const titleText = `${col.glyph} ${col.label} ${badge} ${countStr}`;
      headerStr = col.colorFn(`   ${titleText}`);
    }
    headerSegments.push(padToWidth(headerStr, w));
  }
  lines.push(border("│") + headerSegments.join(border("│")) + border("│"));

  // 6. Header Bottom Grid Border
  const headerBottomSep = colWidths.map((w) => "─".repeat(w)).join("┼");
  lines.push(border(`├${headerBottomSep}┤`));

  // 7. Column Task Rows
  for (let r = 0; r < maxRows; r++) {
    const rowSegments: string[] = [];
    for (let c = 0; c < numCols; c++) {
      const col = KANBAN_COLUMNS[c];
      const w = colWidths[c] ?? 16;
      if (!col) {
        rowSegments.push(" ".repeat(w));
        continue;
      }
      const tasks = getColumnTasks(view, col.status);
      const task = tasks[r];
      const isFocused = view.focusCol === c;
      const isSelected = isFocused && view.selectedIndices[c] === r;

      if (task) {
        const prioMark = task.priority === "high" ? "⚡" : "";
        const id = task.id.replace(/^SPAI-0*/i, "#");
        const availWidth = Math.max(8, w - 3);
        const rawContent = `${id} ${task.title}${prioMark ? " " + prioMark : ""}`;
        const truncatedContent = truncateToWidth(rawContent, availWidth, "…");

        let cellText: string;
        if (isSelected) {
          const highlighted = `${col.bgColorAnsi} \x1b[1m${truncatedContent}\x1b[0m`;
          cellText = ` ▸${highlighted}`;
        } else {
          const styledId = col.colorFn(id);
          const displayTitle = task.title.slice(
            0,
            Math.max(4, availWidth - id.length - 1),
          );
          const styledPrio = prioMark ? coralGlow(` ${prioMark}`) : "";
          cellText = `   ${styledId} ${displayTitle}${styledPrio}`;
        }
        rowSegments.push(padToWidth(cellText, w));
      } else if (r === 0 && tasks.length === 0) {
        const emptyText = isFocused
          ? col.colorFn("   · prázdné ·")
          : dividerGlow("   · — ·");
        rowSegments.push(padToWidth(emptyText, w));
      } else {
        rowSegments.push(" ".repeat(w));
      }
    }
    lines.push(border("│") + rowSegments.join(border("│")) + border("│"));
  }

  // 8. Grid Bottom Border
  const gridBottomSep = colWidths.map((w) => "─".repeat(w)).join("┴");
  lines.push(border(`├${gridBottomSep}┤`));

  // 9. Active Task Inspector Footer
  const selectedTask = getSelectedRecord(view);
  let footerDetail: string;
  if (selectedTask) {
    const idStr = pinkGlow(selectedTask.id);
    const titleStr = defaultBold(selectedTask.title);
    const statusBadge = colBadge(selectedTask.status);
    const prioStr =
      selectedTask.priority === "high"
        ? coralGlow(" ⚡ VYSOKÁ")
        : selectedTask.priority === "low"
          ? slateGlow(" ▽ NÍZKÁ")
          : "";
    const deadStr = selectedTask.deadline
      ? goldGlow(` ⏰ ${selectedTask.deadline}`)
      : "";
    const tagsStr =
      selectedTask.tags.length > 0
        ? violetGlow(` :${selectedTask.tags.join(":")}:`)
        : "";

    footerDetail = ` ▶ ${idStr} ${titleStr} ${statusBadge}${prioStr}${deadStr}${tagsStr}`;
  } else {
    const activeCol = KANBAN_COLUMNS[view.focusCol];
    const colName = activeCol?.label ?? "SLOUPEC";
    footerDetail = violetGlow(
      `   Sloupec ${colName} je prázdný — stiskni [n] pro přidání nového úkolu.`,
    );
  }
  lines.push(
    border("│") + padToWidth(footerDetail, innerWidth) + border("│"),
  );

  // 10. Bottom Outer Frame
  lines.push(border(`╰${"─".repeat(innerWidth)}╯`));

  return lines;
}
