import { Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { goldGlow, greenGlow, pinkGlow, violetGlow } from "./theme.js";
import type { ReviewItem } from "./review.js";

const FILTERS = ["Vše", "IN", "SP", "ZN", "ZOP"] as const;
const VISIBLE_ROWS = 14;

/**
 * Multi-select of Notes tasks for `/spai review`. Pure state + line rendering,
 * so the selection logic is testable without a terminal.
 */
export class ReviewPicker {
  private filter = 0;
  private cursor = 0;
  private scroll = 0;
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

  toggle(): void {
    const item = this.visible()[this.cursor];
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
  }

  move(delta: number): void {
    const n = this.visible().length;
    if (n === 0) return;
    this.cursor = Math.max(0, Math.min(n - 1, this.cursor + delta));
    if (this.cursor < this.scroll) this.scroll = this.cursor;
    if (this.cursor >= this.scroll + VISIBLE_ROWS) this.scroll = this.cursor - VISIBLE_ROWS + 1;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) || data === "k") this.move(-1);
    else if (matchesKey(data, Key.down) || data === "j") this.move(1);
    else if (matchesKey(data, Key.pageUp)) this.move(-VISIBLE_ROWS);
    else if (matchesKey(data, Key.pageDown)) this.move(VISIBLE_ROWS);
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

  render(width: number): string[] {
    const inner = Math.max(20, width - 4);
    const pad = (s: string) => {
      const cut = truncateToWidth(s, inner, "…");
      return `${violetGlow("│")} ${cut}${" ".repeat(Math.max(0, inner - visibleWidth(cut)))} ${violetGlow("│")}`;
    };
    const rule = (l: string, r: string) => violetGlow(l + "─".repeat(inner + 2) + r);

    const tabs = FILTERS.map((f, i) => {
      const n = f === "Vše" ? this.items.length : this.items.filter((it) => it.type === f).length;
      const label = `${f} ${n}`;
      return i === this.filter ? pinkGlow(`[${label}]`) : ` ${label} `;
    }).join(" ");

    const lines = [
      rule("╭", "╮"),
      pad(pinkGlow("◈ Revize Notes úkolů") + `   vybráno ${goldGlow(String(this.selected.size))}`),
      pad(tabs),
      pad(""),
    ];

    const vis = this.visible();
    if (vis.length === 0) lines.push(pad("  (žádné úkoly)"));
    for (let r = this.scroll; r < Math.min(vis.length, this.scroll + VISIBLE_ROWS); r++) {
      const it = vis[r] as ReviewItem;
      const box = this.selected.has(it.entry.id) ? greenGlow("[x]") : "[ ]";
      const cur = r === this.cursor ? pinkGlow("›") : " ";
      const verdict = it.verdict ? greenGlow(` ✓ ${it.verdict}`) : "";
      const dl = it.entry.deadline ? `${it.entry.deadline} ` : "";
      const db = it.entry.databasePath?.split("/").pop() ?? "";
      const title = it.entry.title.replace(/^\[[A-Z]+-\d+\]\s*/, "");
      lines.push(pad(`${cur}${box} ${it.entry.id} ${(it.type ?? "?").padEnd(3)} ${dl}${violetGlow(db)} ${title}${verdict}`));
    }
    if (vis.length > VISIBLE_ROWS) {
      lines.push(pad(violetGlow(`  ${this.scroll + 1}–${Math.min(vis.length, this.scroll + VISIBLE_ROWS)} z ${vis.length}`)));
    }

    lines.push(pad(""));
    lines.push(pad(violetGlow("mezerník vybrat • a vše neprohlédnuté • Tab typ • Enter spustit agenta • Esc zavřít")));
    lines.push(rule("╰", "╯"));
    return lines;
  }

  invalidate(): void {}
}
