import test from "node:test";
import assert from "node:assert/strict";
import { KANBAN_COLUMNS, KanbanBoardComponent } from "../src/kanban.js";
import type { SpaiIndex } from "../src/types.js";

test("KANBAN_COLUMNS defines standard 5 columns", () => {
  assert.equal(KANBAN_COLUMNS.length, 5);
  assert.deepEqual(
    KANBAN_COLUMNS.map((c) => c.status),
    ["todo", "working", "waiting", "done", "cancelled"],
  );
});

test("KanbanBoardComponent renders columns", () => {
  const index: SpaiIndex = {
    version: 1,
    lastUpdated: "2026-08-27 10:50:45",
    records: [
      {
        id: "SPAI-001",
        title: "Test Task",
        type: "Todo",
        status: "todo",
        symbol: ".",
        timestamp: "2026-08-27 10:50:45",
        tags: ["core"],
        file: "1.md",
      },
    ],
  };

  const board = new KanbanBoardComponent({
    cwd: process.cwd(),
    index,
    onClose: () => {},
  });

  const rendered = board.render(100);
  assert.ok(rendered.length > 0);
  assert.ok(rendered.some((l) => l.includes("KANBAN")));
  assert.ok(rendered.some((l) => l.includes("TODO")));
  assert.ok(rendered.some((l) => l.includes("DONE")));
});
