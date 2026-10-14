import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, unlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getIndexPath, getSpaiDir, loadIndex, saveRecord } from "../src/storage.js";

async function project(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "spai-drift-"));
}

test("a hand-edited ledger file overrides a stale index (SPAI-004)", async () => {
  const cwd = await project();
  try {
    const saved = await saveRecord(cwd, ". First task @proj :a:");
    const dir = getSpaiDir(cwd);
    const file = join(dir, saved.file);

    // Hand-edit: mark it done the way a human would, bypassing the tools.
    const markdown = await readFile(file, "utf8");
    await writeFile(file, markdown.replace("status: todo", "status: done"));
    // Make the edit unambiguously newer than the index.
    const future = new Date(Date.now() + 5000);
    await utimes(file, future, future);

    const index = await loadIndex(cwd);
    const record = index.records.find((entry) => entry.id === saved.id);
    assert.equal(record?.status, "done", "the index must not keep reporting todo");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("a file the index never saw is picked up, and a deleted one disappears", async () => {
  const cwd = await project();
  try {
    await saveRecord(cwd, ". First @proj :a:");
    const second = await saveRecord(cwd, ". Second @proj :a:");
    const dir = getSpaiDir(cwd);

    assert.equal((await loadIndex(cwd)).records.length, 2);

    // A file that appeared outside the tools (hand-copied, restored, pulled).
    const handmade = "2026-01-01-SPAI-099-hand-made.md";
    const template = await readFile(join(dir, second.file), "utf8");
    await writeFile(
      join(dir, handmade),
      template.replace(/SPAI-\d+/, "SPAI-099").replace(/title: ".*"/, 'title: "Hand made"'),
    );

    const withHandmade = await loadIndex(cwd);
    assert.equal(withHandmade.records.length, 3, "the new file must be indexed");
    assert.ok(withHandmade.records.some((entry) => entry.file === handmade));

    // And a file removed on disk must leave the index.
    await unlink(join(dir, handmade));
    assert.equal((await loadIndex(cwd)).records.length, 2);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("an untouched index is reused rather than rebuilt every call", async () => {
  const cwd = await project();
  try {
    await saveRecord(cwd, ". Stable @proj :a:");
    const indexPath = getIndexPath(cwd);
    const before = await readFile(indexPath, "utf8");
    await loadIndex(cwd);
    const after = await readFile(indexPath, "utf8");
    assert.equal(after, before, "a fresh index must not be rewritten on read");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
