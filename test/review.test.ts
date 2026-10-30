import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildReviewBrief, loadReviewItems, readVerdict, requestType } from "../src/review.js";
import { ReviewPicker } from "../src/review-picker.js";

function task(id: string, title: string, deadline: string, extra = ""): string {
  return `---
type: Todo
title: "${title}"
status: todo
facets:
  deadline: ${deadline}
  database_path: D:/x/databaze/data__A
---

# ${id}: ${title}

. ${title} @proj
${extra}`;
}

test("requestType and readVerdict", () => {
  assert.equal(requestType("[ZOP-342] Něco"), "ZOP");
  assert.equal(requestType("Bez typu"), undefined);
  assert.equal(readVerdict("nic"), undefined);
  assert.equal(readVerdict("## Návrh řešení\n**Verdikt:** zastaralé\n"), "zastaralé");
  assert.equal(readVerdict("## Návrh řešení\n**Příčina:** x"), "?");
});

test("loadReviewItems orders IN, SP, ZN, ZOP, oldest first, with verdicts", async () => {
  const root = await mkdtemp(join(tmpdir(), "spai-review-"));
  try {
    const dir = join(root, "docs", "spai");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SPAI-001.md"), task("SPAI-001", "[ZOP-1] stará", "2014-01-01"));
    await writeFile(join(dir, "SPAI-002.md"), task("SPAI-002", "[SP-2] servis", "2020-01-01"));
    await writeFile(join(dir, "SPAI-003.md"), task("SPAI-003", "[IN-3] incident", "2021-01-01"));
    await writeFile(join(dir, "SPAI-004.md"), task("SPAI-004", "[SP-4] starší servis", "2019-01-01"));
    await writeFile(
      join(dir, "SPAI-005.md"),
      task("SPAI-005", "[IN-5] hotová revize", "2010-01-01", "\n## Návrh řešení\n**Verdikt:** rychlovka\n"),
    );

    const items = await loadReviewItems(root);
    assert.deepEqual(
      items.map((i) => i.entry.id),
      ["SPAI-005", "SPAI-003", "SPAI-004", "SPAI-002", "SPAI-001"],
    );
    assert.equal(items[0]?.verdict, "rychlovka");
    assert.equal(items[1]?.verdict, undefined);

    let result: unknown = "pending";
    const picker = new ReviewPicker(items, (p) => (result = p));
    picker.toggleAllUnreviewed(); // all except the reviewed SPAI-005
    assert.deepEqual([...picker.selected].sort(), ["SPAI-001", "SPAI-002", "SPAI-003", "SPAI-004"]);
    picker.toggleAllUnreviewed(); // again = clear
    assert.equal(picker.selected.size, 0);

    picker.nextFilter(); // IN
    assert.deepEqual(picker.visible().map((i) => i.entry.id), ["SPAI-005", "SPAI-003"]);
    picker.move(1);
    picker.toggle();
    assert.deepEqual(picker.picked().map((i) => i.entry.id), ["SPAI-003"]);
    assert.ok(picker.render(100).some((l) => l.includes("SPAI-003")));

    const brief = buildReviewBrief(root, picker.picked().map((i) => i.entry));
    assert.match(brief, /lotusscript-modular/);
    assert.match(brief, /01_scripts/);
    assert.equal(result, "pending");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
