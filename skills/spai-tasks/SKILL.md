---
name: spai-tasks
description: Compose SPAI syntax and manage SPAI task/idea/note lifecycle (todo -> working -> done) in project docs/spai/ backlogs. Use whenever you capture, write, search, or change the status of an SPAI item — especially when you must write inline `@project`, `!priority`, or `:tag1:tag2:` metadata.
---

# SPAI Task & Project Lifecycle

SPAI items live in `<project>/docs/spai/` as markdown files plus a `.index.json`.
The item's first line is parsed for its **prefix**, and inline metadata
(`@project`, `!priority`, `@deadline`, `:tags:`) is parsed from the whole text.

## 1. Line anatomy

```
<prefix> <text> @<project> !<priority> @<deadline> :tag1:tag2:
```

Real, fully-formed example:

```
. Fix IPC bridge timeout @pi-spai !high @2026-09-15 :ipc:bug:windows:
```

Rules that always apply:

- The **prefix is the first token and must be followed by a space** (see §5).
- Every metadata token is **whitespace-delimited**. `.fix @project` (no space after `.`) is not a Todo.
- The parser takes the **first match per category** — never write two `@project` or two `!` tokens.

---

## 2. Tags — `:tag1:tag2:tag3:` (most common mistake)

A tag block is a run of colon-wrapped tags. All of these are equivalent and valid:

```
:ipc:bug:windows:         <- chained (compact)
:ipc: :bug: :windows:     <- space-separated (also fine)
:bug:                     <- single tag
```

**Parser requirements (violating any of these silently drops the tag):**

| Rule | Correct | Wrong |
| --- | --- | --- |
| Tag block must start at line start or after whitespace | `text :bug:` | `text:bug:` (glued to the word) |
| Tag block must end at line end or before whitespace | `:bug: text` | `:bug:text` |
| Allowed characters inside a tag: `A-Za-z0-9` plus `. _ / -` | `:fix-bug_2:` | `:fix bug:`, `:příliš:` (diacritics) |
| Tag is wrapped in a single leading and trailing `:` | `:bl:` `:email:` `:okruhy:` | `#bl`, `[bl]`, `bl:` |
| No nesting of `:` inside a tag name | `:api:auth:` (two tags) | `:api:auth:key:` as one tag |

Conventions:

- **Lowercase ASCII**, no diacritics, no spaces — exactly like `:bl: :email: :okruhy:`.
- Put the tag block at the **end of the text**, after a space.
- Tags are stored in frontmatter as `tags: [ipc, bug, windows]` — reusable by `search_spai_items`.
- Never invent `#hashtag`, `tags: a, b`, `[tag]`, or `@tag` syntax — only `:tag:` blocks are parsed.

---

## 3. Project binding — always write `@<project>`

**Before every `record_spai_item` call, determine which project the current
working directory belongs to and write it as `@<project-name>` in the text.**

How to determine it:

1. cwd is inside a project repo → use the **project root folder name**:
   `D:/01_programovani/pi/plugins/pi-spai` → `@pi-spai`.
2. cwd is a workspace/monorepo root → use the **subproject folder name the work
   belongs to** (`@pi-spai`), never the container folder (`@plugins`).
3. Name contains spaces → quoted form: `@"my project"`.
4. An absolute path also resolves (`@D:/01_programovani/pi/plugins/pi-spai`), but
   prefer the plain name — paths are noisy in the recorded body.

Why it matters: `@<project>` is resolved against the project registry and the
record is **written into that project's `docs/spai/`** (and its `.index.json`).
Without it, the record falls back to `cwd` and the project is guessed from
`basename(cwd)`, so a note captured in a monorepo root lands in the wrong place.

Also pass the same value in the `project` argument so the inline text and the
tool parameter agree.

`@` is overloaded — dates are skipped by the project parser:

- `@2026-09-15`, `@15.09.` → **deadline** (never a project).
- `@pi-spai`, `@"my project"`, `@D:/path` → **project**.

Name must match a real project folder (cwd itself, a monorepo subproject, or an
entry in the project registry). An unmatched name does not fail — it is stored
verbatim as the label while the record silently stays in cwd. When in doubt, pass
the absolute project path as the token instead.

---

## 4. Priority — SPAI has exactly three levels

| You write | Stored as | Meaning |
| --- | --- | --- |
| `!` or `!high` | `priority: high` | Critical / blocking |
| `!medium` | `priority: medium` | Normal, above default |
| `!low` | `priority: low` | Nice to have |

- Bare `!` means **high**.
- Must be a standalone whitespace-delimited token: `fix bug !` ✅, `fix!` ❌.
- Case-insensitive (`!HIGH` parses) but always write lowercase.
- `!!!`, `P1`, `critical`, `[high]`, `priority:high` are **not** parsed — do not use them.

---

## 5. Status prefixes (first line marker)

| Prefix | Type | Status | Symbol | Meaning |
| --- | --- | --- | --- | --- |
| `. ` | Todo | `todo` | `.` | Open task |
| `/ ` | Todo | `working` | `/` | In progress |
| `/. ` | Todo | `waiting` | `/.` | Blocked / waiting on dependency |
| `x ` | Todo | `done` | `x` | Completed |
| `z ` | Todo | `cancelled` | `z` | Cancelled |
| `? ` | Idea | `idea` | `?` | Idea / proposal |
| `- ` | Note | `note` | `-` | Fact / discovery |
| `# ` | Note | `inbox` | — | Title-only inbox capture |

Uppercase `X ` and `Z ` are accepted aliases for `x ` / `z `.
**The trailing space is mandatory** — `.task` or `- note` without the space after
the marker does not parse.

---

## 6. Composing a record

Canonical call:

```json
record_spai_item({
  "text": ". Fix IPC bridge timeout @pi-spai !high :ipc:bug:windows:",
  "project": "pi-spai"
})
```

More examples:

```json
record_spai_item({
  "text": "? Cache SPAI index in memory @pi-spai :performance:idea:",
  "project": "pi-spai"
})
```

```json
record_spai_item({
  "text": "- Document the @-token rules @pi-spai :docs:",
  "project": "pi-spai"
})
```

Incorrect — and why:

```
".fix bug @pi-spai :ipc:bug:"   -> missing space after prefix; not a Todo
". fix bug @pi-spai #ipc"       -> #hashtag is not a tag; tag lost
". fix bug @pi-spai ipc:"       -> no leading colon; tag lost
". fix bug !!!"                 -> not a priority token; priority lost
". fix bug"                     -> no project binding; lands in cwd guess
```

**Pre-flight check before every record:**

1. Prefix present, followed by a space?
2. `@<current-project>` present, matching the `project` argument?
3. Priority token if urgency was stated (bare `!` = high)?
4. Tags in `:tag:` form, whitespace-delimited, lowercase, ASCII-only?
5. No second `@project` or `!` token later in the text?

---

## 7. Lifecycle transitions

**Start of work** — `todo` → `working`:

```json
update_spai_status({ "id": "SPAI-001", "status": "working" })
```

**Blocked** — waiting on user, external system, or dependency:

```json
update_spai_status({ "id": "SPAI-001", "status": "waiting" })
```

**Completion** — only after code is written, verified, and tests pass:

```json
update_spai_status({ "id": "SPAI-001", "status": "done" })
```

Updates are atomic: markdown file, `.index.json`, kanban board and status bar all
refresh immediately.

## 8. Finding items

```json
search_spai_items({ "query": "autocompletion", "project": "pi-spai", "status": "todo" })
```

`query` matches title, body and tags — searching `ipc` finds items tagged `:ipc:`.
Pass `project` whenever the item belongs to another project than cwd.