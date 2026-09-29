---
type: Todo
title: "Fix update_spai_status updating the WRONG record when the id exists in several project backlogs: updateRecordStatus (src/storage.ts:196) resolves the id against the current cwd's docs/spai only (readRecord), then writes to record.projectPath. A bare id like \"SPAI-013\" was meant for pi-devs-psychologist (its own docs/spai/) but matched the monorepo root docs/spai/2026-09-25-SPAI-013-* and changed THAT item (done -> working). Reverted by hand with git checkout; the tool reported success. Fix: make the project part of the lookup, detect id collisions across discovered projects, and either refuse with the list of matches or require a project parameter. Reproduced 2026-09-28 while closing plan 0.4 SPAI items"
timestamp: 2026-09-29 06:49:13
status: done
source: pi-spai
tags: [bug, id-collision]
facets:
  priority: high
  project: pi-spai
  project_path: D:/01_programovani/pi/plugins/pi-spai
spai_symbol: 'x'
---

# SPAI-003: Fix update_spai_status updating the WRONG record when the id exists in several project backlogs: updateRecordStatus (src/storage.ts:196) resolves the id against the current cwd's docs/spai only (readRecord), then writes to record.projectPath. A bare id like "SPAI-013" was meant for pi-devs-psychologist (its own docs/spai/) but matched the monorepo root docs/spai/2026-09-25-SPAI-013-* and changed THAT item (done -> working). Reverted by hand with git checkout; the tool reported success. Fix: make the project part of the lookup, detect id collisions across discovered projects, and either refuse with the list of matches or require a project parameter. Reproduced 2026-09-28 while closing plan 0.4 SPAI items

x Fix update_spai_status updating the WRONG record when the id exists in several project backlogs: updateRecordStatus (src/storage.ts:196) resolves the id against the current cwd's docs/spai only (readRecord), then writes to record.projectPath. A bare id like "SPAI-013" was meant for pi-devs-psychologist (its own docs/spai/) but matched the monorepo root docs/spai/2026-09-25-SPAI-013-* and changed THAT item (done -> working). Reverted by hand with git checkout; the tool reported success. Fix: make the project part of the lookup, detect id collisions across discovered projects, and either refuse with the list of matches or require a project parameter. Reproduced 2026-09-28 while closing plan 0.4 SPAI items @pi-spai !high :bug:id-collision:

**Fixed:** a bare id is resolved across the projects inside the current git worktree (`findWorktreeRoot` + ancestor walk + sibling-backlog scan), never across the global pi-projects list — the first cut used `discoverAllProjects`, which scans every configured project on the drive (measured: ~200 on this machine, missing the two that mattered);; 0 matches → not-found, 1 → unchanged behaviour, ≥2 → `SpaiIdCollisionError` naming every candidate and demanding `id @<project>` or a file path. Project-qualified ids and exact file paths are honoured, and `searchRecords` now honours the project filter for an exact id.
