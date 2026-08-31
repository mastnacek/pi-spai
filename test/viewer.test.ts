import test from "node:test";
import assert from "node:assert/strict";
import {
      formatStatusLine,
      getStatusCounts,
      renderSpaiRibbon,
      stripMarkdownSyntax,
} from "../src/viewer.js";
import type { SpaiIndex } from "../src/types.js";

// Helper to strip ANSI codes for asserting plain text content
function stripAnsi(text?: string): string {
      if (!text) return "";
      // eslint-disable-next-line no-control-regex
      return text.replace(/\x1b\[[0-9;]*m/g, "");
}

test("formatStatusLine returns undefined on empty or null index", () => {
      assert.equal(formatStatusLine(null), undefined);
      assert.equal(formatStatusLine(undefined), undefined);

      const emptyIndex: SpaiIndex = {
            version: 1,
            lastUpdated: "2026-08-27 10:00:00",
            records: [],
      };
      assert.equal(formatStatusLine(emptyIndex), undefined);
});

test("formatStatusLine formats compact SPAI syntax dashboard for single active todo", () => {
      const index: SpaiIndex = {
            version: 1,
            lastUpdated: "2026-08-27 10:00:00",
            records: [
                  {
                        id: "SPAI-001",
                        title: "Test Task",
                        type: "Todo",
                        status: "todo",
                        symbol: ".",
                        timestamp: "2026-08-27 10:00:00",
                        tags: [],
                        file: "1.md",
                  },
            ],
      };

      const status = formatStatusLine(index);
      assert.ok(status);
      assert.equal(stripAnsi(status), "SPAI: . 1");
      assert.ok(status.includes("\x1b[38;2;249;77;255m")); // pink glow
});

test("formatStatusLine shows only non-zero active indicators to save space", () => {
      const index: SpaiIndex = {
            version: 1,
            lastUpdated: "2026-08-27 10:00:00",
            records: [
                  {
                        id: "SPAI-001",
                        title: "Task 1",
                        type: "Todo",
                        status: "todo",
                        symbol: ".",
                        timestamp: "2026-08-27 10:00:00",
                        tags: [],
                        file: "1.md",
                  },
                  {
                        id: "SPAI-002",
                        title: "Task 2",
                        type: "Todo",
                        status: "todo",
                        symbol: ".",
                        timestamp: "2026-08-27 10:00:00",
                        tags: [],
                        file: "2.md",
                  },
                  {
                        id: "SPAI-003",
                        title: "Working 1",
                        type: "Todo",
                        status: "working",
                        symbol: "/",
                        timestamp: "2026-08-27 10:00:00",
                        tags: [],
                        file: "3.md",
                  },
                  {
                        id: "SPAI-004",
                        title: "Done 1",
                        type: "Todo",
                        status: "done",
                        symbol: "x",
                        timestamp: "2026-08-27 10:00:00",
                        tags: [],
                        file: "4.md",
                  },
                  {
                        id: "SPAI-005",
                        title: "Idea 1",
                        type: "Idea",
                        status: "idea",
                        symbol: "?",
                        timestamp: "2026-08-27 10:00:00",
                        tags: [],
                        file: "5.md",
                  },
            ],
      };

      const status = formatStatusLine(index);
      assert.ok(status);
      const plain = stripAnsi(status);
      assert.equal(plain, "SPAI: . 2  / 1  X 1  ? 1");
      // Ensure 0-count statuses (/. waiting, Z cancelled, - notes) are NOT in the string
      assert.ok(!plain.includes("/."));
      assert.ok(!plain.includes("Z"));
      assert.ok(!plain.includes("-"));
});

test("formatStatusLine includes high priority indicator ! when active", () => {
      const index: SpaiIndex = {
            version: 1,
            lastUpdated: "2026-08-27 10:00:00",
            records: [
                  {
                        id: "SPAI-001",
                        title: "Urgent Task",
                        type: "Todo",
                        status: "todo",
                        priority: "high",
                        symbol: ".",
                        timestamp: "2026-08-27 10:00:00",
                        tags: [],
                        file: "1.md",
                  },
                  {
                        id: "SPAI-002",
                        title: "Normal Task",
                        type: "Todo",
                        status: "todo",
                        symbol: ".",
                        timestamp: "2026-08-27 10:00:00",
                        tags: [],
                        file: "2.md",
                  },
                  {
                        id: "SPAI-003",
                        title: "Waiting Blocked",
                        type: "Todo",
                        status: "waiting",
                        symbol: "/.",
                        timestamp: "2026-08-27 10:00:00",
                        tags: [],
                        file: "3.md",
                  },
            ],
      };

      const status = formatStatusLine(index);
      assert.ok(status);
      const plain = stripAnsi(status);
      assert.equal(plain, "SPAI: ! 1  . 2  /. 1");
});

test("stripMarkdownSyntax strips formatting", () => {
      assert.equal(stripMarkdownSyntax("**bold**"), "bold");
      assert.equal(stripMarkdownSyntax("# Header"), "Header");
      assert.equal(stripMarkdownSyntax("[Link](https://example.com)"), "Link");
});

test("getStatusCounts and renderSpaiRibbon calculate status distribution bar", () => {
      const index: SpaiIndex = {
            version: 1,
            lastUpdated: "2026-08-27 10:00:00",
            records: [
                  {
                        id: "SPAI-001",
                        title: "Done task",
                        type: "Todo",
                        status: "done",
                        symbol: "x",
                        timestamp: "2026-08-27 10:00:00",
                        tags: [],
                        file: "1.md",
                  },
                  {
                        id: "SPAI-002",
                        title: "Working task",
                        type: "Todo",
                        status: "working",
                        symbol: "/",
                        timestamp: "2026-08-27 10:00:00",
                        tags: [],
                        file: "2.md",
                  },
                  {
                        id: "SPAI-003",
                        title: "Todo task",
                        type: "Todo",
                        status: "todo",
                        symbol: ".",
                        timestamp: "2026-08-27 10:00:00",
                        tags: [],
                        file: "3.md",
                  },
            ],
      };

      const counts = getStatusCounts(index);
      assert.equal(counts.done, 1);
      assert.equal(counts.working, 1);
      assert.equal(counts.todo, 1);
      assert.equal(counts.total, 3);

      const ribbon = renderSpaiRibbon(counts, 15);
      assert.ok(ribbon.includes("█"));
      assert.ok(ribbon.includes("[1/3]"));
      assert.ok(ribbon.includes("33%"));
});

