import {
  DynamicBorder,
  type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { Container, Key, matchesKey, Spacer, Text } from "@earendil-works/pi-tui";
import { invalidateCache, realizeRecord, updateStatusBar } from "./session-state.js";
import { cycleNextStatus } from "./spai.js";
import { updateRecordStatus } from "./storage.js";
import type { SpaiRecord, SpaiStatus } from "./types.js";
import {
  formatReadingMode,
  goldGlow,
  greenGlow,
  pinkGlow,
  violetGlow,
} from "./viewer.js";

export async function openReaderView(
  ctx: ExtensionCommandContext,
  initialRecord: SpaiRecord,
  initialReadingMode = true,
): Promise<{ realize?: boolean; record?: SpaiRecord }> {
  if (!ctx.hasUI || ctx.mode !== "tui") {
    const text = initialReadingMode
      ? formatReadingMode(initialRecord)
      : initialRecord.rawContent || initialRecord.body;
    if (ctx.hasUI) {
      ctx.ui.notify(text, "info");
    }
    return {};
  }

  let realizedRecord: SpaiRecord | null = null;

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
            "m: formátování • r: realize (odeslat agentovi) • 1..5: stav • x/mezerník/s: cyklus stavu • esc: zavřít",
          ),
          1,
          0,
        ),
      );
      container.addChild(new DynamicBorder((s: string) => pinkGlow(s)));
    };

    rebuild();

    let isUpdating = false;
    const setStatus = async (status: SpaiStatus) => {
      if (isUpdating) return;
      isUpdating = true;
      try {
        const updated = await updateRecordStatus(
          ctx.cwd,
          currentRecord.id,
          status,
        );
        if (updated) {
          currentRecord = updated;
          invalidateCache();
          await updateStatusBar(ctx);
          rebuild();
          tui.requestRender();
        }
      } catch (err) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `Chyba při aktualizaci stavu: ${err instanceof Error ? err.message : String(err)}`,
            "error",
          );
        }
      } finally {
        isUpdating = false;
      }
    };

    return {
      render: (w) => container.render(w),
      invalidate: () => {
        rebuild();
        container.invalidate();
      },
      handleInput: (data) => {
        if (matchesKey(data, "m")) {
          readingMode = !readingMode;
          rebuild();
          tui.requestRender();
        } else if (matchesKey(data, "r")) {
          realizedRecord = currentRecord;
          done();
        } else if (
          matchesKey(data, "x") ||
          matchesKey(data, Key.space) ||
          matchesKey(data, "s")
        ) {
          const nextStatus = cycleNextStatus(
            currentRecord.status,
            currentRecord.type,
          );
          void setStatus(nextStatus);
        } else if (data === "1" || data === "t") {
          void setStatus("todo");
        } else if (data === "2" || data === "w") {
          void setStatus("working");
        } else if (data === "3" || data === "p") {
          void setStatus("waiting");
        } else if (data === "4" || data === "d") {
          void setStatus("done");
        } else if (data === "5" || data === "c" || data === "z") {
          void setStatus("cancelled");
        } else if (data === "6" || data === "i") {
          void setStatus("idea");
        } else if (data === "7" || data === "n") {
          void setStatus("note");
        } else if (matchesKey(data, Key.escape) || matchesKey(data, "q")) {
          done();
        }
      },
    };
  });

  if (realizedRecord) {
    realizeRecord(ctx, realizedRecord);
    return { realize: true, record: realizedRecord };
  }

  return {};
}
