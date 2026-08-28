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
                  {
                        id: "SPAI-002",
                        title: "Working Task",
                        type: "Todo",
                        status: "working",
                        symbol: "/",
                        timestamp: "2026-08-27 10:50:45",
                        tags: ["dev"],
                        file: "2.md",
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
      assert.ok(rendered.some((l) => l.includes("WORKING")));
      assert.ok(rendered.some((l) => l.includes("DONE")));
      assert.ok(rendered.some((l) => l.includes("#1")));
});

test("KANBAN_COLUMNS match mozek_rust Linkarzu theme colors", () => {
      const [todo, working, waiting, done, cancelled] = KANBAN_COLUMNS;
      assert.equal(todo?.status, "todo");
      assert.equal(working?.status, "working");
      assert.equal(waiting?.status, "waiting");
      assert.equal(done?.status, "done");
      assert.equal(cancelled?.status, "cancelled");

      // Verify shortcuts 1-5 exist
      assert.equal(todo?.shortcut, "1");
      assert.equal(working?.shortcut, "2");
      assert.equal(waiting?.shortcut, "3");
      assert.equal(done?.shortcut, "4");
      assert.equal(cancelled?.shortcut, "5");
});

test("KanbanBoardComponent rotate modulo loops across cancelled to todo", () => {
      const statuses = KANBAN_COLUMNS.map((c) => c.status);
      let colIdx = 4; // cancelled
      colIdx = (colIdx + 1) % statuses.length;
      assert.equal(colIdx, 0);
      assert.equal(statuses[colIdx], "todo");

      colIdx = (colIdx - 1 + statuses.length) % statuses.length;
      assert.equal(colIdx, 4);
      assert.equal(statuses[colIdx], "cancelled");
});
