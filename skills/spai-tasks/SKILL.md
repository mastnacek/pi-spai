---
name: spai-tasks
description: Compose SPAI syntax and manage SPAI task/idea/note lifecycle (todo -> working -> done) in project docs/spai/ backlogs. Use whenever you capture, write, search, or change the status of an SPAI item — including deadlines (@2026-09-15), subtasks (extra prefixed lines), inline @project, !priority, and :tag1:tag2: metadata, or when you must verify which project's backlog an item landed in.
---

# SPAI Task & Project Lifecycle

SPAI items live in `<project>/docs/spai/` as one markdown file per item, plus a
`.index.json`. The item's first non-empty line is parsed for its **prefix**; inline
metadata (`@project`, `!priority`, `@deadline`, `:tags:`) is parsed from the whole
text. The record's own markdown layout is documented in
`references/syntax.md`.

Three tools. Nothing else writes a backlog.

| Tool | Purpose |
| --- | --- |
| `record_spai_item { text, project? }` | Create an item |
| `update_spai_status { id, status }` | Move an item through its lifecycle |
| `search_spai_items { query, status?, project? }` | Find items |

---

## 1. Canonical line

```
<prefix> <text> @<project> !<priority> @<deadline> :tag1:tag2:
```

```
. Fix IPC bridge timeout @pi-spai !high @2026-09-15 :ipc:bug:windows:
```

Rules that always apply:

- **The prefix is the first token and must be followed by a space.** Every
  metadata token is **whitespace-delimited**: `.fix @project` is not a Todo.
- Put **all** metadata on the first line. It is parsed from the whole text, so a
  tag on a later line silently joins the parent item.
- **First match wins per category** — for `@project`, `!priority` and `@deadline`.
  Tags are the exception: every `:tag:` block is collected and de-duplicated.
  Never write two `@project` or two `!` tokens anyway; the second is ignored.
- The parser is tolerant (it skips blank lines and strips leading metadata before
  matching the prefix). Write the canonical form regardless — see
  `references/syntax.md` § Tolerance.

---

### Never write metadata-shaped prose

Metadata is parsed from the **whole text**, including ordinary sentences. Writing
the literal token `@project` inside a description binds the project to a nonexistent
"project", and `!` mid-sentence (e.g. `fix this !` as emphasis) becomes a priority.

- Use angle brackets for placeholders: `@<project>`, `!<priority>`, `:<tag>:`. The
  parser's character classes exclude `<`/`>`, so these are inert.
- Do not use `!` for emphasis, and do not mention a bare `@name` unless it is the
  intended binding.
- This bit a real record: the sentence "an unresolved @project token" produced a
  `facets.project: project` label (the file still landed in cwd, because
  `"project"` resolved to no path — see §3).

---

## 2. Tags — `:tag1:tag2:`

All of these are valid and equivalent:

```
:ipc:bug:windows:         <- chained (compact)
:ipc: :bug: :windows:     <- space-separated
:bug:                     <- single
```

**Parser requirements (violating any silently drops the tag):**

| Rule | Correct | Wrong |
| --- | --- | --- |
| Must start at line start or after whitespace | `text :bug:` | `text:bug:` |
| Must end at line end or before whitespace | `:bug: text` | `:bug:text` |
| Inside a tag: `A-Za-z0-9` plus `. _ / -` | `:fix-bug_2:` | `:fix bug:`, `:příliš:` |
| Wrapped in exactly one leading + trailing `:` | `:bl:` `:email:` | `#bl`, `[bl]`, `bl:` |
| No nesting | `:api:auth:` (two tags) | `:api:auth:key:` (one) |

Conventions: lowercase ASCII, no diacritics, no spaces; tag block at the **end** of
the first line. Tags land in frontmatter as `tags: [ipc, bug, windows]`, which is
what `search_spai_items` matches. Never invent `#hashtag`, `tags: a, b`, `[tag]`
or `@tag`.

---

## 3. Project binding — `@<project>` (read this before recording)

`@<project>` is the only token that decides **which backlog the file lands in** —
but only when it resolves to a directory that exists. Resolution
(`references/projects.md` has the full order):

1. an **exact path or name match** in the available-projects list,
2. `<cwd>/<identifier>` existing as a directory,
3. an **absolute or cwd-relative path** that exists,
4. a path-like suffix match, then a workspace subproject scan,
5. otherwise `{ name }` with **no path** — the token is kept as a *label* and the
   record **silently stays in the cwd backlog**.

Practical consequences:

- cwd is the project repo → `@pi-spai` is exact and safe.
- cwd is a monorepo/workspace root → write the **subproject** folder name
  (`@pi-spai`), never the container (`@plugins`).
- Name has spaces → quote it: `@"my project"`.
- **The tool's `project` argument is only a fallback** (used when the inline token
  is absent). Pass the same value in both so label and location agree.
- Targeting a project that may not be registered? Write the **absolute path**
  (`@D:/01_programovani/pi/plugins/pi-spai`). Step 3 pins the destination
  deterministically; it is noisier, but silence is worse.
- **Unmatched names do not fail.** You get `project: pi-orchestrator` in
  frontmatter with `project_path: <the cwd you were in>` — a misplacement that
  only shows up much later. Verify per §6.

`@` is overloaded; dates are never projects:

- `@2026-09-15`, `@15.09.`, `@15.09.2026` → **deadline**
- `@pi-spai`, `@"my project"`, `@D:/path` → **project**

IDs (`SPAI-NNN`) are unique **per project**, not globally. `SPAI-012` in one
backlog has nothing to do with `SPAI-012` in another — always qualify by project
when talking about an item, and pass `project` when searching outside cwd.

---

## 4. Priority — exactly three levels

| You write | Stored as | Meaning |
| --- | --- | --- |
| `!` or `!high` | `priority: high` | Critical / blocking |
| `!medium` | `priority: medium` | Normal, above default |
| `!low` | `priority: low` | Nice to have |

Bare `!` means **high**. Must be a standalone whitespace-delimited token
(`fix bug !` ✅, `fix!` ❌). Case-insensitive, but write lowercase. `!!!`, `P1`,
`critical`, `[high]`, `priority:high` are **not** parsed.

---

## 5. Status prefixes (first non-empty line)

| Prefix | Type | Status | Symbol | Meaning |
| --- | --- | --- | --- | --- |
| `. ` | Todo | `todo` | `.` | Open task |
| `/ ` | Todo | `working` | `/` | In progress |
| `/. ` | Todo | `waiting` | `/.` | Blocked / waiting |
| `x ` | Todo | `done` | `x` | Completed |
| `z ` | Todo | `cancelled` | `z` | Cancelled |
| `? ` | Idea | `idea` | `?` | Idea / proposal |
| `- ` | Note | `note` | `-` | Fact / discovery |
| `# ` | Note | `inbox` | *(empty)* | Untriaged capture |

- Uppercase `X ` / `Z ` are accepted aliases.
- **The trailing space is mandatory** — `.task` does not parse.
- **`/. ` is a distinct three-character prefix, matched before `/ `.** `/ .` or
  `/..` parses as `/ ` (working), never as waiting.
- Without a recognised prefix, a non-empty line falls back to Note/`note`; a
  blank record becomes title `Prázdná poznámka` with status `inbox`. Never call
  the tool with empty text.
- Promote a `# ` capture by moving it to a real status:
  `update_spai_status { id, status: "todo" }`.

---

## 6. Composing a record

```json
record_spai_item({
  "text": ". Fix IPC bridge timeout @pi-spai !high @2026-09-15 :ipc:bug:windows:",
  "project": "pi-spai"
})
```

```
".fix bug @pi-spai :ipc:bug:"   -> no space after prefix; not a Todo
". fix bug @pi-spai #ipc"       -> #hashtag; tag lost
". fix bug @pi-spai ipc:"       -> no leading colon; tag lost
". fix bug !!!"                 -> not a priority token; priority lost
". fix bug"                     -> no project binding; lands in cwd
```

**Before recording:**

1. Prefix present, followed by a space?
2. `@<project>` present and matching the `project` argument?
3. Priority token if urgency was stated (bare `!` = high)?
4. Tags `:tag:`-shaped, whitespace-delimited, lowercase ASCII?
5. No second `@project` or `!` token?

**After recording — verify the destination.** The tool's response text contains
only the **file name**, not the directory, so a silently unresolved `@project`
is invisible there. Confirm placement by one of:

- pass an absolute path token in the first place (deterministic), or
- read the created file and check `facets.project_path`, or
- `search_spai_items { query: "<title fragment>", project: "<intended>" }` and
  confirm the id comes back.

---

## 7. Lifecycle transitions

```json
update_spai_status({ "id": "SPAI-001", "status": "working" })
update_spai_status({ "id": "SPAI-001", "status": "waiting" })
update_spai_status({ "id": "SPAI-001", "status": "done" })
```

Accepted statuses: `todo`, `working`, `waiting`, `done`, `cancelled`, `idea`,
`note`. Mark `working` when you **start**, `done` only after the work is written,
verified and tests pass. Tool-driven updates refresh the markdown file,
`.index.json`, the kanban board and status bar together.

The `id` may be bare (`SPAI-001`), an **exact file path**, or **project-qualified**
when the same id exists in more than one backlog:

```json
update_spai_status({ "id": "SPAI-013 @pi-uma", "status": "done" })
```

A bare id is resolved against the git worktree; a genuine collision raises an
error instead of silently picking one (`references/projects.md` § ID namespaces).

**Never edit `docs/spai/*.md` by hand.** A manual edit leaves `.index.json` stale
(recorded as SPAI-004 in the pi-spai backlog): search, counts and the board then
disagree with the files. Use the tools; if a hand edit already happened, correct
it through `update_spai_status` or re-record.

---

## 8. Finding items

```json
search_spai_items({ "query": "autocompletion", "project": "pi-spai", "status": "todo" })
```

`query` matches title, body and tags — searching `ipc` finds items tagged `:ipc:`.
`status` accepts the same values as §7 (`todo`, `working`, `waiting`, `done`,
`cancelled`, `idea`, `note`). Pass `project` whenever the item belongs to another
project than cwd, and remember §3: ids are per project.

---

## 9. Deadlines — `@<date>`

| You write | Stored as | Notes |
| --- | --- | --- |
| `@2026-09-15` | `deadline: 2026-09-15` | Canonical form |
| `@15.09.2026` | `deadline: 2026-09-15` | Normalized |
| `@15.09.` | `deadline: <current-year>-09-15` | Year taken at capture time |

Only the **first** deadline token is read. The value lands in
`facets.deadline`; there is no scheduling or reminder engine behind it — it is a
label you must re-check. Prefer the canonical `@YYYY-MM-DD`, and remember `@` is
shared with project binding (§3), so never write a bare number that could read as
a project name.

---

## 10. Subtasks — extra prefixed lines

Every further line that starts with a **Todo-family prefix** (`. `, `/ `, `/. `,
`x `, `z `, `X `, `Z `) becomes a subtask with its own status. `? ` and `- `
lines are not subtasks.

```
. Migrate the IPC bridge @pi-spai :ipc:
  . Extract the socket type
  / Port the retry logic
  x Freeze the protocol
```

Indentation is allowed (the line is matched after `trimStart`). Parent metadata is
parsed from the **whole text**, so keep `@project`, `!priority`, `@deadline` and
`:tags:` on the first line only. Subtasks are stored inside the item's body; they
are not separate ids and do not appear in `.index.json` as items.

For a detailed parser contract (exact character classes, normalizations,
tolerance, and the on-disk frontmatter layout), read `references/syntax.md`. For
resolution internals and how to target another project, read
`references/projects.md`.
