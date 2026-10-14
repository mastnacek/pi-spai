---
type: Todo
title: "Fix the docs/spai/.index.json going stale when a ledger file is edited directly: in pi-devs-psychologist the index still lists SPAI-012 as todo and omits SPAI-013/014 entirely, while their .md files are correct (status/symbol updated by hand). The index is only rewritten by the pi-spai tools (record_spai_item / saveRecord / updateRecordStatus), so any hand-edit or git pull of a ledger file leaves the index wrong, and search_spai_items / the Kanban read the index — so a done item can keep showing as todo. Needs: a reconcile path (rebuild the index from the .md files on session start, or a check that flags drift) plus a test asserting the index matches the files. Found 2026-09-29 while closing plan 0.4"
timestamp: 2026-09-29 08:17:57
status: done
source: pi-spai
tags: [bug, index-drift]
facets:
  priority: high
  project: pi-spai
  project_path: D:/01_programovani/pi/plugins/pi-spai
spai_symbol: 'x'
---

# SPAI-004: Fix the docs/spai/.index.json going stale when a ledger file is edited directly: in pi-devs-psychologist the index still lists SPAI-012 as todo and omits SPAI-013/014 entirely, while their .md files are correct (status/symbol updated by hand). The index is only rewritten by the pi-spai tools (record_spai_item / saveRecord / updateRecordStatus), so any hand-edit or git pull of a ledger file leaves the index wrong, and search_spai_items / the Kanban read the index — so a done item can keep showing as todo. Needs: a reconcile path (rebuild the index from the .md files on session start, or a check that flags drift) plus a test asserting the index matches the files. Found 2026-09-29 while closing plan 0.4

x Fix the docs/spai/.index.json going stale when a ledger file is edited directly: in pi-devs-psychologist the index still lists SPAI-012 as todo and omits SPAI-013/014 entirely, while their .md files are correct (status/symbol updated by hand). The index is only rewritten by the pi-spai tools (record_spai_item / saveRecord / updateRecordStatus), so any hand-edit or git pull of a ledger file leaves the index wrong, and search_spai_items / the Kanban read the index — so a done item can keep showing as todo. Needs: a reconcile path (rebuild the index from the .md files on session start, or a check that flags drift) plus a test asserting the index matches the files. Found 2026-09-29 while closing plan 0.4 @pi-spai !high :bug:index-drift:
