import test from "node:test";
import assert from "node:assert/strict";
import {
  createSpaiAutocompleteProvider,
  extractAtQuery,
  getSpaiNewCompletions,
} from "../src/autocomplete.js";
import type { ProjectSummary } from "../src/projects.js";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";

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

  const tDrive = extractAtQuery(". Úkol @D:/01_programovani/herdr");
  assert.ok(tDrive);
  assert.equal(tDrive?.query, "D:/01_programovani/herdr");
  assert.equal(tDrive?.rawToken, "@D:/01_programovani/herdr");

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
  assert.ok(completions[0]?.label.includes("📁 herdr/"));
  assert.equal(completions[0]?.value, "new . Nový úkol @D:/01_programovani/herdr/ ");

  const bareCompletions = getSpaiNewCompletions(". Úkol @my", () => mockProjects);
  assert.ok(bareCompletions);
  assert.equal(bareCompletions.length, 1);
  assert.ok(bareCompletions[0]?.label.includes("📁 my app/"));
  assert.equal(bareCompletions[0]?.value, "new . Úkol @D:/01_programovani/my-app/ ");

  const quotedCompletions = getSpaiNewCompletions('. Úkol @"my', () => mockProjects);
  assert.ok(quotedCompletions);
  assert.equal(quotedCompletions.length, 1);
  assert.ok(quotedCompletions[0]?.label.includes("📁 my app/"));
  assert.equal(quotedCompletions[0]?.value, 'new . Úkol @"D:/01_programovani/my-app/" ');
});

test("createSpaiAutocompleteProvider integrates with pi-projects provider without breaking", async () => {
  const dummyBase: AutocompleteProvider = {
    async getSuggestions() {
      return {
        items: [
          {
            value: '@"D:/01_programovani/pi-projects/"',
            label: "📁 pi-projects/",
            description: "[TypeScript] (5 souborů) [root]",
          },
        ],
        prefix: "@pi",
      };
    },
    applyCompletion(lines, cursorLine, cursorCol, _item) {
      return { lines, cursorLine, cursorCol };
    },
    shouldTriggerFileCompletion() {
      return true;
    },
  };

  const provider = createSpaiAutocompleteProvider(dummyBase, () => mockProjects);
  const suggestions = await provider.getSuggestions(
    [". Úkol @pi"],
    0,
    10,
    { signal: new AbortController().signal },
  );

  assert.ok(suggestions);
  // Preserves base provider's project completions instead of overriding
  assert.equal(suggestions?.items.length, 1);
  assert.equal(suggestions?.items[0]?.label, "📁 pi-projects/");
  assert.equal(provider.shouldTriggerFileCompletion?.([". Úkol @"], 0, 8), true);
});
