import test from "node:test";
import assert from "node:assert/strict";
import {
  extractAtQuery,
  getSpaiNewCompletions,
} from "../src/autocomplete.js";
import type { ProjectSummary } from "../src/projects.js";

const mockProjects: ProjectSummary[] = [
  { name: "herdr", path: "D:/01_programovani/herdr", type: "TypeScript" },
  { name: "pi-spai", path: "D:/01_programovani/pi/plugins/pi-spai", type: "TypeScript" },
  { name: "mozek", path: "D:/01_programovani/mozek", type: "JavaScript" },
  { name: "my app", path: "D:/01_programovani/my-app", type: "Rust" },
];

test("extractAtQuery extracts query from unclosed @ token", () => {
  const t1 = extractAtQuery(". Opravit chybu @he");
  assert.ok(t1);
  assert.equal(t1?.query, "he");
  assert.equal(t1?.rawToken, "@he");

  const t2 = extractAtQuery(". Úkol @");
  assert.ok(t2);
  assert.equal(t2?.query, "");
  assert.equal(t2?.rawToken, "@");

  const tQuoted = extractAtQuery('. Úkol @"my a');
  assert.ok(tQuoted);
  assert.equal(tQuoted?.query, "my a");
  assert.equal(tQuoted?.rawToken, '@"my a');

  const tNone = extractAtQuery(". Úkol bez zavinace");
  assert.equal(tNone, null);
});

test("getSpaiNewCompletions returns starter prefixes when args are empty", () => {
  const starters = getSpaiNewCompletions("", () => mockProjects);
  assert.ok(starters);
  assert.ok(starters.some((s) => s.value === "new . "));
  assert.ok(starters.some((s) => s.value === "new ? "));
  assert.ok(starters.some((s) => s.value === "new - "));
});

test("getSpaiNewCompletions suggests projects when typing @ in task", () => {
  const completions = getSpaiNewCompletions(". Nový úkol @he", () => mockProjects);
  assert.ok(completions);
  assert.equal(completions.length, 1);
  assert.equal(completions[0]?.label, "@herdr");
  assert.equal(completions[0]?.value, "new . Nový úkol @herdr ");

  const quotedCompletions = getSpaiNewCompletions(". Úkol @my", () => mockProjects);
  assert.ok(quotedCompletions);
  assert.equal(quotedCompletions.length, 1);
  assert.equal(quotedCompletions[0]?.label, "@my app");
  assert.equal(quotedCompletions[0]?.value, 'new . Úkol @"my app" ');
});
