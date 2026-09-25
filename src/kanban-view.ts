/**
 * Kanban board view model: the snapshot the renderers read, the read-only queries
 * over it, and the width/badge text helpers.
 *
 * Split out of `kanban.ts` (line-limit campaign). These were private methods; as
 * functions over an explicit view they can live outside the component.
 */
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { ProjectSummary } from "./projects.js";
import type { SpaiIndex, SpaiIndexEntry, SpaiStatus } from "./types.js";
import { KANBAN_COLUMNS } from "./kanban-model.js";

/** The slice of board state the renderers and read-only queries need. */
export interface KanbanView {
  index: SpaiIndex;
  projects: ProjectSummary[];
  activeProjectFilter: string;
  pickerIdx: number;
  focusCol: number;
  selectedIndices: number[];
}

export function padToWidth(text: string, width: number): string {
  const vWidth = visibleWidth(text);
  if (vWidth >= width) {
    return truncateToWidth(text, width, "…");
  }
  return text + " ".repeat(Math.max(0, width - vWidth));
}

export function computeColWidths(totalWidth: number, numCols: number): number[] {
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

export function colBadge(status: SpaiStatus): string {
  const col = KANBAN_COLUMNS.find((c) => c.status === status);
  if (!col) return status;
  return col.colorFn(`[${col.glyph} ${col.label}]`);
}

export function getVisibleRecords(view: KanbanView) : SpaiIndexEntry[] {
  if (view.activeProjectFilter === "ALL") {
    return view.index.records;
  }
  const f = view.activeProjectFilter.toLowerCase();
  return view.index.records.filter(
    (r) =>
      r.project?.toLowerCase() === f ||
      r.projectPath?.toLowerCase() === f,
  );
}

export function getColumnTasks(view: KanbanView, status: SpaiStatus) : SpaiIndexEntry[] {
  const visible = getVisibleRecords(view);
  return visible.filter(
    (r) =>
      r.status === status &&
      (r.type === "Todo" ||
        (!r.type &&
          ["todo", "working", "waiting", "done", "cancelled"].includes(
            r.status,
          ))),
  );
}

export function getSelectedRecord(view: KanbanView) : SpaiIndexEntry | null {
  const col = KANBAN_COLUMNS[view.focusCol];
  if (!col) return null;
  const tasks = getColumnTasks(view, col.status);
  const selectedIdx = view.selectedIndices[view.focusCol] ?? 0;
  return tasks[selectedIdx] ?? null;
}

export function getPickerOptions(view: KanbanView) : Array<{ label: string; value: string }> {
  return [
    { label: "★ ALL PROJECTS", value: "ALL" },
    ...view.projects
      .filter((p) => p.hasSpai !== false)
      .map((p) => ({
        label: `📁 ${p.name} (${p.taskCount ?? 0})`,
        value: p.name,
      })),
  ];
}

export function getFilterLabel(view: KanbanView) : string {
  return view.activeProjectFilter === "ALL"
    ? "★ ALL PROJECTS"
    : `📁 ${view.activeProjectFilter}`;
}

export function clampSelection(view: KanbanView) : void {
  for (let c = 0; c < KANBAN_COLUMNS.length; c++) {
    const col = KANBAN_COLUMNS[c];
    if (!col) continue;
    const tasks = getColumnTasks(view, col.status);
    const cur = view.selectedIndices[c] ?? 0;
    if (tasks.length === 0) {
      view.selectedIndices[c] = 0;
    } else if (cur >= tasks.length) {
      view.selectedIndices[c] = tasks.length - 1;
    } else if (cur < 0) {
      view.selectedIndices[c] = 0;
    }
  }
}
