import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { saveRecord } from "../src/storage.js";
import { setRunner } from "../src/spai-cli.js";
import { fakeSpai, flagValue } from "./fake-spai.js";
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
    const fake = fakeSpai();
    setRunner(fake.runner);
    // What `spai add` was asked to do: the project folder and the text it received.
    const lastAdd = () => {
      const argv = fake.calls[fake.calls.length - 1]?.argv ?? [];
      return { text: argv[1], project: flagValue(argv, "--project")?.replace(/\\/g, "/") };
    };

    // 1. Trailing @name: the project folder is passed, the token is dropped from the text
    await saveRecord(monorepo, ". Task A @my-subproject");
    assert.ok(lastAdd().project?.endsWith("/my-subproject"), `got: ${lastAdd().project}`);
    assert.equal(lastAdd().text, ". Task A");

    // 2. Leading @name with task prefix
    await saveRecord(monorepo, "@my-subproject/ . Task B");
    assert.ok(lastAdd().project?.endsWith("/my-subproject"));
    assert.equal(lastAdd().text, ". Task B");

    // 3. Leading absolute path
    const normSub = subproj.replace(/\\/g, "/");
    await saveRecord(monorepo, `@${normSub}/ . Task C`);
    assert.ok(lastAdd().project?.endsWith("/my-subproject"));
    assert.equal(lastAdd().text, ". Task C");

    // 4. Nested monorepo subproject
    await saveRecord(monorepo, ". Task D @nested-pkg");
    assert.ok(lastAdd().project?.endsWith("/nested-pkg"));

    // 4b. No project: the cwd is the project
    await saveRecord(monorepo, ". Task E");
    assert.equal(lastAdd().project, monorepo.replace(/\\/g, "/"));

    // `spai` creates the backlog folders; the stand-in does not, so make them here.
    await mkdir(join(subproj, "docs", "spai"), { recursive: true });
    await mkdir(join(nestedSub, "docs", "spai"), { recursive: true });

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

  } finally {
    await rm(monorepo, { recursive: true, force: true });
  }
});
