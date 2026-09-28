---
type: Todo
title: "Fix record_spai_item index clobbering on concurrent calls: four parallel record_spai_item calls against a project with an empty docs/spai/ all returned SPAI-001 and the last write won, leaving four files named SPAI-001-*.md and an .index.json holding only one record. Reproduced 2026-09-28 while seeding the pi-devs-psychologist backlog; repaired by hand (renumbered 001-004, index rebuilt, tool then read all four correctly). Needs an atomic read-modify-write or a lock around the index"
timestamp: 2026-09-28 17:27:30
status: todo
source: pi-spai
tags: [bug, concurrency]
facets:
  priority: high
  project: pi-spai
  project_path: D:/01_programovani/pi/plugins/pi-spai
spai_symbol: '.'
---

# SPAI-002: Fix record_spai_item index clobbering on concurrent calls: four parallel record_spai_item calls against a project with an empty docs/spai/ all returned SPAI-001 and the last write won, leaving four files named SPAI-001-*.md and an .index.json holding only one record. Reproduced 2026-09-28 while seeding the pi-devs-psychologist backlog; repaired by hand (renumbered 001-004, index rebuilt, tool then read all four correctly). Needs an atomic read-modify-write or a lock around the index

. Fix record_spai_item index clobbering on concurrent calls: four parallel record_spai_item calls against a project with an empty docs/spai/ all returned SPAI-001 and the last write won, leaving four files named SPAI-001-*.md and an .index.json holding only one record. Reproduced 2026-09-28 while seeding the pi-devs-psychologist backlog; repaired by hand (renumbered 001-004, index rebuilt, tool then read all four correctly). Needs an atomic read-modify-write or a lock around the index @pi-spai !high :bug:concurrency:
