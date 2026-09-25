import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { invalidateCache, updateStatusBar } from "./session-state.js";
import { saveRecord, searchRecords, updateRecordStatus } from "./storage.js";
import type { SpaiStatus } from "./types.js";

export function registerTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "record_spai_item",
    label: "Record SPAI Item",
    description:
      "Zaznamenat úkol (. ), nápad (? ) nebo poznámku (- ) v docs/spai/ s plnou podporou SPAI syntaxe. Skladba řádku: '<prefix> <text> @<projekt> !<priorita> :tag1:tag2:'. Tagy jsou vždy whitespace-oddělený blok dvojtečkových tagů (:bl: :email: :okruhy: nebo :bl:email:okruhy:), priorita je pouze ! / !high, !medium, !low.",
    promptSnippet:
      "Zaznamenat projektový úkol, nápad nebo poznámku do docs/spai/",
    promptGuidelines: [
      "Use record_spai_item when the user wants to record a task (. ), idea (? ), or note (- ) in the project backlog.",
      "Always include the current project as an inline @<project> token (folder name of the project root, e.g. @pi-spai; quoted @\"my project\" when it has spaces) and pass the same value in the project argument. This routes storage into that project's docs/spai/.",
      "Write tags only as whitespace-delimited colon blocks: ':tag1:tag2:' or ':tag1: :tag2:'. Lowercase ASCII, allowed chars a-z 0-9 _ . / -. Never '#tag', 'tag:', or 'tags: a, b'.",
      "Priority tokens are exactly '!', '!high', '!medium', '!low' (bare '!' means high) as standalone whitespace-delimited tokens.",
    ],
    parameters: Type.Object({
      text: Type.String({
        description:
          "Text položky ve SPAI syntaxi: '<prefix> <text> @<projekt> !<priorita> @<termín> :tag1:tag2:'. Prefix (. úkol, / pracuje se, /. čeká, x hotovo, z zrušeno, ? nápad, - poznámka) musí být první token následovaný mezerou. Tagy: whitespace-oddělený blok dvojtečkových tagů, např. ':bl: :email: :okruhy:' nebo ':bl:email:okruhy:'. Priorita: ! (high), !high, !medium, !low. Projekt: @nazev-projektu nebo @\"nazev s mezerou\". Termín: @2026-09-01 nebo @15.09.",
      }),
      project: Type.Optional(
        Type.String({
          description: "Volitelný název projektu k provázání úkolu",
        }),
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const saved = await saveRecord(
        ctx.cwd,
        params.text,
        undefined,
        params.project,
      );
      invalidateCache();
      await updateStatusBar(ctx);
      if (ctx.hasUI) {
        ctx.ui.notify(`[SPAI] Vytvořeno ${saved.id}: ${saved.title}`, "info");
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Vytvořena SPAI položka ${saved.id} (${saved.file}):\nTyp: ${saved.type}, Stav: ${saved.status}, Projekt: ${saved.project || "none"}, Titulek: ${saved.title}`,
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
      project: Type.Optional(
        Type.String({
          description: "Volitelný filtr podle názvu projektu",
        }),
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const results = await searchRecords(
        ctx.cwd,
        params.query,
        params.status as SpaiStatus,
        undefined,
        params.project,
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
        const projBadge = m.project ? ` [@${m.project}]` : "";
        lines.push(
          `- [${m.id}] [${m.type} - ${m.status}]${projBadge} (${m.timestamp}): ${m.title}`,
        );
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        details: { matches: results },
      };
    },
  });

  pi.registerTool({
    name: "update_spai_status",
    label: "Update SPAI Item Status",
    description:
      "Změnit stav existujícího SPAI úkolu (např. nastavit 'working' při zahájení práce na úkolu nebo 'done' po jeho dokončení).",
    promptSnippet: "Změnit stav SPAI úkolu v docs/spai/",
    promptGuidelines: [
      "Use update_spai_status to mark tasks as 'working' when starting work and 'done' when completing them.",
    ],
    parameters: Type.Object({
      id: Type.String({
        description: "SPAI ID položky (např. 'SPAI-001' nebo '001')",
      }),
      status: StringEnum(
        [
          "todo",
          "working",
          "waiting",
          "done",
          "cancelled",
          "idea",
          "note",
        ] as const,
        {
          description:
            "Cílový stav: 'working' (rozpracováno), 'done' (hotovo), 'todo' (otevřeno), 'waiting' (blokováno/čeká), 'cancelled' (zrušeno)",
        },
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const updated = await updateRecordStatus(
        ctx.cwd,
        params.id,
        params.status as SpaiStatus,
      );
      if (!updated) {
        throw new Error(
          `SPAI položka s ID "${params.id}" nebyla nalezena.`,
        );
      }
      invalidateCache();
      await updateStatusBar(ctx);
      if (ctx.hasUI) {
        ctx.ui.notify(
          `[SPAI] Stav ${updated.id} změněn na "${updated.status}"`,
          "info",
        );
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Stav položky ${updated.id} (${updated.file}) byl úspěšně změněn na "${updated.status}".`,
          },
        ],
        details: { record: updated },
      };
    },
  });
}
