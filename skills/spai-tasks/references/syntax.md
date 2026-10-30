# SPAI syntax — exact parser contract

Source of truth: `src/spai.ts` (`extractInlineTags`, `extractPriority`,
`extractDeadline`, `extractProject`, `parseInlineMeta`, `parseSubtasks`,
`SPAI_PREFIXES`) with tests in `test/spai.test.ts`. When this document and the
code disagree, the code wins — fix this file.

## Order of extraction (first match per category)

`parseInlineMeta` runs the extractors in this order and each removes its token
from the working text before the next one sees it:

1. **project** — `@name`, `@"name"`, `@path`
2. **deadline** — `@YYYY-MM-DD`, `@DD.MM.`, `@DD.MM.YYYY`
3. **priority** — `!`, `!high`, `!low`, `!medium`
4. **tags** — all `:tag:` blocks, accumulated

Consequence: `@project` wins over a deadline for the same `@` token when the token
is name-like; a date-shaped token is skipped by the project extractor and read by
the deadline extractor instead. Only the first priority/project/deadline match is
consumed; **all** tag blocks are consumed.

## Tags

```regex
/(?:^|\s):([A-Za-z0-9_./-]+(?::[A-Za-z0-9_./-]+)*):(?=\s|$)/g
```

- A block must begin at line start or after whitespace, and end at line end or
  before whitespace (the trailing boundary is a **lookahead**, not consumed, so
  `:bl: :email: :okruhy:` yields three tags).
- Character class inside a tag: `A-Za-z0-9`, `_`, `.`, `/`, `-`. No spaces, no
  diacritics, no `#`.
- The captured group is split on `:`; each part becomes a tag; duplicates are
  dropped. `:api:auth:key:` is one block of three tags, not one tag.
- Tag blocks are replaced by a single space in the cleaned text, so tags never
  leak into the stored title.

## Priority

```regex
/(?:^|\s)!(high|low|medium)?(?:\s|$)/i
```

- Bare `!` → `high`; `!low` → `low`; `!medium` → `medium`; unknown suffix
  (`!urgent`) does not match at all and stays as literal text.
- Case-insensitive. The whole match is removed from the cleaned text.
- `!!!` does not match: after the first `!` the regex requires whitespace or end.

## Deadline

```regex
/(?:^|\s)@(?:(\d{4}-\d{2}-\d{2})|(\d{1,2}\.\d{1,2}\.(?:\d{4})?))(?:\s|$)/
```

- `@2026-09-15` → `2026-09-15` verbatim.
- `@15.09.2026` → normalized `2026-09-15` (day/month zero-padded).
- `@15.09.` → normalized `<current year>-09-15`; the year is captured at parse
  time, so the same text means different dates in different years.
- A trailing dot is required in the dotted form: `@15.9` (no final dot) is not a
  deadline.
- Stored in `facets.deadline` as `YYYY-MM-DD`. There is no reminder engine.

## Project token

```regex
/(?:^|\s)@(?:"([^"\n]+)"|([a-zA-Z0-9_./:\\-]+))(?:\s|$)/
```

- Quoted form allows spaces: `@"my project"`.
- Unquoted form permits `A-Za-z0-9`, `_`, `.`, `/`, `:`, `\`, `-` — so Windows
  paths work; **diacritics and spaces require quoting**.
- Tokens matching `^\d{4}-\d{2}-\d{2}$` or `^\d{1,2}\.\d{1,2}\.(?:\d{4})?$` are
  skipped (they belong to the deadline extractor).
- The token is then handed to `resolveProjectFromIdentifier`; see
  `projects.md`.

## Prefixes

Precedence matters — the table is scanned in order and `/. ` must be tested
before `/ `:

| # | Prefix | marker | symbol | type | status |
| --- | --- | --- | --- | --- | --- |
| 1 | `/. ` | `/.` | `/.` | Todo | waiting |
| 2 | `. ` | `.` | `.` | Todo | todo |
| 3 | `/ ` | `/` | `/` | Todo | working |
| 4 | `x ` | `x` | `x` | Todo | done |
| 5 | `X ` | `X` | `x` | Todo | done |
| 6 | `z ` | `z` | `z` | Todo | cancelled |
| 7 | `Z ` | `Z` | `z` | Todo | cancelled |
| 8 | `- ` | `-` | `-` | Note | note |
| 9 | `? ` | `?` | `?` | Idea | idea |
| 10 | `# ` | `#` | *(empty)* | Note | inbox |

## Tolerance and degenerate inputs

- The prefix is matched on the **first non-empty line** — leading blank lines are
  skipped.
- Leading metadata before the prefix is stripped first, so `@pi-spai . Fix bug`
  still parses as a Todo. This is tolerance, not a style: always write the prefix
  first.
- If no prefix matches, type falls back to `Note` and status to `note` (`todo`
  for a manually supplied Todo type).
- Empty or whitespace-only text → title `Prázdná poznámka`, status `inbox`.
- A title that becomes empty after metadata removal → `Nová položka`.
- A first line that is a markdown heading (`# Something`) is cleaned to
  `Something` and captured as an inbox note.

## Subtask detection

Subtasks are the markdown checklist of the item's plan section: a `## Plán`,
`## Plan` or `## Kroky` heading (case-insensitive) opens it, the next `## `
heading ends it. Inside it, `- [ ] text` is open and `- [x] text` / `- [X] text`
is done (`*` works as the bullet too, indentation is allowed). Nothing outside
that section counts — Notes-exported items carry forwarded mail whose lines may
look like prefixes or checkboxes. Each subtask records its `lineIndex`, `done`
and its text. Subtasks have no ids; the index stores only their progress as
`steps: { done, total }`, shown as a `[done/total]` badge in `/spai list` and
the board.

## On-disk layout

`docs/spai/<YYYY-MM-DD>-<SPAI-NNN>-<slug>.md`:

```markdown
---
type: Todo
title: "Fix IPC bridge timeout"
timestamp: 2026-10-14 11:30:08
status: done
source: pi-spai
tags: [ipc, bug]
facets:
  priority: high
  deadline: 2026-09-15
  project: pi-spai
  project_path: D:/01_programovani/pi/plugins/pi-spai
spai_symbol: 'x'
---

# SPAI-035: Fix IPC bridge timeout

x Fix IPC bridge timeout @pi-spai !high @2026-09-15 :ipc:bug:
```

- `title` is the cleaned title with quotes escaped; the body keeps the **raw**
  original text (metadata tokens included).
- `facets.project_path` is the **actual directory written to** — the field to
  check when a project token did not resolve (see `projects.md`).
- `spai_symbol` is empty for `# ` captures, so the key is simply omitted.
- `.index.json` in the same directory is a derived cache of all items. It is
  rebuilt by tool-driven writes; a hand edit desynchronizes it (SPAI-004).
