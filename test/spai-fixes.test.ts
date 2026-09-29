import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadIndex,
  readRecord,
  saveRecord,
  searchRecords,
  updateRecordStatus,
} from "../src/storage.js";

interface SeedRecord {
  id: string;
  title: string;
  status: string;
}

function recordMarkdown(
  id: string,
  title: string,
  status: string,
  project: string,
): string {
  return `---\ntype: Todo\nstatus: ${status}\ntimestamp: 2026-09-25 10:00:00\nproject: ${project}\n---\n\n# ${id}: ${title}\n\n. ${title}\n`;
}

async function seedProject(
  dir: string,
  name: string,
  records: SeedRecord[],
): Promise<string> {
  const spaiDir = join(dir, "docs", "spai");
  await mkdir(spaiDir, { recursive: true });
  const entries = [];
  for (const r of records) {
    const file = `${r.id}.md`;
    await writeFile(
      join(spaiDir, file),
      recordMarkdown(r.id, r.title, r.status, name),
      "utf8",
    );
    entries.push({
      id: r.id,
      title: r.title,
      type: "Todo",
      status: r.status,
      symbol: ".",
      timestamp: "2026-09-25 10:00:00",
      tags: [],
      project: name,
      projectPath: dir.replace(/\\/g, "/"),
      file,
    });
  }
  await writeFile(
    join(spaiDir, ".index.json"),
    JSON.stringify(
      { version: 1, lastUpdated: "2026-09-25 10:00:00", records: entries },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  return spaiDir;
}

interface Monorepo {
  root: string;
  projA: string;
  projB: string;
  nameA: string;
  nameB: string;
}

let fixtureSeq = 0;

/**
 * Temp monorepo with two subprojects. Names are unique per test because
 * `resolveProjectFromIdentifier` consults a process-global project cache that
 * would otherwise keep reusing a deleted sibling's name.
 * A `.git` dir bounds the resolver's ancestor walk.
 */
async function makeMonorepo(): Promise<Monorepo> {
  const seq = ++fixtureSeq;
  const root = await mkdtemp(join(tmpdir(), "pi-spai-collide-"));
  await mkdir(join(root, ".git"));
  const nameA = `projA-${seq}`;
  const nameB = `projB-${seq}`;
  const projA = join(root, nameA);
  const projB = join(root, nameB);
  await mkdir(projA);
  await mkdir(projB);
  return { root, projA, projB, nameA, nameB };
}

function fileHasStatus(content: string, status: string): boolean {
  return new RegExp(`status:\\s*${status}`).test(content);
}

test("updateRecordStatus refuses a bare id that exists in several projects", async () => {
  const { root, projA, projB, nameA, nameB } = await makeMonorepo();
  try {
    await seedProject(projA, nameA, [
      { id: "SPAI-013", title: "Collision A", status: "done" },
    ]);
    await seedProject(projB, nameB, [
      { id: "SPAI-013", title: "Collision B", status: "todo" },
    ]);
    const aFile = join(projA, "docs", "spai", "SPAI-013.md");
    const bFile = join(projB, "docs", "spai", "SPAI-013.md");

    await assert.rejects(
      () => updateRecordStatus(projA, "SPAI-013", "working"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, new RegExp(nameA));
        assert.match(err.message, new RegExp(nameB));
        assert.match(err.message, /@<projekt>|cestu/);
        return true;
      },
    );

    assert.ok(fileHasStatus(await readFile(aFile, "utf8"), "done"));
    assert.ok(fileHasStatus(await readFile(bFile, "utf8"), "todo"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("updateRecordStatus with a project qualifier writes only that project", async () => {
  const { root, projA, projB, nameA, nameB } = await makeMonorepo();
  try {
    await seedProject(projA, nameA, [
      { id: "SPAI-013", title: "Collision A", status: "done" },
    ]);
    await seedProject(projB, nameB, [
      { id: "SPAI-013", title: "Collision B", status: "todo" },
    ]);
    const aFile = join(projA, "docs", "spai", "SPAI-013.md");
    const bFile = join(projB, "docs", "spai", "SPAI-013.md");

    const updated = await updateRecordStatus(
      root,
      `SPAI-013 @${nameB}`,
      "working",
    );
    assert.ok(updated);
    assert.equal(updated?.project, nameB);

    assert.ok(fileHasStatus(await readFile(bFile, "utf8"), "working"));
    assert.ok(fileHasStatus(await readFile(aFile, "utf8"), "done"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("updateRecordStatus resolves an id unique to one project from any cwd", async () => {
  const { root, projA, projB, nameA, nameB } = await makeMonorepo();
  try {
    await seedProject(projA, nameA, [
      { id: "SPAI-501", title: "Only A", status: "todo" },
    ]);
    await seedProject(projB, nameB, [
      { id: "SPAI-502", title: "Only B", status: "todo" },
    ]);

    const fromRoot = await updateRecordStatus(root, "SPAI-501", "working");
    assert.equal(fromRoot?.project, nameA);

    const fromA = await updateRecordStatus(projA, "SPAI-502", "done");
    assert.equal(fromA?.project, nameB);

    assert.ok(
      fileHasStatus(
        await readFile(join(projA, "docs", "spai", "SPAI-501.md"), "utf8"),
        "working",
      ),
    );
    assert.ok(
      fileHasStatus(
        await readFile(join(projB, "docs", "spai", "SPAI-502.md"), "utf8"),
        "done",
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("updateRecordStatus returns null for a non-existent id", async () => {
  const { root, projA, projB, nameA, nameB } = await makeMonorepo();
  try {
    await seedProject(projA, nameA, [
      { id: "SPAI-501", title: "Only A", status: "todo" },
    ]);
    await seedProject(projB, nameB, [
      { id: "SPAI-502", title: "Only B", status: "todo" },
    ]);
    assert.equal(await updateRecordStatus(root, "SPAI-999", "done"), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("updateRecordStatus accepts an exact file path", async () => {
  const { root, projA, projB, nameA, nameB } = await makeMonorepo();
  try {
    await seedProject(projA, nameA, [
      { id: "SPAI-013", title: "Collision A", status: "done" },
    ]);
    await seedProject(projB, nameB, [
      { id: "SPAI-013", title: "Collision B", status: "todo" },
    ]);
    const aFile = join(projA, "docs", "spai", "SPAI-013.md");
    const bFile = join(projB, "docs", "spai", "SPAI-013.md");

    const updated = await updateRecordStatus(root, aFile, "working");
    assert.ok(updated);

    assert.ok(fileHasStatus(await readFile(aFile, "utf8"), "working"));
    assert.ok(fileHasStatus(await readFile(bFile, "utf8"), "todo"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("searchRecords honours the project filter for an exact id", async () => {
  const { root, projA, projB, nameA, nameB } = await makeMonorepo();
  try {
    await seedProject(projA, nameA, [
      { id: "SPAI-013", title: "Collision A", status: "done" },
    ]);
    await seedProject(projB, nameB, [
      { id: "SPAI-013", title: "Collision B", status: "todo" },
    ]);

    const matches = await searchRecords(
      root,
      "SPAI-013",
      undefined,
      undefined,
      nameB,
    );
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.project, nameB);
    assert.equal(matches[0]?.id, "SPAI-013");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parallel saveRecord calls get distinct ids and one consistent index", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-spai-parallel-"));
  try {
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        saveRecord(dir, `. Parallel ${i} :test:`, "docs/spai"),
      ),
    );
    const ids = results.map((r) => r.id).sort();
    assert.deepEqual(ids, ["SPAI-001", "SPAI-002", "SPAI-003", "SPAI-004"]);

    const index = await loadIndex(dir, "docs/spai");
    assert.equal(index.records.length, 4);

    const files = (await readdir(join(dir, "docs", "spai"))).filter((f) =>
      f.endsWith(".md"),
    );
    assert.equal(files.length, 4);

    const readBack = await Promise.all(
      ids.map((id) => readRecord(dir, id, "docs/spai")),
    );
    assert.equal(readBack.filter(Boolean).length, 4);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("eight parallel saveRecord calls stay consistent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-spai-parallel8-"));
  try {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        saveRecord(dir, `. Parallel eight ${i} :test:`, "docs/spai"),
      ),
    );
    const ids = results.map((r) => r.id).sort();
    assert.deepEqual(ids, [
      "SPAI-001",
      "SPAI-002",
      "SPAI-003",
      "SPAI-004",
      "SPAI-005",
      "SPAI-006",
      "SPAI-007",
      "SPAI-008",
    ]);

    const index = await loadIndex(dir, "docs/spai");
    assert.equal(index.records.length, 8);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("interleaved saveRecord and updateRecordStatus keep the index consistent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-spai-interleaved-"));
  try {
    const first = await saveRecord(dir, ". First task :test:", "docs/spai");

    const [, updated] = await Promise.all([
      saveRecord(dir, ". Second task :test:", "docs/spai"),
      updateRecordStatus(dir, first.id, "done", "docs/spai"),
    ]);
    assert.equal(updated?.status, "done");

    const index = await loadIndex(dir, "docs/spai");
    assert.equal(index.records.length, 2);
    const firstEntry = index.records.find((r) => r.id === first.id);
    assert.equal(firstEntry?.status, "done");
    assert.ok(index.records.some((r) => r.id !== first.id));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
