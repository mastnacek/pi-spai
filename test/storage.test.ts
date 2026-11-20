import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  formatDateTime,
  loadIndex,
  parseSpaiMarkdown,
  readRecord,
  saveRecord,
  searchRecords,
  updateRecordStatus,
} from "../src/storage.js";
import { setRunner } from "../src/spai-cli.js";
import { displayTitle } from "../src/storage-format.js";
import { fakeSpai, flagValue } from "./fake-spai.js";

// A record as `spai add` writes it (English title, Czech title, pending work).
const RECORD = [
  "---",
  "type: Todo",
  'title: "Fix the login"',
  "timestamp: 2026-11-20 08:36:47",
  "status: todo",
  "source: pi",
  "tags: [core]",
  "facets:",
  "  priority: high",
  "  project: proj",
  "spai_symbol: '.'",
  "lang: en",
  'title_cs: "Oprava \\"přihlášení\\""',
  "pending: [embed]",
  "---",
  "",
  "# SPAI-001: Fix the login",
  "",
  ". Fix the login @proj ! :core:",
  "",
].join("\n");

test("formatDateTime formats ISO date time", () => {
  assert.match(formatDateTime(new Date("2026-08-27T10:50:45")), /^2026-08-27 \d{2}:\d{2}:\d{2}$/);
});

test("parseSpaiMarkdown reads title_cs and keeps the English title", () => {
  const parsed = parseSpaiMarkdown(RECORD, "x.md");
  assert.equal(parsed?.title, "Fix the login");
  assert.equal(parsed?.titleCs, 'Oprava "přihlášení"');
  assert.equal(displayTitle(parsed!), 'Oprava "přihlášení"');
  assert.equal(parsed?.priority, "high");
  const without = parseSpaiMarkdown(RECORD.replace(/^title_cs:.*\n/m, ""), "x.md");
  assert.equal(without?.titleCs, undefined);
  assert.equal(displayTitle(without!), "Fix the login");
});

test("reading (index, record, search) works on files and never writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-spai-read-"));
  try {
    const spai = join(dir, "docs", "spai");
    await mkdir(spai, { recursive: true });
    await writeFile(join(spai, "2026-11-20-SPAI-001-fix-the-login.md"), RECORD);

    const index = await loadIndex(dir);
    assert.equal(index.records.length, 1);
    assert.equal(index.records[0]?.titleCs, 'Oprava "přihlášení"');

    const read = await readRecord(dir, "SPAI-001");
    assert.equal(read?.id, "SPAI-001");

    const found = await searchRecords(dir, "login");
    assert.equal(found[0]?.id, "SPAI-001");

    const { readdir } = await import("node:fs/promises");
    assert.deepEqual(await readdir(spai), ["2026-11-20-SPAI-001-fix-the-login.md"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("saveRecord and updateRecordStatus go through spai", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-spai-via-"));
  try {
    const spai = join(dir, "docs", "spai");
    await mkdir(spai, { recursive: true });
    await writeFile(join(spai, "2026-11-20-SPAI-001-fix-the-login.md"), RECORD);
    const fake = fakeSpai();
    setRunner(fake.runner);

    const saved = await saveRecord(dir, ". New thing :a:");
    assert.equal(saved.written, true);
    assert.deepEqual(fake.calls[0]?.argv.slice(0, 4), ["add", ". New thing :a:", "--source", "pi"]);

    const updated = await updateRecordStatus(dir, "SPAI-001", "done");
    assert.equal(updated?.status, "done");
    const set = fake.calls[1]?.argv ?? [];
    assert.deepEqual(set.slice(0, 3), ["set", "SPAI-001", "done"]);
    assert.equal(flagValue(set, "--project")?.replace(/\\/g, "/"), dir.replace(/\\/g, "/"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
