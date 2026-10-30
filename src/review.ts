import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadIndex } from "./storage-fs.js";
import { findWorktreeRoot } from "./storage-resolve.js";
import type { SpaiIndexEntry } from "./types.js";

/** Helpdesk request types, most urgent first. ZOP is where non-urgent IN/SP end up. */
export const REVIEW_TYPES = ["IN", "SP", "ZN", "ZOP"] as const;
const OPEN = new Set(["todo", "working", "waiting"]);

/** `[ZOP-342] …` -> "ZOP"; undefined when the title carries no request type. */
export function requestType(title: string): string | undefined {
  return /^\[([A-Z]+)-\d+\]/.exec(title)?.[1];
}

export interface ReviewItem {
  entry: SpaiIndexEntry;
  type?: string;
  /** `**Verdikt:**` of an earlier review; undefined when not reviewed yet. */
  verdict?: string;
  /** Task text for the picker preview: body without frontmatter and title. */
  preview: string;
}

/**
 * Text for the picker preview. Notes exports start with metadata the preview
 * header already shows, so it begins at `### Popis požadavku` when present;
 * otherwise the body without frontmatter and the `# SPAI-…` title.
 */
export function previewText(text: string): string {
  const body = text.replace(/\r/g, "").replace(/^---\n[\s\S]*?\n---\n/, "");
  const popis = body.indexOf("### Popis požadavku");
  const from = popis >= 0 ? body.slice(popis) : body.replace(/^#\s+SPAI-\d+:.*\n/m, "");
  // Notes rich text exports with runs of blank lines; one blank line is enough.
  return from.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 6000);
}

/** `**Verdikt:** zastaralé | …` -> "zastaralé"; "?" when reviewed without one. */
export function readVerdict(text: string): string | undefined {
  if (!text.includes("## Návrh řešení")) return undefined;
  // Tolerant of how agents bold it: `**Verdikt:** x`, `**Verdikt: x**`, `**Verdikt**: x`, `` `x` ``.
  return /\*{0,2}Verdikt\*{0,2}\s*:\s*\*{0,2}\s*`?(\p{L}+)/u.exec(text)?.[1] ?? "?";
}

/**
 * Every open Notes-database task, most urgent type first, oldest deadline
 * first, each with the verdict of an earlier review if it has one. The task
 * files are the only state.
 */
export async function loadReviewItems(root: string): Promise<ReviewItem[]> {
  const dir = join(root, "docs", "spai");
  const index = await loadIndex(root);
  const rank = (t?: string) => {
    const i = (REVIEW_TYPES as readonly string[]).indexOf(t ?? "");
    return i < 0 ? REVIEW_TYPES.length : i;
  };

  const items: ReviewItem[] = [];
  for (const entry of index.records) {
    if (!entry.databasePath || !OPEN.has(entry.status)) continue;
    let text = "";
    try {
      text = await readFile(join(dir, entry.file), "utf8");
    } catch {
      continue;
    }
    items.push({
      entry,
      type: requestType(entry.title),
      verdict: readVerdict(text),
      preview: previewText(text),
    });
  }
  return items.sort(
    (a, b) =>
      rank(a.type) - rank(b.type) ||
      (a.entry.deadline ?? "9999").localeCompare(b.entry.deadline ?? "9999") ||
      a.entry.id.localeCompare(b.entry.id),
  );
}

export function buildReviewBrief(root: string, tasks: SpaiIndexEntry[]): string {
  const list = tasks
    .map((r) => `- ${r.id} — ${r.title} → \`${r.databasePath}\``)
    .join("\n");
  return `# Revize Notes úkolů (${tasks.length})

Pracuješ v \`${root}\`. Úkoly leží v \`docs/spai/\`, kód databází v \`databaze/<db>/\`.

## Než začneš
1. Načti skill **spai-tasks** a přečti si jeho §10 a §11 (řešení Notes úkolu).
2. Načti skill **lotusscript-modular** a řiď se jím. Kód databází čteš a ověřuješ
   jeho nástroji a znalostní bází (\`kb_search\`, kolekce \`lotus-notes\`).

## Úkoly, v tomto pořadí
${list}

## Postup pro každý úkol, vždy jeden celý, pak další
1. Nastav úkolu stav \`working\` (\`update_spai_status\`).
   Postupuj přesně podle §11: přečti zadání, ověř, jestli problém ještě trvá
   (nebyl už opraven? existuje formulář/pole/agent ještě?), dohledej v kódu
   příčinu s \`soubor:řádek\` a ověř ji v dokumentaci.
2. Do souboru úkolu zapiš \`## Návrh řešení\` a \`## Plán\` podle šablony z §11,
   včetně řádku **Verdikt:**:
   - \`zastaralé\` – problém už neplatí nebo je opravený; v Návrhu uveď důkaz
     a co má Jaroslav udělat v Notes (uzavřít s jakým textem),
   - \`rychlovka\` – řešení na minuty, plán 1–3 kroky (S),
   - \`práce\` – skutečný rozbor a plán.
   Typ ZOP je odkladiště incidentů a požadavků, které nehořely – tam čekej
   hodně verdiktů \`zastaralé\`, ale vždy s důkazem.
3. Zapiš soubor hned po dokončení úkolu a nastav stav \`waiting\` (= čeká na
   Jaroslava), teprve pak přejdi na další. \`done\` nikdy nenastavuj, Notes
   úkoly uzavírá export z Notes sám.
4. **Skript s řešením:** když oprava znamená konkrétní LotusScript, napiš ho
   jako \`.lss\` k vložení do Designeru do
   \`databaze/<db>/01_scripts/SPAI-NNN-<krátký-název>.lss\`. V hlavičce uveď
   element a event, kam patří, a ID úkolu. Ověř ho nástroji lotusscript-modular
   (kontrola překladačem). Do \`## Návrh řešení\` přidej řádek
   \`**Skripty:** [název](../../databaze/<db>/01_scripts/<soubor>.lss)\`.
   Změnu formule (hide-when, výchozí hodnota…) napiš rovnou do Návrhu jako blok kódu.
5. Existující kód databází neměň, jen přidávej nové skripty do \`01_scripts/\`.

## Na konci
V chatu vypiš tabulku: ID | typ | databáze | verdikt | první krok nebo co udělat v Notes.
Seřaď ji: zastaralé, rychlovky, práce.
`;
}

function herdr(args: string[], cwd: string): Promise<string> {
  const bin =
    process.env.HERDR_BIN_PATH ||
    (process.platform === "win32" ? "herdr.exe" : "herdr");
  return new Promise((resolve, reject) => {
    execFile(bin, args, { cwd, windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(new Error(`herdr ${args[0]} ${args[1]}: ${stderr || stdout || error.message}`));
      else resolve(stdout);
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends the prompt and makes sure the agent actually starts working. A freshly
 * started pi reports ready while its extensions still load, so the Enter can
 * get lost and the text just sits in the editor; then press Enter again.
 */
async function submitPrompt(name: string, text: string, cwd: string): Promise<void> {
  try {
    await herdr(
      ["agent", "prompt", name, text, "--wait", "--until", "working", "--until", "blocked", "--timeout", "20000"],
      cwd,
    );
    return;
  } catch {
    // agent_prompt_stalled / timeout: the text is in the editor, not submitted.
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(1500);
    await herdr(["agent", "send-keys", name, "enter"], cwd);
    try {
      await herdr(["agent", "wait", name, "--until", "working", "--until", "blocked", "--timeout", "8000"], cwd);
      return;
    } catch {
      // still idle, try once more
    }
  }
  throw new Error(`agent ${name} zadání nepotvrdil – stiskni v jeho panelu Enter`);
}

/**
 * Starts a pi agent in a new pane right of the current one (same herdr tab)
 * and hands it the brief. Returns the agent name.
 */
export async function launchReviewAgent(root: string, briefPath: string): Promise<string> {
  const split = JSON.parse(
    await herdr(
      ["pane", "split", "--current", "--direction", "right", "--cwd", root, "--no-focus"],
      root,
    ),
  );
  const paneId: string | undefined = split?.result?.pane?.pane_id;
  if (!paneId) throw new Error("herdr pane split nevrátil pane_id");

  const name = `spai-revize-${Date.now().toString(36)}`;
  await herdr(["agent", "start", name, "--kind", "pi", "--pane", paneId, "--timeout", "120000"], root);
  await submitPrompt(name, `Přečti zadání revize v souboru ${briefPath} a proveď ho celé.`, root);
  return name;
}

/** Writes the brief next to the backlog's temp area and returns its path. */
export async function writeReviewBrief(brief: string): Promise<string> {
  const path = join(tmpdir(), `spai-revize-${Date.now().toString(36)}.md`);
  await writeFile(path, brief, "utf8");
  return path;
}

export function reviewRoot(cwd: string): string | null {
  const root = findWorktreeRoot(cwd);
  return existsSync(join(root, "docs", "spai")) ? root : null;
}
