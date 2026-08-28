import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  formatDateTime,
  formatSpaiMarkdown,
  getNextId,
  loadIndex,
  parseSpaiMarkdown,
  readRecord,
  saveRecord,
  searchRecords,
  slugify,
  updateRecordStatus,
} from "../src/storage.js";
import type { SpaiRecord } from "../src/types.js";

test("slugify strips diacritics and normalizes", () => {
  assert.equal(slugify("Příliš žluťoučký kůň"), "prilis-zlutoucky-kun");
  assert.equal(slugify("Refactor(Core): Fix!"), "refactorcore-fix");
});

test("formatDateTime formats ISO date time", () => {
  const d = new Date("2026-08-27T10:50:45");
  const formatted = formatDateTime(d);
  assert.match(formatted, /^2026-08-27 \d{2}:\d{2}:\d{2}$/);
});

test("getNextId generates sequence correctly", () => {
  assert.equal(getNextId([]), "SPAI-001");
  assert.equal(getNextId([{ id: "SPAI-001" }]), "SPAI-002");
  assert.equal(getNextId([{ id: "SPAI-001" }, { id: "SPAI-009" }]), "SPAI-010");
});

test("formatSpaiMarkdown and parseSpaiMarkdown roundtrip", () => {
  const record: SpaiRecord = {
    id: "SPAI-001",
    title: "Implementovat modul",
    type: "Todo",
    status: "todo",
    symbol: ".",
    timestamp: "2026-08-27 10:50:45",
    tags: ["core", "dev"],
    description: "Popis modulu",
    priority: "high",
    deadline: "2026-09-01",
    project: "pi-spai",
    file: "2026-08-27-SPAI-001-implementovat-modul.md",
    body: ". Implementovat modul podle specifikace",
    subtasks: [],
  };

  const md = formatSpaiMarkdown(record);
  assert.ok(md.includes("type: Todo"));
  assert.ok(md.includes("priority: high"));

  const parsed = parseSpaiMarkdown(md, record.file);
  assert.ok(parsed);
  assert.equal(parsed?.id, "SPAI-001");
  assert.equal(parsed?.title, "Implementovat modul");
  assert.equal(parsed?.type, "Todo");
  assert.equal(parsed?.status, "todo");
  assert.equal(parsed?.priority, "high");
  assert.equal(parsed?.deadline, "2026-09-01");
});

test("saveRecord, readRecord, updateRecordStatus, and searchRecords work atomically", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "pi-spai-test-"));

  try {
    const record1 = await saveRecord(
      tempDir,
      ". Implementovat SPAI :core: ! @2026-09-01",
      "docs/spai",
    );
    assert.equal(record1.id, "SPAI-001");
    assert.equal(record1.type, "Todo");
    assert.equal(record1.status, "todo");

    const record2 = await saveRecord(
      tempDir,
      "? Nový nápad na visualizer :idea:",
      "docs/spai",
    );
    assert.equal(record2.id, "SPAI-002");
    assert.equal(record2.type, "Idea");

    // Read back
    const read = await readRecord(tempDir, "SPAI-001", "docs/spai");
    assert.ok(read);
    assert.equal(read?.title, "Implementovat SPAI");

    // Update status
    const updated = await updateRecordStatus(
      tempDir,
      "SPAI-001",
      "done",
      "docs/spai",
    );
    assert.ok(updated);
    assert.equal(updated?.status, "done");

    // Search
    const search = await searchRecords(
      tempDir,
      "visualizer",
      undefined,
      "docs/spai",
    );
    assert.equal(search.length, 1);
    assert.equal(search[0]?.id, "SPAI-002");

    // Index verification
    const index = await loadIndex(tempDir, "docs/spai");
    assert.equal(index.records.length, 2);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
