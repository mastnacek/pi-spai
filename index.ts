import {
  DynamicBorder,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  Key,
  type SelectItem,
  SelectList,
  Spacer,
  Text,
  matchesKey,
} from "@earendil-works/pi-tui";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { KanbanBoardComponent } from "./src/kanban.js";
import {
  cycleNextStatus,
  matchSpaiPrefix,
  parseInlineMeta,
  parseSpai,
} from "./src/spai.js";
import {
  ensureSpaiDir,
  getIndexPath,
  getSpaiDir,
  loadIndex,
  readRecord,
  saveRecord,
  searchRecords,
  updateRecordStatus,
} from "./src/storage.js";
import type {
  SpaiIndex,
  SpaiRecord,
  SpaiStatus,
} from "./src/types.js";
import {
  dividerGlow,
  formatReadingMode,
  goldGlow,
  greenGlow,
  pinkGlow,
  renderDirectoryHeader,
  renderDirectoryTable,
  renderSpaiStatusBadge,
  renderSpaiTypeBadge,
  violetGlow,
} from "./src/viewer.js";

const SUBCOMMANDS = [
  {
    value: "board",
    label: "board",
    description: "Interaktivní Kanban tabule (přesouvání úkolů a změna stavů)",
  },
  {
    value: "list",
    label: "list [todo|idea|note|all]",
    description: "Zobrazit přehled a tabulku SPAI položek",
  },
  {
    value: "new",
    label: "new <text>",
    description: "Rychle vytvořit úkol (. ), nápad (? ) nebo poznámku (- )",
  },
  {
    value: "show",
    label: "show <id> [--raw]",
    description: "Zobrazit detail položky v režimu čtení se SPAI ikonami",
  },
  {
    value: "toggle",
    label: "toggle <id>",
    description: "Přepnout stav položky (todo ➔ working ➔ done ➔ cancelled)",
  },
  {
    value: "search",
    label: "search <dotaz>",
    description: "Vyhledávat v úkolech, nápadech, štítkách a poznámkách",
  },
  {
    value: "status",
    label: "status",
    description: "Zobrazit přehled stavu SPAI ledgeru a počty úkolů",
  },
  {
    value: "help",
    label: "help",
    description: "Zobrazit kompletní nápovědu a přehled SPAI syntaxe",
  },
];

let cachedIndex: SpaiIndex | null = null;

async function getOrLoadIndex(cwd: string): Promise<SpaiIndex> {
  if (cachedIndex) return cachedIndex;
  cachedIndex = await loadIndex(cwd);
  return cachedIndex;
}

function invalidateCache(): void {
  cachedIndex = null;
}

async function handleSessionStart(ctx: ExtensionContext): Promise<void> {
  try {
    await ensureSpaiDir(ctx.cwd);
    invalidateCache();
    const index = await getOrLoadIndex(ctx.cwd);
    if (ctx.hasUI && index.records.length > 0) {
      const activeTodos = index.records.filter(
        (r) => r.status === "todo" || r.status === "working",
      ).length;
      ctx.ui.setStatus("pi-spai", `SPAI: ${activeTodos} aktivních úkolů`);
    }
  } catch {
    // Non-blocking
  }
}

async function openReaderView(
  ctx: ExtensionCommandContext,
  initialRecord: SpaiRecord,
  initialReadingMode = true,
): Promise<void> {
  if (!ctx.hasUI) {
    const text = initialReadingMode
      ? formatReadingMode(initialRecord)
      : initialRecord.rawContent || initialRecord.body;
    ctx.ui.notify(text, "info");
    return;
  }

  await ctx.ui.custom<void>((tui, theme, _kb, done) => {
    let readingMode = initialReadingMode;
    let currentRecord = initialRecord;
    const container = new Container();

    const rebuild = () => {
      container.clear();
      container.addChild(new DynamicBorder((s: string) => pinkGlow(s)));

      const modeBadge = readingMode
        ? greenGlow("[● Čtení (SPAI)]")
        : goldGlow("[⚡ Surový Markdown]");

      const titleLine = `${pinkGlow(theme.bold(`◈ ${currentRecord.id}: ${currentRecord.title}`))}  ${modeBadge}`;
      container.addChild(new Text(titleLine, 1, 0));
      container.addChild(new Spacer(1));

      const content = readingMode
        ? formatReadingMode(currentRecord, theme)
        : currentRecord.rawContent || currentRecord.body;
      container.addChild(new Text(content, 1, 0));

      container.addChild(new Spacer(1));
      container.addChild(
        new Text(
          violetGlow(
            "m: formátování • x/mezerník: přepnout stav (cyklus) • s: vybrat stav • esc: zavřít",
          ),
          1,
          0,
        ),
      );
      container.addChild(new DynamicBorder((s: string) => pinkGlow(s)));
    };

    rebuild();

    return {
      render: (w) => container.render(w),
      invalidate: () => {
        rebuild();
        container.invalidate();
      },
      handleInput: async (data) => {
        if (matchesKey(data, "m") || matchesKey(data, "r")) {
          readingMode = !readingMode;
          rebuild();
          tui.requestRender();
        } else if (matchesKey(data, "x") || matchesKey(data, Key.space)) {
          const nextStatus = cycleNextStatus(
            currentRecord.status,
            currentRecord.type,
          );
          const updated = await updateRecordStatus(
            ctx.cwd,
            currentRecord.id,
            nextStatus,
          );
          if (updated) {
            currentRecord = updated;
            invalidateCache();
            rebuild();
            tui.requestRender();
          }
        } else if (matchesKey(data, "s")) {
          const statuses: SpaiStatus[] = [
            "todo",
            "working",
            "waiting",
            "done",
            "cancelled",
            "idea",
            "note",
          ];
          const choices = statuses.map(
            (st) => `${st} — ${renderSpaiStatusBadge(st)}`,
          );
          const picked = await ctx.ui.select(
            `Zvolte stav pro ${currentRecord.id}:`,
            choices,
          );
          if (picked) {
            const pickedIdx = choices.indexOf(picked);
            const chosenStatus =
              pickedIdx === -1 ? undefined : statuses[pickedIdx];
            if (chosenStatus) {
              const updated = await updateRecordStatus(
                ctx.cwd,
                currentRecord.id,
                chosenStatus,
              );
              if (updated) {
                currentRecord = updated;
                invalidateCache();
                rebuild();
                tui.requestRender();
              }
            }
          }
        } else if (matchesKey(data, Key.escape) || matchesKey(data, "q")) {
          done();
        }
      },
    };
  });
}

async function openDirectoryExplorer(
  ctx: ExtensionCommandContext,
  statusFilter?: SpaiStatus,
): Promise<void> {
  const index = await getOrLoadIndex(ctx.cwd);
  const spaiDir = getSpaiDir(ctx.cwd);

  const displayedRecords = statusFilter
    ? index.records.filter((r) => r.status === statusFilter)
    : index.records;

  if (displayedRecords.length === 0) {
    ctx.ui.notify(
      "V docs/spai/ nebyly nalezeny žádné odpovídající položky. Vytvořte novou přes `/spai new <text>`.",
      "info",
    );
    return;
  }

  if (!ctx.hasUI) {
    ctx.ui.notify(renderDirectoryTable(index, spaiDir), "info");
    return;
  }

  while (true) {
    const selectedId = await ctx.ui.custom<string | null>(
      (tui, theme, _kb, done) => {
        const container = new Container();
        container.addChild(new DynamicBorder((s: string) => pinkGlow(s)));

        const headerLines = renderDirectoryHeader(index, spaiDir, theme);
        for (const h of headerLines) {
          container.addChild(new Text(h, 1, 0));
        }
        container.addChild(new Spacer(1));

        const items: SelectItem[] = displayedRecords.map((r) => {
          const statusBadge = renderSpaiStatusBadge(r.status);
          const typeBadge = renderSpaiTypeBadge(r.type);
          const tagsStr = r.tags.length > 0 ? ` :${r.tags.join(":")}:` : "";
          const prioStr = r.priority === "high" ? " ⚡" : "";
          const deadStr = r.deadline ? ` ⏰ ${r.deadline}` : "";
          return {
            value: r.id,
            label: `${pinkGlow(r.id)} ${typeBadge} ${statusBadge} ${r.title}${prioStr}${deadStr}`,
            description: `${r.timestamp}${tagsStr}`,
          };
        });

        const selectList = new SelectList(items, Math.min(items.length, 12), {
          selectedPrefix: (t) => pinkGlow(t),
          selectedText: (t) => pinkGlow(theme.bold(t)),
          description: (t) => violetGlow(t),
          scrollInfo: (t) => dividerGlow(t),
          noMatch: (t) => goldGlow(t),
        });

        selectList.onSelect = (item) => done(item.value);
        selectList.onCancel = () => done(null);
        container.addChild(selectList);

        container.addChild(new Spacer(1));
        container.addChild(
          new Text(
            violetGlow("↑↓: pohyb • enter: otevřít detail • esc: zpět"),
            1,
            0,
          ),
        );
        container.addChild(new DynamicBorder((s: string) => pinkGlow(s)));

        return {
          render: (w) => container.render(w),
          invalidate: () => container.invalidate(),
          handleInput: (data) => {
            selectList.handleInput(data);
            tui.requestRender();
          },
        };
      },
    );

    if (!selectedId) {
      break;
    }

    const record = await readRecord(ctx.cwd, selectedId);
    if (record) {
      await openReaderView(ctx, record, true);
    }
  }
}

async function openKanbanBoard(ctx: ExtensionCommandContext): Promise<void> {
  const index = await getOrLoadIndex(ctx.cwd);
  const spaiDir = getSpaiDir(ctx.cwd);

  if (index.records.length === 0) {
    ctx.ui.notify(
      "V docs/spai/ nebyly nalezeny žádné úkoly. Vytvořte nový přes `/spai new <text>`.",
      "info",
    );
    return;
  }

  if (!ctx.hasUI) {
    ctx.ui.notify(renderDirectoryTable(index, spaiDir), "info");
    return;
  }

  while (true) {
    let openedRecord: SpaiRecord | null = null;
    let requestNew = false;

    await ctx.ui.custom<void>((tui, _theme, _kb, done) => {
      const board = new KanbanBoardComponent({
        cwd: ctx.cwd,
        index,
        onOpenRecord: (rec: SpaiRecord) => {
          openedRecord = rec;
          done();
        },
        onNewTask: () => {
          requestNew = true;
          done();
        },
        onClose: () => done(),
        onRequestRender: () => tui.requestRender(),
      });

      return {
        render: (w) => board.render(w),
        invalidate: () => board.invalidate(),
        handleInput: (data) => board.handleInput(data),
      };
    });

    if (requestNew) {
      await handleNew("", ctx);
      invalidateCache();
      continue;
    }

    if (openedRecord) {
      await openReaderView(ctx, openedRecord, true);
      invalidateCache();
      continue;
    }

    break;
  }
}

async function handleList(
  remainder: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const arg = remainder.trim().toLowerCase();
  if (!arg || arg === "board" || arg === "kanban") {
    await openKanbanBoard(ctx);
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

async function handleNew(
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

  ctx.ui.notify(
    `Vytvořena položka ${pinkGlow(saved.id)}: ${saved.title} [${saved.type} - ${saved.status}]\nUloženo do ${saved.file}`,
    "info",
  );
}

async function handleShow(
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

async function handleToggle(
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

  if (updated) {
    ctx.ui.notify(
      `Stav ${updated.id} změněn na: ${renderSpaiStatusBadge(updated.status)}`,
      "info",
    );
  }
}

async function handleSearch(
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

async function handleStatus(ctx: ExtensionCommandContext): Promise<void> {
  const index = await getOrLoadIndex(ctx.cwd);
  const spaiDir = getSpaiDir(ctx.cwd);
  const indexPath = getIndexPath(ctx.cwd);

  const todos = index.records.filter((r) => r.status === "todo").length;
  const working = index.records.filter((r) => r.status === "working").length;
  const waiting = index.records.filter((r) => r.status === "waiting").length;
  const done = index.records.filter((r) => r.status === "done").length;
  const ideas = index.records.filter((r) => r.type === "Idea").length;
  const notes = index.records.filter((r) => r.type === "Note").length;

  const lines = [
    "# Stav pi-spai Ledgeru",
    `- **Složka:** ${spaiDir}`,
    `- **Index:** ${indexPath}`,
    `- **Celkem položek:** ${index.records.length}`,
    `- **Úkoly (todo):** ${todos}`,
    `- **Rozpracováno (working):** ${working}`,
    `- **Čekající (waiting):** ${waiting}`,
    `- **Dokončeno (done):** ${done}`,
    `- **Nápady (ideas):** ${ideas}`,
    `- **Poznámky (notes):** ${notes}`,
    `- **Změněno:** ${index.lastUpdated || "Nikdy"}`,
  ];

  ctx.ui.notify(lines.join("\n"), "info");
}

function handleHelp(ctx: ExtensionCommandContext): void {
  const lines = [
    "# pi-spai — Nápověda a SPAI Syntaxe",
    "",
    "SPAI Task, Idea & Note Ledger pro Pi coding agent (100% kompatibilní s mozek_rust).",
    "",
    "### Dostupné příkazy:",
    "- `/spai list [all|todo|idea|note|done]` — Interaktivní TUI přehled a tabulka položek.",
    "- `/spai new <text>` — Rychlý záchyt úkolu, nápadu nebo poznámky se SPAI prefixem.",
    "- `/spai show <id> [--raw]` — Zobrazit detail v čistém režimu čtení se SPAI ikonami.",
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

async function getCompletions(
  prefix: string,
): Promise<AutocompleteItem[] | null> {
  const normalized = prefix.trimStart();
  const match = normalized.match(/^(\S+)(?:\s+(.*))?$/);

  if (!match || match[2] === undefined) {
    const subPrefix = normalized.toLowerCase();
    const matches = SUBCOMMANDS.flatMap((cmd) =>
      cmd.value.startsWith(subPrefix)
        ? [{ value: cmd.value, label: cmd.label, description: cmd.description }]
        : [],
    );
    return matches.length > 0 ? matches : null;
  }

  const [, subcommand, argPrefix] = match;
  const subLower = subcommand.toLowerCase();

  if (subLower === "list") {
    const filters = [
      {
        value: "list all",
        label: "list all",
        description: "Zobrazit všechny položky",
      },
      {
        value: "list todo",
        label: "list todo",
        description: "Pouze otevřené úkoly",
      },
      {
        value: "list working",
        label: "list working",
        description: "Rozpracované úkoly",
      },
      {
        value: "list waiting",
        label: "list waiting",
        description: "Čekající úkoly",
      },
      { value: "list done", label: "list done", description: "Hotové úkoly" },
      {
        value: "list cancelled",
        label: "list cancelled",
        description: "Zrušené úkoly",
      },
      { value: "list idea", label: "list idea", description: "Nápady" },
      { value: "list note", label: "list note", description: "Poznámky" },
    ];
    const query = (argPrefix || "").trim().toLowerCase();
    const matches = filters.filter(
      (f) => !query || f.value.toLowerCase().includes(query),
    );
    return matches.length > 0 ? matches : null;
  }

  if (subLower === "show" || subLower === "toggle") {
    try {
      const query = (argPrefix || "").trim().toLowerCase();
      const index = await getOrLoadIndex(process.cwd());
      const matches = index.records.flatMap((r) => {
        const matchesQuery =
          !query ||
          r.id.toLowerCase().includes(query) ||
          r.title.toLowerCase().includes(query);
        return matchesQuery
          ? [
              {
                value: `${subLower} ${r.id}`,
                label: `${r.id} — ${r.title}`,
                description: `[${r.type} - ${r.status}]`,
              },
            ]
          : [];
      });
      return matches.length > 0 ? matches : null;
    } catch {
      return null;
    }
  }

  return null;
}

function registerTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "record_spai_item",
    label: "Record SPAI Item",
    description:
      "Zaznamenat úkol (. ), nápad (? ) nebo poznámku (- ) v docs/spai/ s plnou podporou SPAI syntaxe.",
    promptSnippet:
      "Zaznamenat projektový úkol, nápad nebo poznámku do docs/spai/",
    promptGuidelines: [
      "Use record_spai_item when the user wants to record a task (. ), idea (? ), or note (- ) in the project backlog.",
    ],
    parameters: Type.Object({
      text: Type.String({
        description:
          "Text položky včetně volitelného SPAI prefixu (. úkol, ? nápad, - poznámka, x hotovo, ! priorita, @termín, :tag:)",
      }),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const saved = await saveRecord(ctx.cwd, params.text);
      invalidateCache();
      if (ctx.hasUI) {
        ctx.ui.notify(`[SPAI] Vytvořeno ${saved.id}: ${saved.title}`, "info");
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Vytvořena SPAI položka ${saved.id} (${saved.file}):\nTyp: ${saved.type}, Stav: ${saved.status}, Titulek: ${saved.title}`,
          },
        ],
        details: { record: saved },
      };
    },
  });

  pi.registerTool({
    name: "search_spai_items",
    label: "Search SPAI Items",
    description:
      "Vyhledávat v projektových úkolech, nápadech a poznámkách v docs/spai/.",
    promptSnippet: "Vyhledávat v projektovém backlogu docs/spai/",
    promptGuidelines: [
      "Use search_spai_items when searching for project tasks, ideas, or notes in docs/spai/.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Hledaný text, tag nebo ID" }),
      status: Type.Optional(
        Type.String({
          description:
            "Volitelný filtr stavu ('todo', 'working', 'waiting', 'done', 'idea', 'note')",
        }),
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const results = await searchRecords(
        ctx.cwd,
        params.query,
        params.status as SpaiStatus,
      );
      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Nenalezeny žádné SPAI položky pro dotaz "${params.query}".`,
            },
          ],
          details: { matches: [] },
        };
      }

      const lines = [`Nalezeno ${results.length} SPAI položek:`];
      for (const m of results) {
        lines.push(
          `- [${m.id}] [${m.type} - ${m.status}] (${m.timestamp}): ${m.title}`,
        );
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        details: { matches: results },
      };
    },
  });
}

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => handleSessionStart(ctx));
  registerTools(pi);

  pi.registerCommand("spai", {
    description: "Správa úkolů, nápadů a poznámek podle SPAI syntaxe",
    getArgumentCompletions: getCompletions,
    handler: async (
      args: string,
      ctx: ExtensionCommandContext,
    ): Promise<void> => {
      const trimmed = args.trim();
      const [subcommand = "list", ...rest] = trimmed.split(/\s+/);
      const remainder = rest.join(" ").trim();

      switch (subcommand.toLowerCase()) {
        case "board":
        case "kanban":
          await openKanbanBoard(ctx);
          break;
        case "list":
          await handleList(remainder, ctx);
          break;
        case "new":
          await handleNew(remainder, ctx);
          break;
        case "show":
          await handleShow(remainder, ctx);
          break;
        case "toggle":
          await handleToggle(remainder, ctx);
          break;
        case "search":
          await handleSearch(remainder, ctx);
          break;
        case "status":
          await handleStatus(ctx);
          break;
        case "help":
        case "--help":
        case "-h":
          handleHelp(ctx);
          break;
        default:
          ctx.ui.notify(
            `Neznámý příkaz "/spai ${subcommand}". Použijte: /spai help`,
            "warning",
          );
          break;
      }
    },
  });
}
