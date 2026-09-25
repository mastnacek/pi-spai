/**
 * The narrow single-column view (below 75 columns), with its tab strip.
 * Split out of `kanban.ts`; takes an explicit `KanbanView`.
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
import { getVisibleRecords, getColumnTasks, getSelectedRecord, getFilterLabel, padToWidth, colBadge, KanbanView } from "./kanban-view.js";

export function renderNarrow(view: KanbanView, width: number) : string[] {
  const lines: string[] = [];
  const maxRows = 10;
  const innerWidth = Math.max(10, width - 2);
  const border = (s: string) => dividerGlow(s);

  // 1. Top Outer Frame
  lines.push(border(`╭${"─".repeat(innerWidth)}╮`));

  // 2. Title & Live Stats Banner
  const counts = getStatusCounts({ records: getVisibleRecords(view) } as SpaiIndex);
  const activeTasks = counts.todo + counts.working;
  const doneTasks = counts.done;
  const totalTasks = counts.totalTasks;

  const titleLeft = defaultBold(
    pinkGlow(` ◈ SPAI BOARD · ${getFilterLabel(view)} ◈`),
  );
  const statsRight = `${goldGlow(`⚡${activeTasks}`)} ${greenGlow(`✓${doneTasks}`)} ${violetGlow(`Σ${totalTasks}`)} `;
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

  // 3. Horizontal Status Tabs Row
  const tabSegments = KANBAN_COLUMNS.map((col, idx) => {
    const tasks = getColumnTasks(view, col.status);
    const isFocused = view.focusCol === idx;
    const label = `${col.shortcut} ${col.glyph}`;
    const count = `${tasks.length}`;
    if (isFocused) {
      return `${col.bgColorAnsi} \x1b[1m▶ ${label} (${count}) ◀\x1b[0m`;
    }
    return col.colorFn(`[${label}:${count}]`);
  });
  lines.push(
    border("│") +
      padToWidth(` ${tabSegments.join(" ")}`, innerWidth) +
      border("│"),
  );

  // 4. Status Ribbon Row
  const ribbonStr = ` ${renderSpaiRibbon(counts, Math.max(10, innerWidth - 14))}`;
  lines.push(border("│") + padToWidth(ribbonStr, innerWidth) + border("│"));

  // 5. Divider under Tabs
  lines.push(border(`├${"─".repeat(innerWidth)}┤`));

  // 5. Active Column Banner
  const activeCol = KANBAN_COLUMNS[view.focusCol] ?? KANBAN_COLUMNS[0];
  const activeTasksList = getColumnTasks(view, activeCol.status);
  const colHeader = defaultBold(
    activeCol.colorFn(
      `  ${activeCol.glyph} ${activeCol.label} [${activeCol.shortcut}] — ${activeTasksList.length} úkolů (←/→ pro přepnutí)`,
    ),
  );
  lines.push(border("│") + padToWidth(colHeader, innerWidth) + border("│"));
  lines.push(border(`├${"─".repeat(innerWidth)}┤`));

  // 6. Task List Rows
  const curIdx = view.selectedIndices[view.focusCol] ?? 0;
  if (activeTasksList.length === 0) {
    lines.push(
      border("│") +
        padToWidth(
          dividerGlow(
            "   · Žádné úkoly v tomto sloupci · (stiskni [n] pro nový)",
          ),
          innerWidth,
        ) +
        border("│"),
    );
    for (let r = 1; r < maxRows; r++) {
      lines.push(border("│") + " ".repeat(innerWidth) + border("│"));
    }
  } else {
    for (let r = 0; r < maxRows; r++) {
      const task = activeTasksList[r];
      if (task) {
        const isSelected = r === curIdx;
        const prioMark =
          task.priority === "high"
            ? coralGlow(" ⚡")
            : task.priority === "low"
              ? slateGlow(" ▽")
              : "";
        const deadMark = task.deadline ? goldGlow(` ⏰${task.deadline}`) : "";
        const tagsMark =
          task.tags.length > 0 ? violetGlow(` :${task.tags.join(":")}:`) : "";
        const id = task.id.replace(/^SPAI-0*/i, "#");
        const meta = `${prioMark}${deadMark}${tagsMark}`;
        const metaW = visibleWidth(meta);

        if (isSelected) {
          const prefix = " ▸ ";
          const availTitle = Math.max(
            4,
            innerWidth - visibleWidth(prefix) - id.length - metaW - 2,
          );
          const truncatedTitle = truncateToWidth(task.title, availTitle, "…");
          const leftPart = `${prefix}${id} ${truncatedTitle}`;
          const spaces = Math.max(
            1,
            innerWidth - visibleWidth(leftPart) - metaW - 2,
          );
          const content = `${leftPart}${" ".repeat(spaces)}${meta} `;
          const highlighted = `${activeCol.bgColorAnsi}\x1b[1m${padToWidth(content, innerWidth)}\x1b[0m`;
          lines.push(border("│") + highlighted + border("│"));
        } else {
          const prefix = "   ";
          const styledId = activeCol.colorFn(id);
          const availTitle = Math.max(
            4,
            innerWidth - visibleWidth(prefix) - id.length - metaW - 2,
          );
          const truncatedTitle = truncateToWidth(task.title, availTitle, "…");
          const leftPart = `${prefix}${styledId} ${truncatedTitle}`;
          const spaces = Math.max(
            1,
            innerWidth - visibleWidth(leftPart) - metaW - 2,
          );
          const content = `${leftPart}${" ".repeat(spaces)}${meta} `;
          lines.push(
            border("│") + padToWidth(content, innerWidth) + border("│"),
          );
        }
      } else {
        lines.push(border("│") + " ".repeat(innerWidth) + border("│"));
      }
    }
  }

  // 7. Divider before Inspector
  lines.push(border(`├${"─".repeat(innerWidth)}┤`));

  // 8. Active Task Inspector Footer
  const selectedTask = getSelectedRecord(view);
  let footerDetail: string;
  if (selectedTask) {
    const idStr = pinkGlow(selectedTask.id);
    const titleStr = defaultBold(selectedTask.title);
    const statusBadge = colBadge(selectedTask.status);
    const prioStr =
      selectedTask.priority === "high"
        ? coralGlow(" ⚡VYSOKÁ")
        : selectedTask.priority === "low"
          ? slateGlow(" ▽NÍZKÁ")
          : "";
    const deadStr = selectedTask.deadline
      ? goldGlow(` ⏰${selectedTask.deadline}`)
      : "";
    const tagsStr =
      selectedTask.tags.length > 0
        ? violetGlow(` :${selectedTask.tags.join(":")}:`)
        : "";

    footerDetail = ` ▶ ${idStr} ${titleStr} ${statusBadge}${prioStr}${deadStr}${tagsStr}`;
  } else {
    const colName = activeCol?.label ?? "SLOUPEC";
    footerDetail = violetGlow(
      `   Sloupec ${colName} je prázdný — stiskni [n] pro přidání úkolu.`,
    );
  }
  lines.push(
    border("│") + padToWidth(footerDetail, innerWidth) + border("│"),
  );

  // 9. Compact Hotkeys Line
  const hintText = `  ${cyanGlow("←→")}: sloupec  ${cyanGlow("↑↓")}: úkol  ${cyanGlow("1-5")}: stav  ${cyanGlow("r")}: realize  ${cyanGlow("enter")}: detail  ${cyanGlow("esc")}: zavřít`;
  lines.push(border("│") + padToWidth(hintText, innerWidth) + border("│"));

  // 10. Bottom Outer Frame
  lines.push(border(`╰${"─".repeat(innerWidth)}╯`));

  return lines;
}
