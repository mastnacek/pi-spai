import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { openDirectoryExplorer, openKanbanBoard } from "./commands-explorer.js";
import { openReaderView } from "./commands-reader.js";
import {
  getOrLoadIndex,
  invalidateCache,
  realizeRecord,
  updateStatusBar,
} from "./session-state.js";
import { cycleNextStatus } from "./spai.js";
import {
  getIndexPath,
  getSpaiDir,
  readRecord,
  saveRecord,
  searchRecords,
  updateRecordStatus,
} from "./storage.js";
import type { SpaiRecord, SpaiStatus } from "./types.js";
import {
  formatStatusLine,
  getStatusCounts,
  pinkGlow,
  renderSpaiRibbon,
  renderSpaiStatusBadge,
  renderSpaiTypeBadge,
} from "./viewer.js";

export async function handleList(
  remainder: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const arg = remainder.trim().toLowerCase();
  if (arg === "board" || arg === "kanban") {
    await openKanbanBoard(ctx, () => handleNew("", ctx));
    return;
  }

  let statusFilter: SpaiStatus | undefined;
  if (arg === "todo") statusFilter = "todo";
  else if (arg === "done") statusFilter = "done";
  else if (arg === "working") statusFilter = "working";
  else if (arg === "waiting") statusFilter = "waiting";
  else if (arg === "cancelled") statusFilter = "cancelled";
  else if (arg === "idea") statusFilter = "idea";
  else if (arg === "note") statusFilter = "note";

  await openDirectoryExplorer(ctx, statusFilter);
}

export async function handleNew(
  remainder: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  let text = remainder.trim();
  if (!text) {
    const input = await ctx.ui.input(
      "Zadejte úkol (. ), nápad (? ) nebo poznámku (- ):",
      ". ",
    );
    text = input?.trim() || "";
    if (!text) {
      ctx.ui.notify("Vytváření zrušeno.", "warning");
      return;
    }
  }

  const saved = await saveRecord(ctx.cwd, text);
  invalidateCache();
  await updateStatusBar(ctx);

  const targetInfo = saved.project ? ` v [${saved.project}]` : "";
  ctx.ui.notify(
    `Vytvořeno${targetInfo}: ${pinkGlow(saved.id)}: ${saved.title} [${saved.type} - ${saved.status}]\nUloženo do ${saved.file}`,
    "info",
  );
}

export async function handleShow(
  remainder: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const tokens = remainder.trim().split(/\s+/).filter(Boolean);
  const isRaw = tokens.some((t) => t.toLowerCase() === "--raw");
  const idQuery = tokens
    .filter((t) => !t.startsWith("--"))
    .join(" ")
    .trim();

  if (!idQuery) {
    ctx.ui.notify("Použití: `/spai show <id> [--raw]`", "warning");
    return;
  }

  const record = await readRecord(ctx.cwd, idQuery);
  if (!record) {
    ctx.ui.notify(`Položka nenalezena: "${idQuery}"`, "error");
    return;
  }

  await openReaderView(ctx, record, !isRaw);
}

export async function handleToggle(
  remainder: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const tokens = remainder.trim().split(/\s+/).filter(Boolean);
  const id = tokens[0];
  const explicitStatus = tokens[1]?.toLowerCase() as SpaiStatus | undefined;

  if (!id) {
    ctx.ui.notify(
      "Použití: `/spai toggle <id> [todo|working|waiting|done|cancelled|idea|note]` (např. `/spai toggle SPAI-001 done`)",
      "warning",
    );
    return;
  }

  const record = await readRecord(ctx.cwd, id);
  if (!record) {
    ctx.ui.notify(`Položka nenalezena: "${id}"`, "error");
    return;
  }

  const validStatuses = [
    "todo",
    "working",
    "waiting",
    "done",
    "cancelled",
    "idea",
    "note",
  ];
  const nextStatus: SpaiStatus =
    explicitStatus && validStatuses.includes(explicitStatus)
      ? explicitStatus
      : cycleNextStatus(record.status, record.type);

  const updated = await updateRecordStatus(ctx.cwd, record.id, nextStatus);
  invalidateCache();
  await updateStatusBar(ctx);

  if (updated) {
    ctx.ui.notify(
      `Stav ${updated.id} změněn na: ${renderSpaiStatusBadge(updated.status)}`,
      "info",
    );
  }
}

export async function handleRealize(
  remainder: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const tokens = remainder.trim().split(/\s+/).filter(Boolean);
  const idQuery = tokens[0];

  if (!idQuery) {
    ctx.ui.notify(
      "Použití: `/spai realize <id>` (např. `/spai realize SPAI-001`)",
      "warning",
    );
    return;
  }

  const record = await readRecord(ctx.cwd, idQuery);
  if (!record) {
    ctx.ui.notify(`Položka nenalezena: "${idQuery}"`, "error");
    return;
  }

  realizeRecord(ctx, record);
}

export async function handleSearch(
  remainder: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  if (!remainder) {
    ctx.ui.notify("Použití: `/spai search <hledaný_výraz>`", "warning");
    return;
  }

  const results = await searchRecords(ctx.cwd, remainder);
  if (results.length === 0) {
    ctx.ui.notify(`Žádné položky neodpovídají výrazu "${remainder}".`, "info");
    return;
  }

  const lines = [
    `# Výsledky vyhledávání SPAI pro "${remainder}" (${results.length} nálezů):`,
    "",
  ];
  for (const m of results) {
    const statusBadge = renderSpaiStatusBadge(m.status);
    const typeBadge = renderSpaiTypeBadge(m.type);
    lines.push(
      `- **${m.id}** ${typeBadge} ${statusBadge} (${m.timestamp}): **${m.title}**`,
    );
  }

  ctx.ui.notify(lines.join("\n"), "info");
}

export async function handleStatus(ctx: ExtensionCommandContext): Promise<void> {
  const index = await getOrLoadIndex(ctx.cwd);
  const spaiDir = getSpaiDir(ctx.cwd);
  const indexPath = getIndexPath(ctx.cwd);
  const counts = getStatusCounts(index);
  const ribbon = renderSpaiRibbon(counts, 28);

  const todos = index.records.filter((r) => r.status === "todo").length;
  const working = index.records.filter((r) => r.status === "working").length;
  const waiting = index.records.filter((r) => r.status === "waiting").length;
  const done = index.records.filter((r) => r.status === "done").length;
  const cancelled = index.records.filter(
    (r) => r.status === "cancelled",
  ).length;
  const ideas = index.records.filter((r) => r.type === "Idea").length;
  const notes = index.records.filter((r) => r.type === "Note").length;
  const statusDashboard = formatStatusLine(index) || "(prázdné / skryté)";

  const lines = [
    "# Stav pi-spai Ledgeru",
    `- **Složka:** ${spaiDir}`,
    `- **Index:** ${indexPath}`,
    `- **Ribbon:** ${ribbon}`,
    `- **Statusline:** ${statusDashboard}`,
    `- **Celkem položek:** ${index.records.length}`,
    `- **Úkoly (. todo):** ${todos}`,
    `- **Rozpracováno (/ working):** ${working}`,
    `- **Čekající (/. waiting):** ${waiting}`,
    `- **Dokončeno (X done):** ${done}`,
    `- **Zrušeno (Z cancelled):** ${cancelled}`,
    `- **Nápady (? ideas):** ${ideas}`,
    `- **Poznámky (- notes):** ${notes}`,
    `- **Změněno:** ${index.lastUpdated || "Nikdy"}`,
  ];

  ctx.ui.notify(lines.join("\n"), "info");
}

export function handleHelp(ctx: ExtensionCommandContext): void {
  const lines = [
    "# pi-spai — Nápověda a SPAI Syntaxe",
    "",
    "SPAI Task, Idea & Note Ledger pro Pi coding agent (100% kompatibilní s mozek_rust).",
    "",
    "### Dostupné příkazy:",
    "- `/spai board` — Interaktivní Kanban tabule (zkratka `r` = realize).",
    "- `/spai list [all|todo|idea|note|done]` — TUI přehled a tabulka položek (zkratka `r` = realize).",
    "- `/spai realize <id>` (nebo `/spai run <id>`) — Odeslat úkol/poznámku do promptu agenta pro realizaci.",
    "- `/spai new <text>` — Rychlý záchyt úkolu, nápadu nebo poznámky se SPAI prefixem.",
    "- `/spai show <id> [--raw]` — Zobrazit detail v čistém režimu čtení (zkratka `r` = realize).",
    "- `/spai toggle <id>` — Přepnout stav úkolu (todo ➔ working ➔ done).",
    "- `/spai search <dotaz>` — Hledat v úkolech, nápadech a štítcích.",
    "- `/spai status` — Zobrazit statistiky a počty úkolů.",
    "- `/spai help` — Zobrazit tuto nápovědu.",
    "",
    "### SPAI Syntaxe (Prefix na 1. řádku):",
    "- `. Úkol` — Todo položka (stav: `todo`)",
    "- `/ Rozpracovaný úkol` — In progress (stav: `working`)",
    "- `/. Čekající úkol` — Waiting / blocker (stav: `waiting`)",
    "- `x Hotový úkol` — Done (stav: `done`)",
    "- `z Zrušený úkol` — Cancelled (stav: `cancelled`)",
    "- `? Nápad` — Idea (stav: `idea`)",
    "- `- Poznámka / fakt` — Note (stav: `note`)",
    "",
    "### Inline Metadata:",
    "- `! Priorita` — Nastaví prioritu na `high` (např. `! . Kritický úkol`)",
    "- `@2026-08-30` nebo `@30.08.` — Nastaví termín (deadline)",
    "- `:tag1:tag2:` — Řetězené štítky (např. `. Opravit IPC :ipc:bug:`)",
  ];

  ctx.ui.notify(lines.join("\n"), "info");
}
