---
type: Note
title: "Id reuse when the index is stale: an untracked/unknown older item (2026-10-05-SPAI-005) was invisible to getNextId, so four new records reused SPAI-005..008 and a bare SPAI-005 lookup now collides. Same root cause as SPAI-004 (derived index out of sync) with a worse symptom: duplicate ids instead of stale counts. Consider seeding next-id from the directory listing, not only from .index.json"
timestamp: 2026-10-14 12:38:05
status: done
source: pi-spai
tags: [ids, index, bug]
facets:
  priority: medium
  project: pi-spai
  project_path: D:/01_programovani/pi/plugins/pi-spai
spai_symbol: 'x'
---

# SPAI-009: Id reuse when the index is stale: an untracked/unknown older item (2026-10-05-SPAI-005) was invisible to getNextId, so four new records reused SPAI-005..008 and a bare SPAI-005 lookup now collides. Same root cause as SPAI-004 (derived index out of sync) with a worse symptom: duplicate ids instead of stale counts. Consider seeding next-id from the directory listing, not only from .index.json

x Id reuse when the index is stale: an untracked/unknown older item (2026-10-05-SPAI-005) was invisible to getNextId, so four new records reused SPAI-005..008 and a bare SPAI-005 lookup now collides. Same root cause as SPAI-004 (derived index out of sync) with a worse symptom: duplicate ids instead of stale counts. Consider seeding next-id from the directory listing, not only from .index.json @D:/01_programovani/pi/plugins/pi-spai !medium :ids:index:bug:
