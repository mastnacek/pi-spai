import {
  DynamicBorder,
  type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  type SelectItem,
  SelectList,
  Spacer,
  Text,
  matchesKey,
} from "@earendil-works/pi-tui";
import { KanbanBoardComponent } from "./kanban.js";
import { discoverAllProjects } from "./projects.js";
import { openReaderView } from "./commands-reader.js";
import {
  getOrLoadIndex,
  invalidateCache,
  realizeRecord,
  updateStatusBar,
} from "./session-state.js";
import {
  getSpaiDir,
  loadAllProjectsIndex,
  readRecord,
} from "./storage.js";
import type { SpaiRecord, SpaiStatus } from "./types.js";
import {
  dividerGlow,
  goldGlow,
  pinkGlow,
  renderDirectoryHeader,
  renderDirectoryTable,
  renderSpaiStatusBadge,
  renderSpaiTypeBadge,
  violetGlow,
} from "./viewer.js";

export async function openDirectoryExplorer(
  ctx: ExtensionCommandContext,
  statusFilter?: SpaiStatus,
): Promise<void> {
  invalidateCache();
  const spaiDir = getSpaiDir(ctx.cwd);

  if (!ctx.hasUI || ctx.mode !== "tui") {
    const index = await getOrLoadIndex(ctx.cwd);
    if (ctx.hasUI) {
      ctx.ui.notify(renderDirectoryTable(index, spaiDir), "info");
    }
    return;
  }

  while (true) {
    invalidateCache();
    const index = await getOrLoadIndex(ctx.cwd);

    const displayedRecords = statusFilter
      ? index.records.filter((r) => r.status === statusFilter)
      : index.records;

    if (displayedRecords.length === 0) {
      ctx.ui.notify(
        statusFilter
          ? `V docs/spai/ nebyly nalezeny žádné položky se stavem "${statusFilter}".`
          : "V docs/spai/ nebyly nalezeny žádné položky. Vytvořte novou přes `/spai new <text>`.",
        "info",
      );
      return;
    }

    let realizeSelectedId: string | null = null;

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
            violetGlow(
              "↑↓: pohyb • enter: detail • r: realize (řešit) • esc: zpět",
            ),
            1,
            0,
          ),
        );
        container.addChild(new DynamicBorder((s: string) => pinkGlow(s)));

        return {
          render: (w) => container.render(w),
          invalidate: () => container.invalidate(),
          handleInput: (data) => {
            if (matchesKey(data, "r")) {
              const selectedItem = selectList.getSelectedItem();
              if (selectedItem) {
                realizeSelectedId = selectedItem.value;
                done(null);
                return;
              }
            }
            selectList.handleInput(data);
            tui.requestRender();
          },
        };
      },
    );

    if (realizeSelectedId) {
      const record = await readRecord(ctx.cwd, realizeSelectedId);
      if (record) {
        realizeRecord(ctx, record);
      }
      break;
    }

    if (!selectedId) {
      break;
    }

    const record = await readRecord(ctx.cwd, selectedId);
    if (record) {
      const res = await openReaderView(ctx, record, true);
      if (res.realize) {
        break;
      }
      invalidateCache();
      await updateStatusBar(ctx);
    }
  }
}

export async function openKanbanBoard(
  ctx: ExtensionCommandContext,
  onNewTask?: () => Promise<void>,
): Promise<void> {
  invalidateCache();
  const allProjects = discoverAllProjects(ctx.cwd);
  const { index: allIndex } = await loadAllProjectsIndex(allProjects);
  let index = allIndex;
  const spaiDir = getSpaiDir(ctx.cwd);

  if (index.records.length === 0) {
    ctx.ui.notify(
      "Nebyly nalezeny žádné SPAI úkoly v žádném projektu. Vytvořte nový přes `/spai new <text>`.",
      "info",
    );
    return;
  }

  if (!ctx.hasUI || ctx.mode !== "tui") {
    if (ctx.hasUI) {
      ctx.ui.notify(renderDirectoryTable(index, spaiDir), "info");
    }
    return;
  }

  while (true) {
    invalidateCache();
    const refreshed = await loadAllProjectsIndex(discoverAllProjects(ctx.cwd));
    index = refreshed.index;
    let openedRecord: SpaiRecord | null = null;
    let realizeTargetRecord: SpaiRecord | null = null;
    let requestNew = false;

    await ctx.ui.custom<void>((tui, _theme, _kb, done) => {
      const board = new KanbanBoardComponent({
        cwd: ctx.cwd,
        index,
        projects: refreshed.projectsWithCounts,
        onReloadIndex: async () => {
          invalidateCache();
          const fresh = await loadAllProjectsIndex(discoverAllProjects(ctx.cwd));
          return fresh.index;
        },
        onOpenRecord: (rec: SpaiRecord) => {
          openedRecord = rec;
          done();
        },
        onRealizeRecord: (rec: SpaiRecord) => {
          realizeTargetRecord = rec;
          done();
        },
        onNewTask: () => {
          requestNew = true;
          done();
        },
        onClose: () => done(),
        onStatusChange: () => {
          invalidateCache();
          void updateStatusBar(ctx);
        },
        onRequestRender: () => {
          tui.requestRender();
          void updateStatusBar(ctx);
        },
      });

      return {
        render: (w) => board.render(w),
        invalidate: () => board.invalidate(),
        handleInput: (data) => board.handleInput(data),
      };
    });

    if (realizeTargetRecord) {
      realizeRecord(ctx, realizeTargetRecord);
      break;
    }

    if (requestNew) {
      if (onNewTask) {
        await onNewTask();
      }
      invalidateCache();
      await updateStatusBar(ctx);
      continue;
    }

    if (openedRecord) {
      const res = await openReaderView(ctx, openedRecord, true);
      if (res.realize) {
        break;
      }
      invalidateCache();
      await updateStatusBar(ctx);
      continue;
    }

    await updateStatusBar(ctx);
    break;
  }
}
