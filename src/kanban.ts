import {
  type Component,
  Key,
  matchesKey,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import {
  loadIndex,
  readRecord,
  updateRecordStatus,
} from "./storage.js";
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
  goldGlow,
  greenGlow,
  pinkGlow,
  violetGlow,
} from "./viewer.js";

export interface KanbanColumn {
  status: SpaiStatus;
  label: string;
  glyph: string;
  colorFn: (text: string) => string;
}

export const KANBAN_COLUMNS: KanbanColumn[] = [
  { status: "todo", label: "TODO", glyph: "○", colorFn: cyanGlow },
  { status: "working", label: "WORKING", glyph: "◐", colorFn: goldGlow },
  { status: "waiting", label: "WAITING", glyph: "⏳", colorFn: goldGlow },
  { status: "done", label: "DONE", glyph: "✓", colorFn: greenGlow },
  { status: "cancelled", label: "CANCELLED", glyph: "✗", colorFn: coralGlow },
];

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
  }

  public setIndex(newIndex: SpaiIndex): void {
    this.index = newIndex;
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

  private async moveSelectedTask(direction: "left" | "right"): Promise<void> {
    const currentEntry = this.getSelectedRecord();
    if (!currentEntry) return;

    let targetColIdx = this.focusCol;
    if (direction === "left" && targetColIdx > 0) {
      targetColIdx--;
    } else if (direction === "right" && targetColIdx < KANBAN_COLUMNS.length - 1) {
      targetColIdx++;
    } else {
      return;
    }

    const nextStatus = KANBAN_COLUMNS[targetColIdx]?.status;
    if (!nextStatus) return;

    const updated = await updateRecordStatus(this.cwd, currentEntry.id, nextStatus);
    if (updated) {
      this.index = await loadIndex(this.cwd);
      this.focusCol = targetColIdx;
      this.selectedIndices[targetColIdx] = Math.max(
        0,
        this.getColumnTasks(nextStatus).length - 1,
      );
      this.invalidate();
      this.onRequestRender?.();
    }
  }

  handleInput(data: string): void {
    // Column navigation: Left / Right, h / l
    if (matchesKey(data, Key.left) || matchesKey(data, "h")) {
      if (this.focusCol > 0) {
        this.focusCol--;
        this.invalidate();
        this.onRequestRender?.();
      }
    } else if (matchesKey(data, Key.right) || matchesKey(data, "l")) {
      if (this.focusCol < KANBAN_COLUMNS.length - 1) {
        this.focusCol++;
        this.invalidate();
        this.onRequestRender?.();
      }
    }

    // Row navigation: Up / Down, k / j
    else if (matchesKey(data, Key.up) || matchesKey(data, "k")) {
      const curIdx = this.selectedIndices[this.focusCol] ?? 0;
      if (curIdx > 0) {
        this.selectedIndices[this.focusCol] = curIdx - 1;
        this.invalidate();
        this.onRequestRender?.();
      }
    } else if (matchesKey(data, Key.down) || matchesKey(data, "j")) {
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

    // Move task: H / Shift+Left, L / Shift+Right, Space
    else if (
      data === "H" ||
      matchesKey(data, Key.shift("left")) ||
      matchesKey(data, Key.shift("h"))
    ) {
      void this.moveSelectedTask("left");
    } else if (
      data === "L" ||
      matchesKey(data, Key.shift("right")) ||
      matchesKey(data, Key.shift("l")) ||
      matchesKey(data, Key.space)
    ) {
      void this.moveSelectedTask("right");
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
    else if (matchesKey(data, "n") || matchesKey(data, "a")) {
      this.onNewTask?.();
    }

    // Close on Esc / q
    else if (matchesKey(data, Key.escape) || matchesKey(data, "q")) {
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
    const colWidth = Math.max(16, Math.floor((width - (numCols - 1)) / numCols));

    // Header title bar
    const titleBar = defaultBold(pinkGlow("◈ SPAI KANBAN BOARD ◈"));
    const hintBar = violetGlow("←→/h/l: sloupec • ↑↓/k/j: úkol • H/L/Space: přesun stavu • enter: detail • esc: zavřít");
    lines.push(truncateToWidth(`  ${titleBar}  ${hintBar}`, width));
    lines.push(dividerGlow("━".repeat(width)));

    // Column Headers
    const headerSegments: string[] = [];
    for (let c = 0; c < numCols; c++) {
      const col = KANBAN_COLUMNS[c]!;
      const tasks = this.getColumnTasks(col.status);
      const isFocused = this.focusCol === c;
      const marker = isFocused ? pinkGlow("▶ ") : "  ";
      const title = `${col.glyph} ${col.label} (${tasks.length})`;
      const styledTitle = isFocused
        ? defaultBold(pinkGlow(title))
        : col.colorFn(title);
      const rawHeader = `${marker}${styledTitle}`;
      headerSegments.push(truncateToWidth(rawHeader.padEnd(colWidth), colWidth));
    }
    lines.push(headerSegments.join(dividerGlow("│")));
    lines.push(dividerGlow("─".repeat(width)));

    // Column Task Rows
    for (let r = 0; r < maxRows; r++) {
      const rowSegments: string[] = [];
      for (let c = 0; c < numCols; c++) {
        const col = KANBAN_COLUMNS[c]!;
        const tasks = this.getColumnTasks(col.status);
        const task = tasks[r];
        const isFocused = this.focusCol === c;
        const isSelected = isFocused && this.selectedIndices[c] === r;

        if (task) {
          const prioMark = task.priority === "high" ? "⚡" : "";
          const prefix = isSelected ? pinkGlow("▸ ") : "  ";
          const id = task.id.replace(/^SPAI-0*/i, "#");
          const displayTitle = task.title.slice(0, colWidth - 8);
          const taskContent = `${id} ${displayTitle}${prioMark}`;
          const styledContent = isSelected
            ? defaultBold(pinkGlow(`\x1b[7m${taskContent}\x1b[27m`))
            : taskContent;
          const fullCol = `${prefix}${styledContent}`;
          rowSegments.push(truncateToWidth(fullCol.padEnd(colWidth), colWidth));
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
