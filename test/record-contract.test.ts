import test from "node:test";
import assert from "node:assert/strict";
import {
  formatRecordCreated,
  getNextId,
  idsFromFileNames,
} from "../src/storage-format.js";
import type { SpaiRecord } from "../src/types.js";

// ── SPAI-009: a stale index must not cause id reuse ──────────────────────────

test("an id the index never saw still advances the counter", () => {
  const indexed = ["SPAI-001", "SPAI-002", "SPAI-003", "SPAI-004"].map((id) => ({ id }));
  const listing = idsFromFileNames([
    "2026-09-24-SPAI-001-premyslim.md",
    "2026-10-05-SPAI-005-pekna-prace.md",
  ]);

  assert.equal(
    getNextId([...indexed, ...listing.map((id) => ({ id }))]),
    "SPAI-006",
    "a file present on disk must reserve its id",
  );
  assert.equal(
    getNextId(indexed),
    "SPAI-005",
    "this is the defect: the index-only guess reuses the untracked id",
  );
});

test("ids are read from file names, and only from real items", () => {
  assert.deepEqual(
    idsFromFileNames([
      "2026-10-14-SPAI-007-x.md",
      "2026-10-05-SPAI-005-y.md",
      ".index.json",
      "notes.md",
      "README.md",
    ]),
    ["SPAI-007", "SPAI-005"],
  );
  assert.deepEqual(idsFromFileNames([]), []);
});

// ── SPAI-007: the response names where the record actually landed ────────────

function record(overrides: Partial<SpaiRecord> = {}): SpaiRecord {
  return {
    id: "SPAI-038",
    title: "A task",
    type: "Todo",
    status: "todo",
    symbol: ".",
    timestamp: "2026-10-14 11:30:08",
    tags: [],
    file: "2026-10-14-SPAI-038-a-task.md",
    filePath: "D:/x/pi-uma/docs/spai/2026-10-14-SPAI-038-a-task.md",
    project: "pi-uma",
    projectPath: "D:/x/pi-uma",
    body: ". A task",
    subtasks: [],
    ...overrides,
  } as SpaiRecord;
}

test("the created-record response names the absolute path", () => {
  const text = formatRecordCreated(record());
  assert.match(text, /Cesta: D:\/x\/pi-uma\/docs\/spai\/2026-10-14-SPAI-038-a-task\.md/);
  assert.match(text, /Projekt: pi-uma/);
  assert.ok(
    !text.includes("Pozor"),
    "a project that resolved to its own folder needs no warning",
  );
});

test("a label that does not match the directory is stated, not silent", () => {
  const text = formatRecordCreated(
    record({ project: "pi-orchestrator", projectPath: "D:/x/pi-uma" }),
  );
  assert.match(text, /Pozor/);
  assert.match(text, /nebyl rozpoznán/);
  assert.match(text, /absolutní cestu/);
});

test("a trailing separator does not look like a mismatch", () => {
  const text = formatRecordCreated(record({ projectPath: "D:/x/pi-uma/" }));
  assert.ok(!text.includes("Pozor"));
});
