import {
  type Component,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { loadIndex, readRecord, updateRecordStatus } from "./storage.js";
import type {
  SpaiIndex,
  SpaiIndexEntry,
  SpaiRecord,
  SpaiStatus,
} from "./types.js";
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

export interface KanbanColumn {
  status: SpaiStatus;
  label: string;
  glyph: string;
  shortcut: string;
  colorFn: (text: string) => string;
  bgColorAnsi: string;
}

export const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    status: "todo",
    label: "TODO",
    glyph: "○",
    shortcut: "1",
    colorFn: pinkGlow,
    bgColorAnsi: "\x1b[48;2;249;77;255m\x1b[38;2;13;17;22m",
  },
  {
    status: "working",
    label: "WORKING",
    glyph: "◐",
    shortcut: "2",
    colorFn: goldGlow,
    bgColorAnsi: "\x1b[48;2;241;252;121m\x1b[38;2;13;17;22m",
  },
  {
    status: "waiting",
    label: "WAITING",
    glyph: "⏳",
    shortcut: "3",
    colorFn: violetGlow,
    bgColorAnsi: "\x1b[48;2;152;122;251m\x1b[38;2;13;17;22m",
  },
  {
    status: "done",
    label: "DONE",
    glyph: "✓",
    shortcut: "4",
    colorFn: greenGlow,
    bgColorAnsi: "\x1b[48;2;55;244;153m\x1b[38;2;13;17;22m",
  },
  {
    status: "cancelled",
    label: "CANCELLED",
    glyph: "✗",
    shortcut: "5",
    colorFn: slateGlow,
    bgColorAnsi: "\x1b[48;2;95;107;138m\x1b[38;2;255;255;255m",
  },
];

function padToWidth(text: string, width: number): string {
  const vWidth = visibleWidth(text);
  if (vWidth >= width) {
    return truncateToWidth(text, width, "…");
  }
  return text + " ".repeat(Math.max(0, width - vWidth));
}

function computeColWidths(totalWidth: number, numCols: number): number[] {
  const innerSpace = totalWidth - 2 - (numCols - 1);
  const available = Math.max(numCols, innerSpace);
  const base = Math.floor(available / numCols);
  const remainder = available % numCols;
  const widths: number[] = [];
  for (let i = 0; i < numCols; i++) {
    widths.push(base + (i < remainder ? 1 : 0));
  }
  return widths;
}

export class KanbanBoardComponent implements Component {
  private cwd: string;
  private index: SpaiIndex;
  private focusCol = 0;
  private selectedIndices: number[] = [0, 0, 0, 0, 0];
  private onOpenRecord?: (record: SpaiRecord) => void;
  private onNewTask?: () => void;
  private onClose: () => void;
  private cachedWidth?: number;
  private cachedLines?: string[];
  private onRequestRender?: () => void;
  private onStatusChange?: (taskId: string, targetStatus: SpaiStatus) => void;
  private onRealizeRecord?: (record: SpaiRecord) => void;
  private isOpening = false;

  constructor(options: {
    cwd: string;
    index: SpaiIndex;
    onOpenRecord?: (record: SpaiRecord) => void;
    onRealizeRecord?: (record: SpaiRecord) => void;
    onNewTask?: () => void;
    onClose: () => void;
    onStatusChange?: (taskId: string, targetStatus: SpaiStatus) => void;
    onRequestRender?: () => void;
  }) {
    this.cwd = options.cwd;
    this.index = options.index;
    this.onOpenRecord = options.onOpenRecord;
    this.onRealizeRecord = options.onRealizeRecord;
    this.onNewTask = options.onNewTask;
    this.onClose = options.onClose;
    this.onStatusChange = options.onStatusChange;
    this.onRequestRender = options.onRequestRender;
    this.clampSelection();
  }

  public setIndex(newIndex: SpaiIndex): void {
    this.index = newIndex;
    this.clampSelection();
    this.invalidate();
  }

  private getColumnTasks(status: SpaiStatus): SpaiIndexEntry[] {
    return this.index.records.filter(
      (r) =>
        r.status === status &&
        (r.type === "Todo" ||
          (!r.type &&
            ["todo", "working", "waiting", "done", "cancelled"].includes(
              r.status,
            ))),
    );
  }

  private getSelectedRecord(): SpaiIndexEntry | null {
    const col = KANBAN_COLUMNS[this.focusCol];
    if (!col) return null;
    const tasks = this.getColumnTasks(col.status);
    const selectedIdx = this.selectedIndices[this.focusCol] ?? 0;
    return tasks[selectedIdx] ?? null;
  }

  private clampSelection(): void {
    for (let c = 0; c < KANBAN_COLUMNS.length; c++) {
      const col = KANBAN_COLUMNS[c];
      if (!col) continue;
      const tasks = this.getColumnTasks(col.status);
      const cur = this.selectedIndices[c] ?? 0;
      if (tasks.length === 0) {
        this.selectedIndices[c] = 0;
      } else if (cur >= tasks.length) {
        this.selectedIndices[c] = tasks.length - 1;
      } else if (cur < 0) {
        this.selectedIndices[c] = 0;
      }
    }
  }

  public async moveToStatus(targetStatus: SpaiStatus): Promise<void> {
    const currentEntry = this.getSelectedRecord();
    if (!currentEntry) return;

    if (currentEntry.status === targetStatus) return;

    const targetColIdx = KANBAN_COLUMNS.findIndex(
      (c) => c.status === targetStatus,
    );
    if (targetColIdx === -1) return;

    const taskId = currentEntry.id;
    const updated = await updateRecordStatus(this.cwd, taskId, targetStatus);
    if (updated) {
      this.index = await loadIndex(this.cwd);
      this.focusCol = targetColIdx;
      const targetTasks = this.getColumnTasks(targetStatus);
      const newIdx = targetTasks.findIndex((t) => t.id === taskId);
      this.selectedIndices[targetColIdx] = newIdx >= 0 ? newIdx : 0;
      this.clampSelection();
      this.invalidate();
      this.onStatusChange?.(taskId, targetStatus);
      this.onRequestRender?.();
    }
  }

  public async moveSelectedTask(direction: "left" | "right"): Promise<void> {
    const currentEntry = this.getSelectedRecord();
    if (!currentEntry) return;

    let targetColIdx = this.focusCol;
    if (direction === "left") {
      targetColIdx =
        (this.focusCol - 1 + KANBAN_COLUMNS.length) % KANBAN_COLUMNS.length;
    } else {
      targetColIdx = (this.focusCol + 1) % KANBAN_COLUMNS.length;
    }

    const nextStatus = KANBAN_COLUMNS[targetColIdx]?.status;
    if (!nextStatus) return;

    await this.moveToStatus(nextStatus);
  }

  handleInput(data: string): void {
    // 1-key instant status move: 1..5, t, w, p, d, c, z
    if (data === "1" || data === "t") {
      void this.moveToStatus("todo");
    } else if (data === "2" || data === "w") {
      void this.moveToStatus("working");
    } else if (data === "3" || data === "p") {
      void this.moveToStatus("waiting");
    } else if (data === "4" || data === "d") {
      void this.moveToStatus("done");
    } else if (data === "5" || data === "c" || data === "z") {
      void this.moveToStatus("cancelled");
    }
    // Column navigation: Left / Right, h / l
    else if (matchesKey(data, Key.left) || data === "h") {
      if (this.focusCol > 0) {
        this.focusCol--;
        this.clampSelection();
        this.invalidate();
        this.onRequestRender?.();
      }
    } else if (matchesKey(data, Key.right) || data === "l") {
      if (this.focusCol < KANBAN_COLUMNS.length - 1) {
        this.focusCol++;
        this.clampSelection();
        this.invalidate();
        this.onRequestRender?.();
      }
    }
    // Row navigation: Up / Down, k / j
    else if (matchesKey(data, Key.up) || data === "k") {
      const curIdx = this.selectedIndices[this.focusCol] ?? 0;
      if (curIdx > 0) {
        this.selectedIndices[this.focusCol] = curIdx - 1;
        this.invalidate();
        this.onRequestRender?.();
      }
    } else if (matchesKey(data, Key.down) || data === "j") {
      const col = KANBAN_COLUMNS[this.focusCol];
      if (col) {
        const tasks = this.getColumnTasks(col.status);
        const curIdx = this.selectedIndices[this.focusCol] ?? 0;
        if (curIdx < tasks.length - 1) {
          this.selectedIndices[this.focusCol] = curIdx + 1;
          this.invalidate();
          this.onRequestRender?.();
        }
      }
    }
    // Toggle / mark done quick key: x
    else if (data === "x") {
      const current = this.getSelectedRecord();
      if (current) {
        const next = current.status === "done" ? "todo" : "done";
        void this.moveToStatus(next);
      }
    }
    // Step move right: Space / Tab / L / Shift+Right / ] / >
    else if (
      data === " " ||
      matchesKey(data, Key.space) ||
      matchesKey(data, Key.tab) ||
      data === "L" ||
      data === "]" ||
      data === ">" ||
      matchesKey(data, Key.shift("right")) ||
      matchesKey(data, Key.shift("l"))
    ) {
      void this.moveSelectedTask("right");
    }
    // Step move left: Shift+Tab / Backspace / H / Shift+Left / [ / <
    else if (
      matchesKey(data, Key.shift("tab")) ||
      matchesKey(data, Key.backspace) ||
      data === "H" ||
      data === "[" ||
      data === "<" ||
      matchesKey(data, Key.shift("left")) ||
      matchesKey(data, Key.shift("h"))
    ) {
      void this.moveSelectedTask("left");
    }
    // Realize task with agent: r
    else if (data === "r") {
      const entry = this.getSelectedRecord();
      if (entry && this.onRealizeRecord && !this.isOpening) {
        this.isOpening = true;
        void readRecord(this.cwd, entry.id)
          .then((rec) => {
            this.isOpening = false;
            if (rec && this.onRealizeRecord) {
              this.onRealizeRecord(rec);
            }
          })
          .catch(() => {
            this.isOpening = false;
          });
      }
    }
    // Open detail on Enter
    else if (matchesKey(data, Key.enter)) {
      const entry = this.getSelectedRecord();
      if (entry && this.onOpenRecord && !this.isOpening) {
        this.isOpening = true;
        void readRecord(this.cwd, entry.id)
          .then((rec) => {
            this.isOpening = false;
            if (rec && this.onOpenRecord) {
              this.onOpenRecord(rec);
            }
          })
          .catch(() => {
            this.isOpening = false;
          });
      }
    }
    // Add new task: n / a
    else if (data === "n" || data === "a") {
      this.onNewTask?.();
    }
    // Close on Esc / q
    else if (matchesKey(data, Key.escape) || data === "q") {
      this.onClose();
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines =
      width < 75 ? this.renderNarrow(width) : this.renderWide(width);

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  private renderNarrow(width: number): string[] {
    const lines: string[] = [];
    const maxRows = 10;
    const innerWidth = Math.max(10, width - 2);
    const border = (s: string) => dividerGlow(s);

    // 1. Top Outer Frame
    lines.push(border(`╭${"─".repeat(innerWidth)}╮`));

    // 2. Title & Live Stats Banner
    const counts = getStatusCounts(this.index);
    const activeTasks = counts.todo + counts.working;
    const doneTasks = counts.done;
    const totalTasks = counts.totalTasks;

    const titleLeft = defaultBold(pinkGlow(" ◈ SPAI BOARD ◈"));
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
      const tasks = this.getColumnTasks(col.status);
      const isFocused = this.focusCol === idx;
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
    const activeCol = KANBAN_COLUMNS[this.focusCol] ?? KANBAN_COLUMNS[0];
    const activeTasksList = this.getColumnTasks(activeCol.status);
    const colHeader = defaultBold(
      activeCol.colorFn(
        `  ${activeCol.glyph} ${activeCol.label} [${activeCol.shortcut}] — ${activeTasksList.length} úkolů (←/→ pro přepnutí)`,
      ),
    );
    lines.push(border("│") + padToWidth(colHeader, innerWidth) + border("│"));
    lines.push(border(`├${"─".repeat(innerWidth)}┤`));

    // 6. Task List Rows
    const curIdx = this.selectedIndices[this.focusCol] ?? 0;
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
    const selectedTask = this.getSelectedRecord();
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

  private renderWide(width: number): string[] {
    const lines: string[] = [];
    const maxRows = 10;
    const numCols = KANBAN_COLUMNS.length;
    const colWidths = computeColWidths(width, numCols);

    const innerWidth = width - 2; // inside left/right border
    const border = (s: string) => dividerGlow(s);

    // 1. Top Outer Frame
    lines.push(border(`╭${"─".repeat(innerWidth)}╮`));

    // 2. Title & Live Stats Banner
    const countsWide = getStatusCounts(this.index);
    const activeTasks = countsWide.todo + countsWide.working;
    const doneTasks = countsWide.done;
    const totalTasks = countsWide.totalTasks;

    const titleLeft = defaultBold(pinkGlow(" ◈ SPAI KANBAN BOARD ◈"));
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
    const hintText = `  ${cyanGlow("←→")}: sloupec  ${cyanGlow("↑↓")}: úkol  ${cyanGlow("1-5")}: stav  ${cyanGlow("r")}: realize (řešit)  ${cyanGlow("enter")}: detail  ${cyanGlow("n")}: nový  ${cyanGlow("esc")}: zavřít`;
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
      const tasks = this.getColumnTasks(col.status);
      const isFocused = this.focusCol === c;

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
        const tasks = this.getColumnTasks(col.status);
        const task = tasks[r];
        const isFocused = this.focusCol === c;
        const isSelected = isFocused && this.selectedIndices[c] === r;

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
    const selectedTask = this.getSelectedRecord();
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
      const activeCol = KANBAN_COLUMNS[this.focusCol];
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

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

function colBadge(status: SpaiStatus): string {
  const col = KANBAN_COLUMNS.find((c) => c.status === status);
  if (!col) return status;
  return col.colorFn(`[${col.glyph} ${col.label}]`);
}
