import type {
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { createSpaiAutocompleteProvider } from "./autocomplete.js";
import { loadAvailableProjects, loadProjectsConfig } from "./projects.js";
import { ensureSpaiDir, loadIndex } from "./storage.js";
import type { SpaiIndex, SpaiIndexEntry, SpaiRecord } from "./types.js";
import { formatStatusLine, pinkGlow } from "./viewer.js";

let cachedIndex: SpaiIndex | null = null;

export async function getOrLoadIndex(cwd: string): Promise<SpaiIndex> {
  if (cachedIndex) return cachedIndex;
  cachedIndex = await loadIndex(cwd);
  return cachedIndex;
}

export function invalidateCache(): void {
  cachedIndex = null;
}

export function formatRealizePrompt(record: SpaiRecord | SpaiIndexEntry): string {
  const isTask = "type" in record && record.type === "Todo";
  const bodyText =
    "body" in record && record.body ? `\n\n${record.body.trim()}` : "";
  return `Realizuj ${isTask ? "úkol" : "položku"} ${record.id}: ${record.title}${bodyText}`;
}

export function realizeRecord(
  ctx: ExtensionCommandContext,
  record: SpaiRecord | SpaiIndexEntry,
): void {
  const prompt = formatRealizePrompt(record);
  ctx.ui.setEditorText(prompt);
  ctx.ui.notify(
    `Položka ${pinkGlow(record.id)} vložena do promptu pro realizaci.`,
    "info",
  );
}

export async function updateStatusBar(
  ctx: ExtensionContext | ExtensionCommandContext,
): Promise<void> {
  if (!ctx.hasUI) return;
  try {
    const index = await getOrLoadIndex(ctx.cwd);
    const statusText = formatStatusLine(index);
    ctx.ui.setStatus("pi-spai", statusText);
  } catch {
    // Non-blocking
  }
}

export async function handleSessionStart(ctx: ExtensionContext): Promise<void> {
  try {
    await ensureSpaiDir(ctx.cwd);
    invalidateCache();
    await updateStatusBar(ctx);
  } catch {
    // Non-blocking
  }

  if (ctx.hasUI) {
    const config = loadProjectsConfig();
    ctx.ui.addAutocompleteProvider((current) =>
      createSpaiAutocompleteProvider(
        current,
        () => loadAvailableProjects(false, ctx.cwd),
        () => config.sortBy || "name",
        ctx.cwd,
      ),
    );
  }
}
