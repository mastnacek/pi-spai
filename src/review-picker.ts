import {
  Key,
  Markdown,
  type MarkdownTheme,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { goldGlow, greenGlow, pinkGlow, violetGlow } from "./theme.js";
import type { ReviewItem } from "./review.js";

const FILTERS = ["Vše", "IN", "SP", "ZN", "ZOP"] as const;
/** From this inner width the list and the preview sit side by side, below it they stack. */
export const SIDE_BY_SIDE_MIN = 116;
const SIDE_ROWS = 18;
const STACK_LIST_ROWS = 8;
const STACK_PREVIEW_ROWS = 12;

/** Cut or pad a (possibly styled) string to exactly `width` cells. */
function fit(s: string, width: number): string {
  const cut = truncateToWidth(s, width, "…");
  return cut + " ".repeat(Math.max(0, width - visibleWidth(cut)));
}

/**
 * Multi-select of Notes tasks for `/spai review`: the list and a preview of
 * the task under the cursor — side by side in a wide pane, stacked in a narrow
 * one. Pure state + line rendering, so the logic is testable without a terminal.
 */
export class ReviewPicker {
  private filter = 0;
  private cursor = 0;
  private scroll = 0;
  private previewScroll = 0;
  /** Row counts of the last render; the layout depends on the width. */
  private listRows = SIDE_ROWS;
  private previewRows = SIDE_ROWS;
  readonly selected = new Set<string>();

  /** Rendered preview of the last item/width; markdown rendering is not free. */
  private bodyCache?: { key: string; lines: string[] };

  constructor(
    private readonly items: ReviewItem[],
    private readonly onDone: (picked: ReviewItem[] | null) => void,
    private readonly requestRender: () => void = () => {},
    /** pi's markdown theme; without it (tests) the preview is plain wrapped text. */
    private readonly markdownTheme?: MarkdownTheme,
  ) {}

  private previewBody(it: ReviewItem, width: number): string[] {
    const key = `${it.entry.id}:${width}`;
    if (this.bodyCache?.key === key) return this.bodyCache.lines;
    const lines = this.markdownTheme
      ? new Markdown(it.preview, 0, 0, this.markdownTheme).render(width)
      : it.preview.split("\n").flatMap((l) => (l.trim() === "" ? [""] : wrapTextWithAnsi(l, width)));
    this.bodyCache = { key, lines };
    return lines;
  }

  visible(): ReviewItem[] {
    const f = FILTERS[this.filter];
    return f === "Vše" ? this.items : this.items.filter((i) => i.type === f);
  }

  picked(): ReviewItem[] {
    return this.items.filter((i) => this.selected.has(i.entry.id));
  }

  current(): ReviewItem | undefined {
    return this.visible()[this.cursor];
  }

  toggle(): void {
    const item = this.current();
    if (!item) return;
    const id = item.entry.id;
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
  }

  /** Select every not-yet-reviewed task in the current filter; again = clear them. */
  toggleAllUnreviewed(): void {
    const fresh = this.visible().filter((i) => !i.verdict);
    const allOn = fresh.length > 0 && fresh.every((i) => this.selected.has(i.entry.id));
    for (const i of fresh) {
      if (allOn) this.selected.delete(i.entry.id);
      else this.selected.add(i.entry.id);
    }
  }

  nextFilter(): void {
    this.filter = (this.filter + 1) % FILTERS.length;
    this.cursor = 0;
    this.scroll = 0;
    this.previewScroll = 0;
  }

  move(delta: number): void {
    const n = this.visible().length;
    if (n === 0) return;
    const next = Math.max(0, Math.min(n - 1, this.cursor + delta));
    if (next !== this.cursor) this.previewScroll = 0;
    this.cursor = next;
    this.keepCursorVisible();
  }

  private keepCursorVisible(): void {
    if (this.cursor < this.scroll) this.scroll = this.cursor;
    if (this.cursor >= this.scroll + this.listRows) this.scroll = this.cursor - this.listRows + 1;
  }

  /** Reading mode: the preview takes the whole window, for long tasks. */
  reading = false;

  private scrollPreview(delta: number): void {
    this.previewScroll = Math.max(0, this.previewScroll + delta);
  }

  private handleReadingInput(data: string): void {
    const page = Math.max(1, this.previewRows - 4);
    if (matchesKey(data, Key.up) || data === "k") this.scrollPreview(-1);
    else if (matchesKey(data, Key.down) || data === "j") this.scrollPreview(1);
    else if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.space) || data === "]")
      this.scrollPreview(page);
    else if (matchesKey(data, Key.pageUp) || data === "[") this.scrollPreview(-page);
    else if (matchesKey(data, Key.home) || data === "g") this.previewScroll = 0;
    else if (data === "x") this.toggle();
    else if (
      matchesKey(data, Key.left) ||
      matchesKey(data, Key.escape) ||
      data === "h" ||
      data === "q"
    ) {
      this.reading = false;
      this.previewScroll = 0;
    } else return;
    this.requestRender();
  }

  handleInput(data: string): void {
    if (this.reading) {
      this.handleReadingInput(data);
      return;
    }
    const page = Math.max(1, this.previewRows - 4);
    if (matchesKey(data, Key.right) || data === "l") {
      if (this.current()) this.reading = true;
    } else if (matchesKey(data, Key.shift("down")) || data === "J") this.scrollPreview(1);
    else if (matchesKey(data, Key.shift("up")) || data === "K") this.scrollPreview(-1);
    else if (matchesKey(data, Key.up) || data === "k") this.move(-1);
    else if (matchesKey(data, Key.down) || data === "j") this.move(1);
    else if (matchesKey(data, Key.pageDown) || data === "]") this.previewScroll += page;
    else if (matchesKey(data, Key.pageUp) || data === "[")
      this.previewScroll = Math.max(0, this.previewScroll - page);
    else if (matchesKey(data, Key.space)) {
      this.toggle();
      this.move(1);
    } else if (data === "a") this.toggleAllUnreviewed();
    else if (matchesKey(data, Key.tab)) this.nextFilter();
    else if (matchesKey(data, Key.enter)) {
      const picked = this.picked();
      if (picked.length > 0) this.onDone(picked);
      return;
    } else if (matchesKey(data, Key.escape) || data === "q") {
      this.onDone(null);
      return;
    } else return;
    this.requestRender();
  }

  private listLines(width: number, rows: number): string[] {
    const vis = this.visible();
    const lines: string[] = [];
    if (vis.length === 0) lines.push("  (žádné úkoly)");
    for (let r = this.scroll; r < Math.min(vis.length, this.scroll + rows); r++) {
      const it = vis[r] as ReviewItem;
      const box = this.selected.has(it.entry.id) ? greenGlow("[x]") : "[ ]";
      const cur = r === this.cursor ? pinkGlow("›") : " ";
      const mark = it.verdict ? greenGlow("✓") : " ";
      const title = it.entry.title.replace(/^\[[A-Z]+-\d+\]\s*/, "");
      const id = it.entry.id.replace(/^SPAI-/, "");
      lines.push(fit(`${cur}${box}${mark}${id} ${(it.type ?? "?").padEnd(3)} ${title}`, width));
    }
    while (lines.length < rows) lines.push(" ".repeat(width));
    return lines;
  }

  private previewLines(width: number, rows: number): string[] {
    const it = this.current();
    if (!it) return Array.from({ length: rows }, () => " ".repeat(width));
    const db = it.entry.databasePath?.split("/").pop() ?? "";
    const head = [
      pinkGlow(`${it.entry.id}  ${it.entry.title}`),
      violetGlow(`${db}${it.entry.deadline ? `  ·  termín ${it.entry.deadline}` : ""}`) +
        (it.verdict ? greenGlow(`  ·  ✓ ${it.verdict}`) : ""),
      violetGlow("─".repeat(width)),
    ].map((h) => fit(h, width));
    const body = this.previewBody(it, width);
    const overflow = body.length > rows - head.length;
    // When the text overflows, the last row is the position hint, not text.
    const room = Math.max(1, rows - head.length - (overflow ? 1 : 0));
    const maxScroll = Math.max(0, body.length - room);
    if (this.previewScroll > maxScroll) this.previewScroll = maxScroll;
    const lines = [...head, ...body.slice(this.previewScroll, this.previewScroll + room)];
    if (overflow) {
      while (lines.length < rows - 1) lines.push("");
      const end = Math.min(body.length, this.previewScroll + room);
      const hint = this.reading ? "↑↓ / mezerník" : "→ číst celé";
      lines.push(violetGlow(`▼ řádky ${this.previewScroll + 1}–${end} z ${body.length}  ·  ${hint}`));
    }
    while (lines.length < rows) lines.push("");
    return lines.slice(0, rows).map((l) => fit(l, width));
  }

  render(width: number): string[] {
    const inner = Math.max(20, width - 4);
    const sideBySide = inner >= SIDE_BY_SIDE_MIN;
    this.listRows = sideBySide ? SIDE_ROWS : STACK_LIST_ROWS;
    this.previewRows = sideBySide ? SIDE_ROWS : STACK_PREVIEW_ROWS;
    this.keepCursorVisible();

    const row = (s: string) => `${violetGlow("│")} ${fit(s, inner)} ${violetGlow("│")}`;
    const rule = (l: string, r: string) => violetGlow(l + "─".repeat(inner + 2) + r);

    const tabs = FILTERS.map((f, i) => {
      const n = f === "Vše" ? this.items.length : this.items.filter((it) => it.type === f).length;
      const label = `${f} ${n}`;
      return i === this.filter ? pinkGlow(`[${label}]`) : ` ${label} `;
    }).join(" ");
    const vis = this.visible();
    const pos = vis.length > this.listRows ? violetGlow(`   ${this.cursor + 1}/${vis.length}`) : "";

    let body: string[];
    if (this.reading) {
      // Whole window for the text; same height as the list+preview layouts.
      this.previewRows = sideBySide ? SIDE_ROWS : STACK_LIST_ROWS + 1 + STACK_PREVIEW_ROWS;
      const it = this.current();
      const mark = it && this.selected.has(it.entry.id) ? greenGlow("[x] vybráno") : "[ ] nevybráno";
      return [
        rule("╭", "╮"),
        row(`${pinkGlow("◈ Čtení úkolu")}  ${mark}`),
        row(""),
        ...this.previewLines(inner, this.previewRows).map(row),
        row(violetGlow("↑↓ řádek • mezerník/PgDn stránka • g začátek • x vybrat • ← / Esc zpět na seznam")),
        rule("╰", "╯"),
      ];
    }
    if (sideBySide) {
      const listW = Math.floor(inner * 0.45);
      const prevW = inner - listW - 3;
      const left = this.listLines(listW, this.listRows);
      const right = this.previewLines(prevW, this.previewRows);
      body = left.map((l, i) => row(`${l} ${violetGlow("│")} ${right[i] ?? ""}`));
    } else {
      body = [
        ...this.listLines(inner, this.listRows).map(row),
        violetGlow(`├${"─".repeat(inner + 2)}┤`),
        ...this.previewLines(inner, this.previewRows).map(row),
      ];
    }

    const help = sideBySide
      ? "↑↓ pohyb • → číst celé • mezerník vybrat • a vše neprohlédnuté • Tab typ • Enter spustit agenta • Esc zavřít"
      : "↑↓ • → číst • mezerník vybrat • a vše • Tab typ • Enter spustit • Esc";

    return [
      rule("╭", "╮"),
      row(`${pinkGlow("◈ Revize Notes úkolů")}  vybráno ${goldGlow(String(this.selected.size))}${pos}`),
      row(tabs),
      ...body,
      row(violetGlow(help)),
      rule("╰", "╯"),
    ];
  }

  invalidate(): void {}
}
