---
type: Todo
title: "Fix record_spai_item index clobbering on concurrent calls: four parallel record_spai_item calls against a project with an empty docs/spai/ all returned SPAI-001 and the last write won, leaving four files named SPAI-001-*.md and an .index.json holding only one record. Reproduced 2026-09-28 while seeding the pi-devs-psychologist backlog; repaired by hand (renumbered 001-004, index rebuilt, tool then read all four correctly). Needs an atomic read-modify-write or a lock around the index"
timestamp: 2026-09-28 17:27:30
status: done
source: pi-spai
tags: [bug, concurrency]
facets:
  priority: high
  project: pi-spai
  project_path: D:/01_programovani/pi/plugins/pi-spai
spai_symbol: 'x'
---

# SPAI-002: Fix record_spai_item index clobbering on concurrent calls: four parallel record_spai_item calls against a project with an empty docs/spai/ all returned SPAI-001 and the last write won, leaving four files named SPAI-001-*.md and an .index.json holding only one record. Reproduced 2026-09-28 while seeding the pi-devs-psychologist backlog; repaired by hand (renumbered 001-004, index rebuilt, tool then read all four correctly). Needs an atomic read-modify-write or a lock around the index

x Fix record_spai_item index clobbering on concurrent calls: four parallel record_spai_item calls against a project with an empty docs/spai/ all returned SPAI-001 and the last write won, leaving four files named SPAI-001-*.md and an .index.json holding only one record. Reproduced 2026-09-28 while seeding the pi-devs-psychologist backlog; repaired by hand (renumbered 001-004, index rebuilt, tool then read all four correctly). Needs an atomic read-modify-write or a lock around the index @pi-spai !high :bug:concurrency:

**Fixed:** `saveRecord` and `updateRecordStatus` now run their whole index read-modify-write plus file write inside a per-directory in-process async mutex (`withDirLock`, 5 s timeout throwing `SpaiLockTimeoutError`), re-reading the index under the lock, so concurrent calls get distinct ids and one consistent index.
