---
name: spai-tasks
description: "Compose SPAI syntax and manage SPAI task/idea/note lifecycle (todo -> working -> done) in project docs/spai/ backlogs. Use whenever you capture, write, search, or change the status of an SPAI item — including deadlines (@2026-09-15), a step plan (`## Plán` checklist), solving a Notes-database task, inline @project, !priority, and :tag1:tag2: metadata, or when you must verify which project's backlog an item landed in."
---

# SPAI Task & Project Lifecycle

SPAI items live in `<project>/docs/spai/` as one markdown file per item, plus a
`.index.json`. The item's first non-empty line is parsed for its **prefix**; inline
metadata (`@project`, `!priority`, `@deadline`, `:tags:`) is parsed from the whole
text. The record's own markdown layout is documented in
`references/syntax.md`.

Three tools create items and change their status. Body text such as the proposal or the plan is a plain file edit (§7, §10–11).

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

**Status goes through the tool, body text may be edited.** The index heals itself:
any `.md` newer than `.index.json` triggers a rebuild on the next read (SPAI-004).
So editing the body — writing `## Návrh řešení`, the `## Plán` checklist, ticking
`- [x]` — is a plain file edit. Change the **status** only through
`update_spai_status`, because it rewrites the frontmatter, the first-line prefix
and the index consistently.

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

## 10. Steps — the `## Plán` checklist

An item's steps are a markdown checklist under a `## Plán` heading, edited
directly in the item's file:

```
## Plán
- [x] (S) Ověřit, že chyba v aktuální verzi pořád nastává
- [ ] (M) Opravit podmínku v `Code/Agents/Notifikace.lss`
```

Only `- [ ]` / `- [x]` lines between `## Plán` (also `## Plan`, `## Kroky`) and
the next `## ` heading count. Lines elsewhere in the body never become steps. The
index keeps the progress, and `/spai list` and the board show it as `[1/2]`. Tick a
step by editing `- [ ]` to `- [x]` as soon as it is finished and verified, not in
a batch at the end.

---

## 11. Solving a Notes-database task

Items exported from Lotus Notes carry `database_path` in their frontmatter: the
local ODP folder of the database the request is about. When the user asks you
to solve, analyse or plan such an item ("vyřeš SPAI-024"), do this:

1. **Read the item**: the whole file, including the forwarded mail.
   Pull out the **symptom** (what the user sees), **who/where** (form, view,
   button, agent, field names quoted in the text), and **when** it happens.
   The `notes_form` facet is the helpdesk request type (ZOP, ZN, SP, IN),
   not the broken element. The subject is what the text names, for example
   „Form: Incident“ inside a ZOP.
2. **Decide if it still applies.** Many items are years old. Check whether the
   form, field or agent mentioned still exists in `database_path` and whether
   the code already handles the case. If the problem is gone or obsolete, say
   so with evidence and propose closing it in Notes. Do not invent work.
3. **Investigate the code** in `database_path`. Grep for the field and element
   names from step 1 across `Forms/*.dxl`, `SharedElements/`, `Views/`,
   `Code/Agents/` and `Code/ScriptLibraries/`. `AppProperties/*.csv`
   (`acl.csv`, `agents.csv`, …) can help but may be empty. Fields and events
   often come from a subform: follow every `<subformref name='…'/>` into
   `SharedElements/Subforms/`. Follow the call path to the line
   that produces the symptom. Every claim about the cause must cite
   `file:line`. If you cannot find it, write what you checked and what
   information is missing — a named gap beats a guessed cause.
   **Verify before you blame.** A cause that rests on how an @function,
   LotusScript method or DXL attribute behaves must be checked against the
   documentation (`kb_search` in the `lotus-notes` collection, or the
   `lotus-script` skill) — list arguments, empty values and case-sensitivity
   especially. Code that merely differs from a similar form is not a bug until
   you show the difference changes the result. Run the failing case through
   the formula with concrete values (an empty field, two names, the reader's
   name) and write that trace down.
4. **Write the proposal** into the item file. Replace these two sections if they
   exist; never duplicate them. Write them in Czech:

   ```
   ## Návrh řešení
   **Verdikt:** zastaralé | rychlovka | práce
   **Skripty:** <links to paste-ready .lss in databaze/<db>/01_scripts/, if any>
   **Příčina:** <one or two sentences, with `file:line`>
   **Řešení:** <what changes where, and why it fixes the symptom>
   **Jistota:** ověřeno | pravděpodobné | hypotéza — <what confirms it, or what would>
   **Složitost:** S | M | L — <one line why>
   **Otevřené otázky:** <what only the user or the requester can answer, or „žádné“>

   ## Plán
   - [ ] (S) …
   - [ ] (M) …
   ```

5. **Order the plan by complexity, but dependencies win.**
   - A step that needs another step's result comes after it. Logical order
     beats everything else.
   - Among steps that do not depend on each other: simplest and cheapest first,
     then rising complexity. Confirming and reproducing the problem is usually
     the first step, the risky change comes late, and testing comes last.
   - Mark each step with its own size: `(S)` minutes, a local change; `(M)` one
     element or a careful edit; `(L)` several elements, a data or ACL change, or
     anything that needs the requester.
   - Each step is one verifiable action that starts with a verb and names the
     element it touches (`Forms/ZOP.dxl`, `Code/Agents/X.lss`). Aim for 3–7
     steps; a step you cannot verify is too vague, split or sharpen it.
   - A plan that is all `(L)` means the problem is not understood yet. Add an
     earlier `(S)`/`(M)` investigation step that would shrink it.
   - When the certainty is not `ověřeno`, the first step reproduces or confirms
     the cause. Never put the fix before it.
6. **Do not change the database code while proposing.** The proposal is for the
   user to approve. Give LotusScript changes as `.lss` snippets ready to paste
   into Designer. Leave the item's status alone. Notes items close themselves:
   the Notes export agent marks them done when the request is resolved in Notes.
   **Verdikt** sorts the item for triage: `zastaralé` = already fixed or no
   longer applies (give the evidence and the text to close it with in Notes);
   `rychlovka` = 1–3 `(S)` steps; `práce` = real analysis and a plan. ZOP items
   are the parking lot of IN/SP requests that never burned, so expect many
   `zastaralé` there — but only with evidence.
7. **Then report** in the chat: three or four lines with the cause, the
   complexity, the first step, and the open questions.

`/spai review` opens a picker of open Notes items (IN → SP → ZN → ZOP, oldest
first; reviewed ones show their verdict). The user ticks items, and Enter starts
a pi agent in a new herdr pane with a brief to run this procedure on them. When
a fix is concrete LotusScript, that agent also writes a paste-ready
`databaze/<db>/01_scripts/SPAI-NNN-<name>.lss`, checks it with the
lotusscript-modular tools, and links it from `## Návrh řešení` as `**Skripty:**`.

When the user later asks you to carry out the plan, work the steps top-down and
tick each one (§10) as you finish it.

---

For a detailed parser contract (exact character classes, normalizations,
tolerance, and the on-disk frontmatter layout), read `references/syntax.md`. For
resolution internals and how to target another project, read
`references/projects.md`.
