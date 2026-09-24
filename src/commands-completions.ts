import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { getSpaiNewCompletions } from "./autocomplete.js";
import { loadAvailableProjects, loadProjectsConfig } from "./projects.js";
import { getOrLoadIndex } from "./session-state.js";

export const SUBCOMMANDS = [
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
    value: "realize",
    label: "realize <id>",
    description: "Vložit úkol/položku do promptu agenta pro realizaci",
  },
  {
    value: "run",
    label: "run <id>",
    description: "Zkratka pro realize <id>",
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

export async function getCompletions(
  prefix: string,
  cwd?: string,
): Promise<AutocompleteItem[] | null> {
  const tokens = prefix.split(/\s+/).filter(Boolean);
  const trailingSpace = /\s$/.test(prefix);
  const normalizedPrefix = tokens.join(" ").toLowerCase();

  // Direct SPAI prefix or @project completion on 1st token: /spai . ... or /spai @...
  if (/^[.?xXzZ/!@-]/.test(prefix)) {
    const config = loadProjectsConfig();
    return getSpaiNewCompletions(
      prefix,
      () => loadAvailableProjects(false, cwd),
      () => config.sortBy || "name",
      "",
    );
  }

  // N-th Token Completion (2nd or 3rd level parameters)
  if (tokens.length > 1 || (trailingSpace && tokens.length === 1)) {
    const cmd = tokens[0]?.toLowerCase();

    // Subcommand: new
    if (cmd === "new") {
      const remainder = prefix.slice(prefix.indexOf("new") + 3).trimStart();
      const config = loadProjectsConfig();
      return getSpaiNewCompletions(
        remainder,
        () => loadAvailableProjects(false, cwd),
        () => config.sortBy || "name",
        "new ",
      );
    }

    // Subcommand: add
    if (cmd === "add") {
      const remainder = prefix.slice(prefix.indexOf("add") + 3).trimStart();
      const config = loadProjectsConfig();
      return getSpaiNewCompletions(
        remainder,
        () => loadAvailableProjects(false, cwd),
        () => config.sortBy || "name",
        "add ",
      );
    }

    // Subcommand: list
    if (cmd === "list") {
      const filters = [
        {
          value: "list all",
          label: "list all",
          description: "Zobrazit všechny položky v tabulce",
        },
        {
          value: "list todo",
          label: "list todo",
          description: "Pouze otevřené úkoly",
        },
        {
          value: "list working",
          label: "list working",
          description: "Rozpracované úkoly (in progress)",
        },
        {
          value: "list waiting",
          label: "list waiting",
          description: "Čekající úkoly a blokátory",
        },
        {
          value: "list done",
          label: "list done",
          description: "Dokončené úkoly",
        },
        {
          value: "list cancelled",
          label: "list cancelled",
          description: "Zrušené úkoly",
        },
        {
          value: "list idea",
          label: "list idea",
          description: "Nápady a koncepty",
        },
        {
          value: "list note",
          label: "list note",
          description: "Poznámky a zjištěná fakta",
        },
        {
          value: "list board",
          label: "list board",
          description: "Interaktivní Kanban tabule",
        },
      ];
      const filtered = filters.filter((i) =>
        i.value.toLowerCase().startsWith(normalizedPrefix),
      );
      return filtered.length > 0 ? filtered : null;
    }

    // Subcommand: show / realize / run
    if (cmd === "show" || cmd === "realize" || cmd === "run") {
      try {
        const index = await getOrLoadIndex(cwd || process.cwd());
        const query = (tokens[1] || "").toLowerCase();
        const items = index.records
          .filter(
            (r) =>
              !query ||
              r.id.toLowerCase().includes(query) ||
              r.title.toLowerCase().includes(query),
          )
          .map((r) => ({
            value: `${cmd} ${r.id}`,
            label: `${r.id} — ${r.title}`,
            description: `[${r.type} - ${r.status}]`,
          }));
        const filtered = items.filter((i) =>
          i.value.toLowerCase().startsWith(normalizedPrefix),
        );
        return filtered.length > 0 ? filtered : null;
      } catch {
        return null;
      }
    }

    // Subcommand: toggle
    if (cmd === "toggle") {
      if (tokens.length === 2 && !trailingSpace) {
        try {
          const index = await getOrLoadIndex(cwd || process.cwd());
          const query = tokens[1].toLowerCase();
          const items = index.records.map((r) => ({
            value: `toggle ${r.id} `,
            label: `${r.id} — ${r.title}`,
            description: `[${r.type} - ${r.status}]`,
          }));
          const filtered = items.filter(
            (i) =>
              i.value.toLowerCase().startsWith(normalizedPrefix) ||
              i.label.toLowerCase().includes(query),
          );
          return filtered.length > 0 ? filtered : null;
        } catch {
          return null;
        }
      }

      if (tokens.length > 2 || (tokens.length === 2 && trailingSpace)) {
        const id = tokens[1];
        const statuses = [
          "todo",
          "working",
          "waiting",
          "done",
          "cancelled",
          "idea",
          "note",
        ];
        const items = statuses.map((st) => ({
          value: `toggle ${id} ${st}`,
          label: `toggle ${id} ${st}`,
          description: `Nastavit stav položky na "${st}"`,
        }));
        const filtered = items.filter((i) =>
          i.value.toLowerCase().startsWith(normalizedPrefix),
        );
        return filtered.length > 0 ? filtered : null;
      }
    }

    return null;
  }

  // 1st Token Completion (Subcommands)
  const typed = (tokens[0] ?? "").toLowerCase();
  const NON_TERMINAL = new Set([
    "list",
    "new",
    "show",
    "toggle",
    "realize",
    "run",
    "search",
  ]);
  const items: AutocompleteItem[] = [];
  for (const cmd of SUBCOMMANDS) {
    if (cmd.value.toLowerCase().startsWith(typed)) {
      items.push({
        value: NON_TERMINAL.has(cmd.value) ? `${cmd.value} ` : cmd.value,
        label: cmd.label,
        description: cmd.description,
      });
    }
  }

  return items.length > 0 ? items : null;
}
