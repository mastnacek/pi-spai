# Changelog

## Unreleased

- feat: `/spai review` preview renders the task as markdown with pi's own
  markdown theme (headings, bold, code, lists, links). → (or `l`) opens a
  reading mode with the whole window for one task: ↑↓ by line, space/PgDn by
  page, `g` top, `x` select, ← / Esc back. Shift+↑↓ scrolls the preview from
  the list. Fix: the position hint used to cover the last line of text, so
  the end of a long task was never visible.
- feat: the `/spai review` picker adapts to the pane width — list and preview
  side by side from 116 columns, stacked (8 list rows over the preview) below;
  the overlay is never wider than the pane. Verdicts are read however the
  agent bolds them (`**Verdikt: x**`, `**Verdikt:** x`, `` `x` ``).
- fix: `update_spai_status` kept only its own frontmatter keys, so on a Notes
  task it dropped `database_path`, `notes_unid` and the rest — the Notes
  export recognises tasks by `notes_unid` and would have exported them again.
  It now patches `status`, `type` and `spai_symbol` in the original
  frontmatter.
- feat: review status flow — the review agent sets `working` when it starts a
  task and `waiting` (waiting for the user) once the proposal is written; pi
  never sets a Notes task `done`. The session-start reminder lists waiting
  tasks first. The `/spai review` picker previews the task text, and the
  launched agent reliably receives the brief (Enter is resent while pi is
  still loading).
- feat: `/spai review` opens a picker of open Notes-database tasks (IN → SP →
  ZN → ZOP, oldest first, earlier verdicts shown). Ticked tasks go to a pi
  agent started in a new herdr pane (fallback: the brief goes to the editor),
  which reviews them with the spai-tasks §11 procedure and lotusscript-modular,
  records a `**Verdikt:**` (zastaralé / rychlovka / práce), and writes
  paste-ready `.lss` fixes to `databaze/<db>/01_scripts/` linked as
  `**Skripty:**`.
- feat: step plans and Notes-database tasks. Steps are a `- [ ]` / `- [x]`
  checklist under `## Plán` (also `## Plan`, `## Kroky`); nothing outside that
  section counts, so forwarded Notes mail no longer turns into phantom subtasks.
  The index stores `steps` and `databasePath` (index version 2, older indexes
  rebuild themselves); `/spai list` and the board show a `[done/total]` badge.
  On session start, pi run inside a task's `database_path` lists that
  database's open tasks oldest first, and the worktree root gets one summary.
  Skill: hand-editing the body is allowed now that the index heals itself;
  new §11 on solving a Notes-database task (verify before you blame, a
  certainty field, and steps ordered by dependency, then complexity).
- docs(skill): rewrite `spai-tasks` against the parser instead of prose. Adds the
  previously undocumented behaviour that mattered in practice: project tokens are
  a *label* rather than a destination when they do not resolve to an existing
  path, and the tool response prints only the file name — so the skill now
  documents the resolution order, the absolute-path override, and a verification
  recipe. Also documents deadlines (`@15.09.` and friends), subtask lines,
  project-qualified ids (`SPAI-013 @pi-uma`), the `# ` inbox capture, the
  `/. `-before-`/ ` precedence, and the never-hand-edit rule (SPAI-004).
  Split into `references/syntax.md` (exact regex contract) and
  `references/projects.md` (resolution internals).

- fix: a bare SPAI id is now resolved across discovered projects; an id present in
  several backlogs throws an error listing every candidate instead of silently
  updating the wrong record (SPAI-003).
- fix: `record_spai_item` and `update_spai_status` now serialize their index
  read-modify-write per directory, so parallel calls get distinct ids and one
  consistent index (SPAI-002).
- fix: an id lookup is bounded by the current git worktree (`findWorktreeRoot`)
  and sibling backlogs are found directly. The first cut reused
  `discoverAllProjects`, which merges the global pi-projects cache: on this
  machine one bare-id lookup scanned ~200 projects across the drive, missed the
  two in the worktree, and `SPAI-001 @projA` could not resolve at all.

## 0.1.4

- Initial public version.
