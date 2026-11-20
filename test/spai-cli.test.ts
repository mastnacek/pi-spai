import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  NOT_FOUND,
  SpaiCliError,
  addRecord,
  describeDuplicates,
  describeWritten,
  findBinary,
  processRunner,
  setRunner,
  setStatus,
  similar,
} from "../src/spai-cli.js";
import { saveRecord, updateRecordStatus } from "../src/storage.js";
import { fail, fakeSpai, ok } from "./fake-spai.js";

const DUPLICATE = {
  written: false,
  id: null,
  path: null,
  project: "p",
  title: "Fix login",
  pending: [],
  duplicates: [{ id: "SPAI-007", project: "beta", title: "Oprava přihlášení", score: 0.93, path: "b.md" }],
  related: [{ id: "SPAI-009", project: "beta", title: "Příbuzné", score: 0.7, path: "c.md" }],
};

test("add: a written record comes back typed", async () => {
  const fake = fakeSpai(() =>
    ok({
      written: true,
      id: "SPAI-012",
      project: "alpha",
      path: "/a/docs/spai/x.md",
      title: "Fix login",
      title_cs: "Oprava přihlášení",
      pending: ["embed"],
      duplicates: [],
      related: [{ id: "SPAI-007", project: "beta", title: "Příbuzné", score: 0.82, path: "b.md" }],
    }),
  );
  setRunner(fake.runner);
  const out = await addRecord("/a", ". Fix login", { project: "/a" });
  assert.equal(out.written, true);
  if (!out.written) return;
  assert.equal(out.id, "SPAI-012");
  assert.equal(out.titleCs, "Oprava přihlášení");
  assert.deepEqual(out.pending, ["embed"]);
  assert.equal(out.related[0]?.id, "SPAI-007");
  assert.deepEqual(fake.calls[0]?.argv, ["add", ". Fix login", "--source", "pi", "--project", "/a", "--json"]);
  assert.match(describeWritten(out), /SPAI-012.*Oprava přihlášení/);
  assert.match(describeWritten(out), /Bez sítě, čeká: embed/);
});

test("add: exit 3 returns the candidates and writes nothing", async () => {
  const fake = fakeSpai(() => ({ code: 3, stdout: JSON.stringify({ ok: false, data: DUPLICATE }), stderr: "" }));
  setRunner(fake.runner);
  const out = await addRecord("/a", ". Fix login");
  assert.equal(out.written, false);
  if (out.written) return;
  assert.equal(out.duplicates.length, 1);
  assert.equal(out.duplicates[0]?.project, "beta");
  assert.equal(out.duplicates[0]?.id, "SPAI-007");
  assert.equal(out.duplicates[0]?.title, "Oprava přihlášení");
  assert.equal(out.duplicates[0]?.score, 0.93);
  assert.equal(out.related.length, 1);
  assert.ok(!fake.calls[0]?.argv.includes("--force"));
  const text = describeDuplicates(out);
  assert.match(text, /Nic nezapsáno/);
  assert.match(text, /\[@beta\] SPAI-007 \(93 %\): Oprava přihlášení/);
  assert.match(text, /force=true/);
});

test("add: force is passed to spai only when asked for", async () => {
  const fake = fakeSpai();
  setRunner(fake.runner);
  await addRecord("/a", ". x", { force: true });
  assert.ok(fake.calls[0]?.argv.includes("--force"));
  await saveRecord("/a", ". y");
  assert.ok(!fake.calls[1]?.argv.includes("--force"));
  await saveRecord("/a", ". z", undefined, true);
  assert.ok(fake.calls[2]?.argv.includes("--force"));
});

test("add: a duplicate through saveRecord stays a duplicate (nothing forced)", async () => {
  setRunner(fakeSpai(() => ({ code: 3, stdout: JSON.stringify({ ok: false, data: DUPLICATE }), stderr: "" })).runner);
  const out = await saveRecord("/a", ". Fix login");
  assert.equal(out.written, false);
});

test("add: exit 1 and 2 become SpaiCliError with the spai message", async () => {
  setRunner(fakeSpai(() => fail(2, "unknown project @x; known: a, b")).runner);
  await assert.rejects(
    () => addRecord("/a", ". x @x"),
    (err: unknown) => {
      assert.ok(err instanceof SpaiCliError);
      assert.equal(err.code, 2);
      assert.match(err.message, /unknown project @x/);
      return true;
    },
  );
  setRunner(async () => ({ code: 1, stdout: "", stderr: "něco\nselhalo\n" }));
  await assert.rejects(() => addRecord("/a", ". x"), /selhalo/);
});

test("add: warnings from stderr are kept", async () => {
  setRunner(async () => ({
    code: 0,
    stdout: JSON.stringify({ ok: true, data: { written: true, id: "SPAI-001", project: "p", path: "x", title: "t", pending: [] } }),
    stderr: "pozor: no OpenRouter API key: nothing translated\n",
  }));
  const out = await addRecord("/a", ". t");
  assert.equal(out.written && out.warnings[0], "no OpenRouter API key: nothing translated");
});

test("set and similar", async () => {
  const fake = fakeSpai();
  setRunner(fake.runner);
  assert.deepEqual(await similar("/a", "text"), []);
  assert.deepEqual(fake.calls[0]?.argv, ["similar", "text", "--json"]);
  setRunner(async (argv) => ({
    code: 0,
    stdout: JSON.stringify({ ok: true, data: { id: argv[1], status: argv[2], from: "todo", changed: true, path: "p.md" } }),
    stderr: "",
  }));
  const change = await setStatus("/a", "SPAI-001", "done", "/a");
  assert.deepEqual(change, { id: "SPAI-001", status: "done", from: "todo", changed: true, path: "p.md" });
});

test("a failing set does not look like a success", async () => {
  setRunner(async () => ({ code: 2, stdout: JSON.stringify({ ok: false, error: 'unknown status "x"' }), stderr: "" }));
  await assert.rejects(() => setStatus("/a", "SPAI-001", "x"), /unknown status/);
});

test("missing binary: a clear message", async () => {
  const none = processRunner({ SPAI_BIN: "", PATH: "", Path: "", USERPROFILE: "", HOME: "" });
  await assert.rejects(
    () => none(["help"], tmpdir()),
    (err: unknown) => {
      assert.ok(err instanceof SpaiCliError);
      assert.equal(err.message, NOT_FOUND);
      assert.match(err.message, /cargo install --path cli/);
      assert.match(err.message, /SPAI_BIN/);
      return true;
    },
  );
  assert.equal(findBinary({ SPAI_BIN: "", PATH: "", USERPROFILE: "", HOME: "" }), undefined);
});

// One test against the real binary, only when it is installed, and only in a scratch
// directory with every path that could reach a real backlog, database or API key redirected.
test("real spai: add writes the file, a duplicate stops, set changes the status", { skip: findBinary() ? false : "spai not installed" }, async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-spai-real-"));
  try {
    const proj = join(root, "proj");
    await mkdir(join(proj, "docs", "spai"), { recursive: true });
    const sandbox = {
      SPAI_DB: join(root, "state", "index.db"),
      HOME: join(root, "home"),
      USERPROFILE: join(root, "home"),
      APPDATA: join(root, "appdata"),
      LOCALAPPDATA: join(root, "local"),
      HERDR_PLUGIN_CONFIG_DIR: join(root, "cfg"),
      OPENROUTER_API_KEY: "",
      SPAI_BIN: findBinary() ?? "",
    };
    setRunner(processRunner(sandbox));

    const first = await saveRecord(proj, ". Prvni zkusebni ukol :a:");
    assert.equal(first.written, true);
    const files = (await readdir(join(proj, "docs", "spai"))).filter((f) => f.endsWith(".md"));
    assert.equal(files.length, 1);
    assert.match(await readFile(join(proj, "docs", "spai", files[0] as string), "utf8"), /source: pi/);

    const again = await saveRecord(proj, ". Prvni zkusebni ukol :a:");
    assert.equal(again.written, false);
    assert.equal((await readdir(join(proj, "docs", "spai"))).filter((f) => f.endsWith(".md")).length, 1);

    const done = await updateRecordStatus(proj, "SPAI-001", "done");
    assert.equal(done?.status, "done");

    const forced = await saveRecord(proj, ". Prvni zkusebni ukol :a:", undefined, true);
    assert.equal(forced.written, true);
    assert.equal((await readdir(join(proj, "docs", "spai"))).filter((f) => f.endsWith(".md")).length, 2);
  } finally {
    setRunner();
    await rm(root, { recursive: true, force: true });
  }
});
