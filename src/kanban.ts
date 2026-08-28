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
  defaultBold,
  dividerGlow,
  goldGlow,
  greenGlow,
  pinkGlow,
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

  constructor(options: {
    cwd: string;
    index: SpaiIndex;
    onOpenRecord?: (record: SpaiRecord) => void;
    onNewTask?: () => void;
    onClose: () => void;
    onRequestRender?: () => void;
  }) {
    this.cwd = options.cwd;
    this.index = options.index;
    this.onOpenRecord = options.onOpenRecord;
    this.onNewTask = options.onNewTask;
    this.onClose = options.onClose;
    this.onRequestRender = options.onRequestRender;
    this.clampSelection();
  }

  public setIndex(newIndex: SpaiIndex): void {
    this.index = newIndex;
    this.clampSelection();
    this.invalidate();
  }

  private getColumnTasks(status: SpaiStatus): SpaiIndexEntry[] {
    return this.index.records.filter((r) => r.status === status);
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
    // Open detail on Enter
    else if (matchesKey(data, Key.enter)) {
      const entry = this.getSelectedRecord();
      if (entry && this.onOpenRecord) {
        void (async () => {
          const rec = await readRecord(this.cwd, entry.id);
          if (rec && this.onOpenRecord) {
            this.onOpenRecord(rec);
          }
        })();
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

    const lines: string[] = [];
    const maxRows = 10;
    const numCols = KANBAN_COLUMNS.length;
    const colWidth = Math.max(
      16,
      Math.floor((width - (numCols - 1)) / numCols),
    );

    // Header title bar
    const titleBar = defaultBold(pinkGlow("◈ SPAI KANBAN BOARD ◈"));
    const hintBar = violetGlow(
      "←→: sloupec • ↑↓: úkol • 1-5: přesun • Space: rotace (smyčka) • enter: detail • esc: zavřít",
    );
    lines.push(truncateToWidth(`  ${titleBar}  ${hintBar}`, width));
    lines.push(dividerGlow("━".repeat(width)));

    // Column Headers
    const headerSegments: string[] = [];
    for (let c = 0; c < numCols; c++) {
      const col = KANBAN_COLUMNS[c];
      if (!col) continue;
      const tasks = this.getColumnTasks(col.status);
      const isFocused = this.focusCol === c;
      const title = `${col.glyph} ${col.label} (${tasks.length})`;
      const rawHeader = isFocused
        ? defaultBold(col.colorFn(`▶ ${title}`))
        : col.colorFn(`  ${title}`);
      headerSegments.push(padToWidth(rawHeader, colWidth));
    }
    lines.push(headerSegments.join(dividerGlow("│")));
    lines.push(dividerGlow("─".repeat(width)));

    // Column Task Rows
    for (let r = 0; r < maxRows; r++) {
      const rowSegments: string[] = [];
      for (let c = 0; c < numCols; c++) {
        const col = KANBAN_COLUMNS[c];
        if (!col) {
          rowSegments.push(" ".repeat(colWidth));
          continue;
        }
        const tasks = this.getColumnTasks(col.status);
        const task = tasks[r];
        const isFocused = this.focusCol === c;
        const isSelected = isFocused && this.selectedIndices[c] === r;

        if (task) {
          const prioMark = task.priority === "high" ? "⚡" : "";
          const id = task.id.replace(/^SPAI-0*/i, "#");
          const availWidth = Math.max(8, colWidth - 4);
          const rawContent = `${id} ${task.title}${prioMark ? " " + prioMark : ""}`;
          const truncatedContent = truncateToWidth(rawContent, availWidth, "…");

          let cellText: string;
          if (isSelected) {
            const highlighted = `${col.bgColorAnsi} \x1b[1m${truncatedContent}\x1b[0m`;
            cellText = `▸ ${highlighted}`;
          } else {
            const styledId = col.colorFn(id);
            const displayTitle = task.title.slice(
              0,
              Math.max(4, availWidth - id.length - 1),
            );
            const styledPrio = prioMark ? coralGlow(` ${prioMark}`) : "";
            cellText = `  ${styledId} ${displayTitle}${styledPrio}`;
          }
          rowSegments.push(padToWidth(cellText, colWidth));
        } else if (r === 0 && tasks.length === 0) {
          const emptyText = isFocused
            ? col.colorFn("  (prázdné)")
            : dividerGlow("  —");
          rowSegments.push(padToWidth(emptyText, colWidth));
        } else {
          rowSegments.push(" ".repeat(colWidth));
        }
      }
      lines.push(rowSegments.join(dividerGlow("│")));
    }

    lines.push(dividerGlow("━".repeat(width)));
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
