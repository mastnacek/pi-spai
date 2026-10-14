# SPAI project resolution and id namespaces

Source of truth: `src/projects.ts` (`loadAvailableProjects`,
`resolveProjectFromIdentifier`), `src/storage.ts` (`saveRecord`),
`src/storage-resolve.ts` (`resolveRecordTarget`, `SpaiIdCollisionError`).

## What decides where a record is written

`saveRecord(cwd, text, dirOverride?, projectHint?)`, in this order:

1. The inline `@token` is parsed first and **wins** — `projectName` and
   `projectPath` come from it.
2. The tool's `project` argument is a **fallback**: it is resolved only for the
   fields the inline token left empty. (So passing only `project` also works, but
   the inline token overrides it when both are present.)
3. The destination is the resolved path **only if it exists**:
   `targetCwd = projectPath` when `existsSync(projectPath)`.
4. Otherwise the record is written to **cwd** — while `facets.project` keeps the
   unresolved name as a label. `facets.project_path` records the directory that
   was actually used, so the two fields disagree exactly when resolution failed.

This is the single most dangerous behaviour in SPAI: an unresolved project token
does not error, does not warn, and the tool's response prints only the file
**name**, not the directory.

## The available-projects list

`loadAvailableProjects()` builds (and caches) the list the resolver matches
against, from:

1. `scanWorkspaceSubprojects(cwd)` — monorepo/workspace subprojects of the
   current working directory,
2. `pi-projects-cache.json` — the scan cache produced by the pi-projects tooling,
3. `pi-projects.json` → `manualProjects` — hand-pinned projects (plus a
   `pinnedPaths` set used for display),
4. if the list would otherwise be empty: cwd plus its parent directory's
   non-hidden siblings.

The list is cached per session and invalidated on tool-driven writes, so a project
registered during a session may not be visible to an already-cached lookup.

## Resolution order for an identifier

`resolveProjectFromIdentifier(identifier, projects, baseCwd)`:

| # | Check | Result |
| --- | --- | --- |
| 1 | Exact path or name match in the available list | `{ name, path }` |
| 2 | `baseCwd/<identifier>` exists as a directory | `{ name from package.json or basename, path }` |
| 3 | Absolute or cwd-relative path exists | `{ basename, path }` |
| 4 | Identifier is path-like and a known project path ends with `/<id>` | `{ name, path }` |
| 5 | Workspace subproject scan of cwd | `{ subproject name, path }` |
| — | No match | `{ name: identifier }` — **no path** |

Quotes are stripped before matching (`@"my project"` and `@my project` behave
alike). A `package.json` `name` is used for the project label when present, with
the npm scope stripped (`@scope/pkg` → `pkg`).

## Targeting another project reliably

- **cwd is the project repo** → plain `@name` is exact (step 2 or 1).
- **monorepo root** → use the subproject folder name; step 2 resolves
  `<root>/<name>` directly.
- **anything not registered** → use the **absolute path**
  (`@D:/01_programovani/pi/plugins/pi-spai`); step 3 pins it.
- **never** rely on an unregistered bare name — you get a label with no path and
  the record lands in cwd.

## Verifying where it landed

1. Read the created file (its name comes back in the tool response) under the
   intended `docs/spai/` and check `facets.project_path` — the authoritative
   location field.
2. Or `search_spai_items { query: "<title fragment>", project: "<intended>" }`
   (the `project` filter reports the project badge) and confirm the id.
3. Or, before recording, pass the absolute path so there is nothing to verify.

## ID namespaces, collisions and qualified ids

- `SPAI-NNN` is unique **per project backlog**, not globally. `SPAI-012` in two
  projects are unrelated items; never cite an id without its project.
- `update_spai_status` takes an **id or an exact file path**. Lookup
  (`resolveRecordTarget`) is bounded by the **git worktree** of cwd:
  - 0 matches → an error ("not found"),
  - exactly 1 → that record,
  - **≥2 → `SpaiIdCollisionError`**; the tool never silently picks one.
- To disambiguate, use the **project-qualified id form**:

  ```json
  update_spai_status({ "id": "SPAI-013 @pi-uma", "status": "done" })
  update_spai_status({ "id": "SPAI-013 @\"my project\"", "status": "done" })
  ```

  A qualified id whose project cannot be resolved raises an error naming the
  searched worktree rather than falling back to a bare search.

- An **exact file path** is also accepted as the id (absolute, or relative to
  cwd) and bypasses the index lookup entirely.

## Index cache and locking

- `.index.json` in each `docs/spai/` is a derived cache: rebuilt by tool-driven
  writes, and it is what status counts, the kanban board, search and the status
  bar read. Hand-editing a markdown file desynchronizes it (SPAI-004).
- Writes are serialized with a **per-directory lock**, and the index is re-read
  after acquiring it, so parallel `record_spai_item` calls in one project do not
  clobber each other or reuse an id (SPAI-002/SPAI-003).
