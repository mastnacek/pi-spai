import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { updateRecordStatus } from "../src/storage.js";

// Same shape as a task written by the Lotus Notes export (ExportSpaiTasks.lss).
const NOTES_TASK = [
  "---",
  "type: Todo",
  'title: "[ZOP-1] Testovací databáze: něco nefunguje"',
  "timestamp: 2026-10-30 08:03:02",
  "status: todo",
  "source: lotus-notes-test",
  "tags: [domino, notes]",
  "facets:",
  "  priority: low",
  "  deadline: 2018-03-31",
  "  project: proj",
  "  database_path: D:/x/databaze/data__Test",
  "  notes_unid: 0123456789ABCDEF0123456789ABCDEF",
  "  notes_form: ZOP",
  "spai_symbol: '.'",
  "---",
  "",
  "# SPAI-001: [ZOP-1] Testovací databáze: něco nefunguje",
  "",
  ". [ZOP-1] Testovací databáze: něco nefunguje @proj !low :domino:",
  "",
  "### Popis požadavku",
  "text",
  "",
].join("\r\n");

test("update_spai_status keeps foreign frontmatter (notes_unid, database_path)", async () => {
  const root = await mkdtemp(join(tmpdir(), "spai-preserve-"));
  try {
    const dir = join(root, "docs", "spai");
    await mkdir(dir, { recursive: true });
    const file = join(dir, "2026-10-30-SPAI-001-test.md");
    await writeFile(file, NOTES_TASK);

    await updateRecordStatus(root, "SPAI-001", "waiting");
    const after = await readFile(file, "utf8");

    assert.match(after, /notes_unid: 0123456789ABCDEF0123456789ABCDEF/);
    assert.match(after, /database_path: D:\/x\/databaze\/data__Test/);
    assert.match(after, /source: lotus-notes-test/);
    assert.match(after, /^status: waiting\r?$/m);
    assert.match(after, /^spai_symbol: '\/\.'\r?$/m);
    assert.match(after, /^\/\. \[ZOP-1\]/m);
    assert.match(after, /### Popis požadavku/);
    assert.equal((after.match(/^status:/gm) ?? []).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
