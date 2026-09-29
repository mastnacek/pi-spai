# Changelog

## Unreleased

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
