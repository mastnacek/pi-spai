---
name: spai-tasks
description: Manage, track, and update SPAI task lifecycle (todo -> working -> done) for projects. Use when working on project tasks, changing SPAI task status, or capturing tasks bound to projects.
---

# SPAI Task & Project Lifecycle Management

Guidance for managing SPAI tasks, tracking progress, and transitioning status during agent work.

## Core Rules & Principles

1. **Project Binding via `@`**:
   - Tasks bound to a project contain `@<project-name>` (or `@"project with spaces"`).
   - In YAML frontmatter, this is stored under `facets.project` (e.g. `project: herdr` or `project: pi-spai`).
   - The `@<project>` token is distinct from deadlines (`@YYYY-MM-DD` or `@DD.MM.`).

2. **Autonomous Task Lifecycle Transition**:
   - **Start of Work**: When beginning work on an assigned or recognized task, update its status from `todo` to `working`:
     ```json
     update_spai_status({ "id": "SPAI-001", "status": "working" })
     ```
   - **Blocked / Waiting**: If waiting for user input, external process, or dependency:
     ```json
     update_spai_status({ "id": "SPAI-001", "status": "waiting" })
     ```
   - **Completion**: Once code is written, verified, and all tests pass:
     ```json
     update_spai_status({ "id": "SPAI-001", "status": "done" })
     ```
   - Status updates are atomic, immediately persist to the task's markdown file, update `.index.json`, and reflect in the Kanban board.

---

## SPAI Syntax Reference

### Status Prefixes (1st line marker)
- `. Úkol` — Todo item (`status: "todo"`, symbol `.`)
- `/ Rozpracovaný úkol` — In-progress item (`status: "working"`, symbol `/`)
- `/. Čekající úkol` — Waiting / blocker (`status: "waiting"`, symbol `/.`)
- `x Hotový úkol` — Completed item (`status: "done"`, symbol `x`)
- `z Zrušený úkol` — Cancelled item (`status: "cancelled"`, symbol `z`)
- `? Nápad` — Concept / proposal (`status: "idea"`, symbol `?`)
- `- Poznámka` — Fact / discovery (`status: "note"`, symbol `-`)

### Inline Metadata
- `@project-name` — Project binding (e.g. `@herdr`, `@pi-spai`)
- `@YYYY-MM-DD` / `@DD.MM.` — Deadline (e.g. `@2026-09-01`, `@15.09.`)
- `!` / `!high` — High priority
- `:tag1:tag2:` — Chained tags (e.g. `:api:auth:`)

---

## Available Tools

### 1. `search_spai_items`
Find tasks by text query, status, or bound project:
```json
search_spai_items({
  "query": "autocompletion",
  "project": "pi-spai",
  "status": "todo"
})
```

### 2. `update_spai_status`
Transition an existing item's status:
```json
update_spai_status({
  "id": "SPAI-009",
  "status": "working"
})
```

### 3. `record_spai_item`
Capture a new task, idea, or note:
```json
record_spai_item({
  "text": ". Implementovat project binding @pi-spai ! :feature:",
  "project": "pi-spai"
})
```
