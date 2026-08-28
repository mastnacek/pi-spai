# pi-spai 🧠

> SPAI Task, Idea & Note Ledger extension for the **Pi coding agent** — 100% compatible with **`mozek_rust`**.

```text
docs/spai/
├── .index.json                 # Lightweight fast index (status, tags, deadlines)
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

- `record_spai_item({ text })` — Allows the agent to record project tasks and ideas directly into `docs/spai/`.
- `search_spai_items({ query, status? })` — Allows the agent to query the project task backlog.

---

## 📦 Installation & Usage

```bash
pi install git:github.com/mastnacek/pi-spai
```

Or for single-session trial:

```bash
pi -e git:github.com/mastnacek/pi-spai
```
