// pi-spai — kanban board component.
//
// Rendering and the read-only queries live in `src/kanban-view.ts` and the
// `src/kanban-render*.ts` modules, the column model in `src/kanban-model.ts`. This
// module owns the state, the callbacks, the mutations and the input handling, and
// re-exports the model so existing importers are unaffected.
import { type Component, Key, matchesKey } from "@earendil-works/pi-tui";
import { loadIndex, readRecord, updateRecordStatus } from "./storage.js";
import type { ProjectSummary } from "./projects.js";
import type {
  SpaiIndex,
  SpaiIndexEntry,
  SpaiRecord,
  SpaiStatus,
} from "./types.js";
import { KANBAN_COLUMNS } from "./kanban-model.js";
import { getVisibleRecords, getColumnTasks, getSelectedRecord, getPickerOptions, clampSelection, KanbanView } from "./kanban-view.js";
import { renderWide, renderProjectPicker } from "./kanban-render.js";
import { renderNarrow } from "./kanban-render-narrow.js";

export { KanbanColumn, KANBAN_COLUMNS } from "./kanban-model.js";

export class KanbanBoardComponent implements Component {
  private cwd: string;

  private index: SpaiIndex;

  private projects: ProjectSummary[];

  private activeProjectFilter = "ALL";

  private mode: "board" | "project_picker" = "board";

  private pickerIdx = 0;

  private onReloadIndex?: () => Promise<SpaiIndex>;

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

  private isUpdatingStatus = false;

  constructor(options: {
    cwd: string;
    index: SpaiIndex;
    projects?: ProjectSummary[];
    onReloadIndex?: () => Promise<SpaiIndex>;
    onOpenRecord?: (record: SpaiRecord) => void;
    onRealizeRecord?: (record: SpaiRecord) => void;
    onNewTask?: () => void;
    onClose: () => void;
    onStatusChange?: (taskId: string, targetStatus: SpaiStatus) => void;
    onRequestRender?: () => void;
  }) {
    this.cwd = options.cwd;
    this.index = options.index;
    this.projects = options.projects ?? [];
    this.onReloadIndex = options.onReloadIndex;
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

  /** Records visible under the active project filter. */

  public getActiveProjectFilter(): string {
    return this.activeProjectFilter;
  }

  /** ALL -> project 1 -> ... -> ALL cycle, ported from spai.ledger. */

  public toggleProjectFilter(direction: "next" | "prev" = "next"): void {
    const options = [
      "ALL",
      ...this.projects
        .filter((p) => p.hasSpai !== false)
        .map((p) => p.name),
    ];
    if (options.length <= 1) return;
    const idx = options.findIndex(
      (o) => o.toLowerCase() === this.activeProjectFilter.toLowerCase(),
    );
    const nextIdx =
      direction === "next"
        ? (idx + 1) % options.length
        : (idx - 1 + options.length) % options.length;
    this.activeProjectFilter = options[nextIdx] ?? "ALL";
    this.clampSelection();
    this.invalidate();
    this.onRequestRender?.();
  }

  private handlePickerInput(data: string): void {
    const options = getPickerOptions(this.view());
    if (matchesKey(data, Key.escape) || data === "q") {
      this.mode = "board";
      this.invalidate();
      this.onRequestRender?.();
    } else if (matchesKey(data, Key.up) || data === "k") {
      if (this.pickerIdx > 0) {
        this.pickerIdx--;
        this.invalidate();
        this.onRequestRender?.();
      }
    } else if (matchesKey(data, Key.down) || data === "j") {
      if (this.pickerIdx < options.length - 1) {
        this.pickerIdx++;
        this.invalidate();
        this.onRequestRender?.();
      }
    } else if (matchesKey(data, Key.enter)) {
      const opt = options[this.pickerIdx];
      this.activeProjectFilter = opt?.value ?? "ALL";
      this.mode = "board";
      this.clampSelection();
      this.invalidate();
      this.onRequestRender?.();
    }
  }

  public async moveToStatus(targetStatus: SpaiStatus): Promise<void> {
    if (this.isUpdatingStatus) return;
    const currentEntry = getSelectedRecord(this.view());
    if (!currentEntry) return;

    if (currentEntry.status === targetStatus) return;

    const targetColIdx = KANBAN_COLUMNS.findIndex(
      (c) => c.status === targetStatus,
    );
    if (targetColIdx === -1) return;

    this.isUpdatingStatus = true;
    try {
      const taskId = currentEntry.id;
      const targetCwd = currentEntry.projectPath || this.cwd;
      const updated = await updateRecordStatus(targetCwd, taskId, targetStatus);
      if (updated) {
        this.index = this.onReloadIndex
          ? await this.onReloadIndex()
          : await loadIndex(targetCwd);
        this.focusCol = targetColIdx;
        const targetTasks = getColumnTasks(this.view(), targetStatus);
        const newIdx = targetTasks.findIndex((t) => t.id === taskId);
        this.selectedIndices[targetColIdx] = Math.max(0, newIdx);
        this.clampSelection();
        this.invalidate();
        this.onStatusChange?.(taskId, targetStatus);
        this.onRequestRender?.();
      }
    } catch {
      // Non-blocking UI update error
    } finally {
      this.isUpdatingStatus = false;
    }
  }

  public async moveSelectedTask(direction: "left" | "right"): Promise<void> {
    const currentEntry = getSelectedRecord(this.view());
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
    // Project picker modal intercepts all input
    if (this.mode === "project_picker") {
      this.handlePickerInput(data);
      return;
    }
    // 1-key instant status move: 1..5, t, w, P, d, c, z
    if (data === "1" || data === "t") {
      void this.moveToStatus("todo");
    } else if (data === "2" || data === "w") {
      void this.moveToStatus("working");
    } else if (data === "3" || data === "P") {
      void this.moveToStatus("waiting");
    } else if (data === "4" || data === "d") {
      void this.moveToStatus("done");
    } else if (data === "5" || data === "c" || data === "z") {
      void this.moveToStatus("cancelled");
    }
    // Cycle project filter: p (next) / o (picker)
    else if (data === "p") {
      this.toggleProjectFilter("next");
    } else if (data === "o") {
      this.mode = "project_picker";
      this.pickerIdx = 0;
      this.invalidate();
      this.onRequestRender?.();
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
        const tasks = getColumnTasks(this.view(), col.status);
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
      const current = getSelectedRecord(this.view());
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
      const entry = getSelectedRecord(this.view());
      if (entry && this.onRealizeRecord && !this.isOpening) {
        this.isOpening = true;
        void readRecord(entry.projectPath || this.cwd, entry.id)
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
      const entry = getSelectedRecord(this.view());
      if (entry && this.onOpenRecord && !this.isOpening) {
        this.isOpening = true;
        void readRecord(entry.projectPath || this.cwd, entry.id)
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
    if (this.mode === "project_picker") {
      return renderProjectPicker(this.view(), width);
    }

    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const view = this.view();
    const lines = width < 75 ? renderNarrow(view, width) : renderWide(view, width);

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  /**
   * Snapshot for the renderers. The arrays are shared, not copied, and the renderers
   * only read — so the cache and the selection state stay in one place.
   */
  private view(): KanbanView {
    return {
      index: this.index,
      projects: this.projects,
      activeProjectFilter: this.activeProjectFilter,
      pickerIdx: this.pickerIdx,
      focusCol: this.focusCol,
      selectedIndices: this.selectedIndices,
    };
  }

  public getVisibleRecords(): SpaiIndexEntry[] {
    return getVisibleRecords(this.view());
  }

  private clampSelection(): void {
    clampSelection(this.view());
  }
}
