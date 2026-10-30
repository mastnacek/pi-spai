import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildDbReminder } from "../src/db-reminder.js";
import { loadIndex } from "../src/storage.js";

function task(id: string, db: string, deadline: string, status = "todo", plan = ""): string {
  return `---
type: Todo
title: "Úkol ${id}"
status: ${status}
facets:
  deadline: ${deadline}
  database_path: ${db}
---

# ${id}: Úkol ${id}

. Úkol ${id} @proj
${plan}`;
}

async function repo(): Promise<{ root: string; dbA: string; dbB: string }> {
  const root = await mkdtemp(join(tmpdir(), "spai-dbrem-"));
  await mkdir(join(root, ".git"));
  const dir = join(root, "docs", "spai");
  await mkdir(dir, { recursive: true });
  const dbA = join(root, "databaze", "data__A");
  const dbB = join(root, "databaze", "data__B");
  await mkdir(dbA, { recursive: true });
  await mkdir(dbB, { recursive: true });
  const fwd = (p: string) => p.replace(/\\/g, "/");
  await writeFile(join(dir, "SPAI-001.md"), task("SPAI-001", fwd(dbA), "2020-01-01"));
  await writeFile(
    join(dir, "SPAI-002.md"),
    task("SPAI-002", fwd(dbA), "2018-03-31", "todo", "\n## Plán\n- [x] a\n- [ ] b\n"),
  );
  await writeFile(join(dir, "SPAI-003.md"), task("SPAI-003", fwd(dbA), "2017-01-01", "done"));
  await writeFile(join(dir, "SPAI-004.md"), task("SPAI-004", fwd(dbB), "2019-01-01"));
  return { root, dbA, dbB };
}

test("inside a database folder: its open tasks, oldest first, with plan progress", async () => {
  const { root, dbA } = await repo();
  try {
    const msg = await buildDbReminder(join(dbA, "Code", "Agents"));
    assert.ok(msg);
    assert.match(msg, /2 otevřené Notes úkoly k této/);
    assert.ok(msg.indexOf("SPAI-002") < msg.indexOf("SPAI-001"), "oldest deadline first");
    assert.match(msg, /SPAI-002 \(2018-03-31\) \[1\/2\]/);
    assert.doesNotMatch(msg, /SPAI-003|SPAI-004/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("at the root: one summary across databases; elsewhere: silent", async () => {
  const { root } = await repo();
  try {
    const msg = await buildDbReminder(root);
    assert.match(msg ?? "", /3 otevřené Notes úkoly v 2 databázích/);
    await mkdir(join(root, "docs", "other"), { recursive: true });
    assert.equal(await buildDbReminder(join(root, "docs", "other")), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("index carries databasePath and steps", async () => {
  const { root } = await repo();
  try {
    const index = await loadIndex(root);
    const r = index.records.find((e) => e.id === "SPAI-002");
    assert.deepEqual(r?.steps, { done: 1, total: 2 });
    assert.ok(r?.databasePath?.endsWith("data__A"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tasks waiting for the user are listed first, separately", async () => {
  const { root, dbA } = await repo();
  try {
    const dir = join(root, "docs", "spai");
    const fwd = (p: string) => p.replace(/\\/g, "/");
    await writeFile(join(dir, "SPAI-005.md"), task("SPAI-005", fwd(dbA), "2021-01-01", "waiting"));
    const msg = (await buildDbReminder(dbA)) ?? "";
    assert.match(msg, /3 otevřené Notes úkoly k této databázi/);
    assert.match(msg, /Čeká na tebe – návrh hotový \(1\):\n {2}SPAI-005/);
    assert.ok(msg.indexOf("SPAI-005") < msg.indexOf("SPAI-002"));
    assert.match(msg, /vyřeš SPAI-005/);
    const atRoot = (await buildDbReminder(root)) ?? "";
    assert.match(atRoot, /Čeká na tebe/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
