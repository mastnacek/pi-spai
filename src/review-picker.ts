import {
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { goldGlow, greenGlow, pinkGlow, violetGlow } from "./theme.js";
import type { ReviewItem } from "./review.js";

const FILTERS = ["Vše", "IN", "SP", "ZN", "ZOP"] as const;
const ROWS = 18;

/** Cut or pad a (possibly styled) string to exactly `width` cells. */
function fit(s: string, width: number): string {
  const cut = truncateToWidth(s, width, "…");
  return cut + " ".repeat(Math.max(0, width - visibleWidth(cut)));
}

/**
 * Multi-select of Notes tasks for `/spai review`: the list on the left, the
 * text of the task under the cursor on the right. Pure state + line
 * rendering, so the selection logic is testable without a terminal.
 */
export class ReviewPicker {
  private filter = 0;
  private cursor = 0;
  private scroll = 0;
  private previewScroll = 0;
  readonly selected = new Set<string>();

  constructor(
    private readonly items: ReviewItem[],
    private readonly onDone: (picked: ReviewItem[] | null) => void,
    private readonly requestRender: () => void = () => {},
  ) {}

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
    if (this.cursor < this.scroll) this.scroll = this.cursor;
    if (this.cursor >= this.scroll + ROWS) this.scroll = this.cursor - ROWS + 1;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) || data === "k") this.move(-1);
    else if (matchesKey(data, Key.down) || data === "j") this.move(1);
    else if (matchesKey(data, Key.pageDown) || data === "]") this.previewScroll += ROWS - 2;
    else if (matchesKey(data, Key.pageUp) || data === "[")
      this.previewScroll = Math.max(0, this.previewScroll - (ROWS - 2));
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

  private listLines(width: number): string[] {
    const vis = this.visible();
    const lines: string[] = [];
    if (vis.length === 0) lines.push("  (žádné úkoly)");
    for (let r = this.scroll; r < Math.min(vis.length, this.scroll + ROWS); r++) {
      const it = vis[r] as ReviewItem;
      const box = this.selected.has(it.entry.id) ? greenGlow("[x]") : "[ ]";
      const cur = r === this.cursor ? pinkGlow("›") : " ";
      const mark = it.verdict ? greenGlow("✓") : " ";
      const title = it.entry.title.replace(/^\[[A-Z]+-\d+\]\s*/, "");
      const id = it.entry.id.replace(/^SPAI-/, "");
      lines.push(fit(`${cur}${box}${mark}${id} ${(it.type ?? "?").padEnd(3)} ${title}`, width));
    }
    while (lines.length < ROWS) lines.push(" ".repeat(width));
    return lines;
  }

  private previewLines(width: number): string[] {
    const it = this.current();
    if (!it) return Array.from({ length: ROWS }, () => " ".repeat(width));
    const db = it.entry.databasePath?.split("/").pop() ?? "";
    const head = [
      pinkGlow(`${it.entry.id}  ${it.entry.title}`),
      violetGlow(`${db}${it.entry.deadline ? `  ·  termín ${it.entry.deadline}` : ""}`) +
        (it.verdict ? greenGlow(`  ·  ✓ ${it.verdict}`) : ""),
      violetGlow("─".repeat(width)),
    ];
    const body = it.preview
      .split("\n")
      .flatMap((l) => (l.trim() === "" ? [""] : wrapTextWithAnsi(l, width)));
    const maxScroll = Math.max(0, body.length - (ROWS - head.length));
    if (this.previewScroll > maxScroll) this.previewScroll = maxScroll;
    const shown = body.slice(this.previewScroll, this.previewScroll + ROWS - head.length);
    const lines = [...head.flatMap((h) => wrapTextWithAnsi(h, width)).slice(0, head.length), ...shown];
    if (body.length > ROWS - head.length) {
      const pos = `▼ ${this.previewScroll + 1}/${body.length}  PgDn/PgUp`;
      lines[ROWS - 1] = violetGlow(pos);
    }
    while (lines.length < ROWS) lines.push("");
    return lines.slice(0, ROWS).map((l) => fit(l, width));
  }

  render(width: number): string[] {
    const inner = Math.max(40, width - 4);
    const listW = Math.max(30, Math.floor(inner * 0.45));
    const prevW = inner - listW - 3;
    const row = (s: string) => `${violetGlow("│")} ${fit(s, inner)} ${violetGlow("│")}`;
    const rule = (l: string, r: string) => violetGlow(l + "─".repeat(inner + 2) + r);

    const tabs = FILTERS.map((f, i) => {
      const n = f === "Vše" ? this.items.length : this.items.filter((it) => it.type === f).length;
      const label = `${f} ${n}`;
      return i === this.filter ? pinkGlow(`[${label}]`) : ` ${label} `;
    }).join(" ");

    const vis = this.visible();
    const pos = vis.length > ROWS ? violetGlow(`   ${this.cursor + 1}/${vis.length}`) : "";
    const left = this.listLines(listW);
    const right = this.previewLines(prevW);

    return [
      rule("╭", "╮"),
      row(`${pinkGlow("◈ Revize Notes úkolů")}   vybráno ${goldGlow(String(this.selected.size))}   ${tabs}${pos}`),
      row(""),
      ...left.map((l, i) => row(`${l} ${violetGlow("│")} ${right[i] ?? ""}`)),
      row(""),
      row(
        violetGlow(
          "↑↓ pohyb • mezerník vybrat • a vše neprohlédnuté • Tab typ • PgDn/PgUp náhled • Enter spustit agenta • Esc zavřít",
        ),
      ),
      rule("╰", "╯"),
    ];
  }

  invalidate(): void {}
}
