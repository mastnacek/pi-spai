import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { saveRecord, searchRecords } from "../src/storage.js";
import { scanWorkspaceSubprojects } from "../src/projects.js";
import { getSpaiNewCompletions } from "../src/autocomplete.js";

test("monorepo: saving task to subproject via @ selects subproject spai folder", async () => {
  const monorepo = await mkdtemp(join(tmpdir(), "pi-monorepo-"));
  const subproj = join(monorepo, "my-subproject");
  await mkdir(subproj);

  // Nested container package
  const packagesDir = join(monorepo, "packages");
  const nestedSub = join(packagesDir, "nested-pkg");
  await mkdir(packagesDir);
  await mkdir(nestedSub);

  try {
    // 1. Trailing @name
    const recA = await saveRecord(monorepo, ". Task A @my-subproject");
    assert.ok(recA.filePath && recA.filePath.includes("my-subproject"), `Expected subproject path, got: ${recA.filePath}`);
    assert.equal(existsSync(join(subproj, "docs", "spai")), true);
    assert.equal(existsSync(join(monorepo, "docs", "spai")), false);

    // 2. Leading @name with task prefix
    const recB = await saveRecord(monorepo, "@my-subproject/ . Task B");
    assert.equal(recB.type, "Todo");
    assert.equal(recB.status, "todo");
    assert.equal(recB.title, "Task B");
    assert.ok(recB.filePath && recB.filePath.includes("my-subproject"));

    // 3. Leading absolute path
    const normSub = subproj.replace(/\\/g, "/");
    const recC = await saveRecord(monorepo, `@${normSub}/ . Task C`);
    assert.equal(recC.type, "Todo");
    assert.equal(recC.status, "todo");
    assert.equal(recC.title, "Task C");
    assert.ok(recC.filePath && recC.filePath.includes("my-subproject"));

    // 4. Nested monorepo subproject
    const recD = await saveRecord(monorepo, ". Task D @nested-pkg");
    assert.ok(recD.filePath && recD.filePath.includes("nested-pkg"));
    assert.equal(existsSync(join(nestedSub, "docs", "spai")), true);

    // 5. scanWorkspaceSubprojects discovers both
    const detected = scanWorkspaceSubprojects(monorepo);
    const names = detected.map((p) => p.name);
    assert.ok(names.includes("my-subproject"));
    assert.ok(names.includes("nested-pkg"));

    // 6. Autocomplete suggestions in monorepo
    const completions = getSpaiNewCompletions(
      ". Task @",
      () => detected,
      () => "name",
      "",
    );
    assert.ok(completions && completions.length >= 2);
    assert.ok(completions.some((c) => c.label.includes("my-subproject")));
    assert.ok(completions.some((c) => c.label.includes("nested-pkg")));

    // 7. Search in subproject
    const matches = await searchRecords(monorepo, "Task D", undefined, undefined, "nested-pkg");
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.id, recD.id);
  } finally {
    await rm(monorepo, { recursive: true, force: true });
  }
});
