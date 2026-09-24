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
