// Extracted from viewer.ts to keep modules focused.
import {
	SpaiIndex,
} from "./types.js";

 // #314154 (border)

export interface SpaiStatusCounts {
  done: number;
  working: number;
  waiting: number;
  todo: number;
  cancelled: number;
  ideas: number;
  notes: number;
  totalTasks: number;
  totalItems: number;
  total: number;
}

/**
 * Computes SPAI status distribution counts strictly distinguishing Tasks from Ideas and Notes.
 * Only Tasks (. / /. x z) are counted in task totals (todo, working, waiting, done, cancelled).
 * Ideas (? ) and Notes (- #) are tracked in separate idea/note buckets and never counted as tasks.
 */
export function getStatusCounts(index: SpaiIndex): SpaiStatusCounts {
  let done = 0;
  let working = 0;
  let waiting = 0;
  let todo = 0;
  let cancelled = 0;
  let ideas = 0;
  let notes = 0;

  for (const r of index.records) {
    if (r.type === "Idea" || r.status === "idea") {
      ideas++;
    } else if (
      r.type === "Note" ||
      r.status === "note" ||
      r.status === "inbox"
    ) {
      notes++;
    } else {
      switch (r.status) {
        case "done":
          done++;
          break;
        case "working":
          working++;
          break;
        case "waiting":
          waiting++;
          break;
        case "cancelled":
          cancelled++;
          break;
        case "todo":
        default:
          todo++;
          break;
      }
    }
  }

  const totalTasks = done + working + waiting + todo + cancelled;
  const totalItems = totalTasks + ideas + notes;
  return {
    done,
    working,
    waiting,
    todo,
    cancelled,
    ideas,
    notes,
    totalTasks,
    totalItems,
    total: totalTasks,
  };
}
