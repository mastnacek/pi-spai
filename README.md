# pi-spai 🧠

> SPAI Task, Idea & Note Ledger extension for the **Pi coding agent** — 100% compatible with **`mozek_rust`**.

```text
docs/spai/
├── 2026-08-27-SPAI-001-*.md    # SPAI Markdown note with YAML frontmatter
└── 2026-08-27-SPAI-002-*.md
```

`pi-spai` brings the fast, zero-friction **SPAI note-taking and task syntax** from `mozek_rust` directly into the Pi coding agent. It allows capturing tasks, ideas, notes, and project backlogs with single-character prefixes directly within project repositories.

---

## ⚡ SPAI Syntax Reference

The first non-empty line determines the **type** and **status** of the item:

| Prefix | Marker | Type | Status | Icon | Description |
| --- | --- | --- | --- | --- | --- |
| `.` | `.` | `Todo` | `todo` | `○` | Open task / Action item |
| `/` | `/` | `Todo` | `working` | `◐` | Task in progress |
| `/.` | `/.` | `Todo` | `waiting` | `⏳` | Blocked / Waiting on external dependency |
| `x` / `X` | `x` | `Todo` | `done` | `✓` | Completed task |
| `z` / `Z` | `z` | `Todo` | `cancelled` | `✗` | Cancelled task |
| `?` | `?` | `Idea` | `idea` | `💡` | Idea / Proposal / Question |
| `-` | `-` | `Note` | `note` | `•` | Technical note / Constraint / Fact |

### 🏷️ Inline Metadata

- **Priority:** Prefix with `!` to set priority to `high` (e.g. `! . Critical fix`).
- **Deadline:** Tag with `@YYYY-MM-DD` or `@DD.MM.` (e.g. `. Release v1.0 @2026-09-01`).
- **Chained Tags:** Use `:tag1:tag2:` anywhere in text (e.g. `. Fix IPC bridge :ipc:bug:windows:`).

---

## 🕹️ Command Surface & Agent Tools

### User Commands (`/spai`)

| Command | Description |
| --- | --- |
| `/spai list [filter]` | Interactive TUI Kanban & directory explorer (`all`, `todo`, `working`, `waiting`, `done`, `idea`, `note`). |
| `/spai new <text>` | Fast capture of a new SPAI task, idea, or note. |
| `/spai show <id> [--raw]` | View item in clean Reading Mode with colored SPAI glyphs. |
| `/spai toggle <id>` | Cycle item status (`todo` ➔ `working` ➔ `done` ➔ `cancelled`). |
| `/spai search <query>` | Fast search across tasks, ideas, tags, and notes. |
| `/spai status` | Report active SPAI counts and storage metrics. |
| `/spai help` | Complete command and SPAI syntax reference in Czech. |

### Autonomous Agent Tools (`LLM-Callable`)

- `record_spai_item({ text, project?, force? })` — Records a task, idea or note through the `spai` binary. A similar record stops the write and returns the candidates; `force` only on the user's explicit wish.
- `similar_spai_items({ text })` — Finds duplicates and related records; writes nothing.
- `update_spai_status({ id, status })` — Changes the status through `spai set`.
- `search_spai_items({ query, status? })` — Allows the agent to query the project task backlog.

---

## 🔧 Requires the `spai` binary

pi-spai only **reads** `docs/spai/`. Records are written and their status is changed by the
`spai` CLI (ids, English storage, Czech `title_cs`, vectors, duplicate check). It is found via
`SPAI_BIN`, `PATH`, then `~/.cargo/bin`; without it the writing tools fail with
"spai nenalezen — `cargo install --path cli` v repu spai nebo SPAI_BIN". Lists, board and
viewer show `title_cs` when a record has one.

---

## 📦 Installation & Usage

```bash
pi install git:github.com/mastnacek/pi-spai
```

Or for single-session trial:

```bash
pi -e git:github.com/mastnacek/pi-spai
```
