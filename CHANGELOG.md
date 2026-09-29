# Changelog

## Unreleased

- fix: a bare SPAI id is now resolved across discovered projects; an id present in
  several backlogs throws an error listing every candidate instead of silently
  updating the wrong record (SPAI-003).
- fix: `record_spai_item` and `update_spai_status` now serialize their index
  read-modify-write per directory, so parallel calls get distinct ids and one
  consistent index (SPAI-002).

## 0.1.4

- Initial public version.
