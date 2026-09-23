import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  discoverAllProjects,
  type ProjectSummary,
} from "../src/projects.js";
import { loadAllProjectsIndex, scanProjectSpai } from "../src/storage.js";
import { KanbanBoardComponent } from "../src/kanban.js";
import type { SpaiIndex, SpaiIndexEntry } from "../src/types.js";

function makeTempProject(name: string, tasks: string[]): ProjectSummary {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `spai-mp-${name}-`));
  const spaiDir = path.join(root, "docs", "spai");
  fs.mkdirSync(spaiDir, { recursive: true });

  const entries: SpaiIndexEntry[] = [];
  tasks.forEach((title, i) => {
    const id = `SPAI-${String(i + 1).padStart(3, "0")}`;
    const file = `${id}.md`;
    fs.writeFileSync(
      path.join(spaiDir, file),
      `---\ntype: Todo\nstatus: ${i % 2 === 0 ? "todo" : "working"}\ntimestamp: 2026-09-23 10:00:00\nproject: ${name}\n---\n\n# ${id}: ${title}\n\n. ${title}\n`,
      "utf8",
    );
    entries.push({
      id,
      title,
      type: "Todo",
      status: i % 2 === 0 ? "todo" : "working",
      symbol: ".",
      timestamp: "2026-09-23 10:00:00",
      tags: [],
      project: name,
      projectPath: root.replace(/\\/g, "/"),
      file,
    });
  });

  return {
    name,
    path: root.replace(/\\/g, "/"),
    spaiDir: root.replace(/\\/g, "/") + "/docs/spai",
    hasSpai: true,
    taskCount: tasks.length,
  };
}

test("scanProjectSpai annotates entries with owning project", async () => {
  const proj = makeTempProject("projA", ["Task A1", "Task A2", "Task A3"]);
  try {
    const entries = await scanProjectSpai(proj);
    assert.equal(entries.length, 3);
    for (const e of entries) {
      assert.equal(e.project, "projA");
      assert.ok(e.projectPath, "projectPath must be set");
      assert.ok(e.filePath?.endsWith(".md"));
    }
  } finally {
    fs.rmSync(proj.path, { recursive: true, force: true });
  }
});

test("loadAllProjectsIndex merges tasks across multiple projects", async () => {
  const projA = makeTempProject("alpha", ["Alpha 1", "Alpha 2"]);
  const projB = makeTempProject("beta", ["Beta 1"]);
  try {
    const { index, projectsWithCounts } = await loadAllProjectsIndex([
      projA,
      projB,
    ]);
    assert.equal(index.records.length, 3);
    assert.equal(projectsWithCounts.find((p) => p.name === "alpha")?.taskCount, 2);
    assert.equal(projectsWithCounts.find((p) => p.name === "beta")?.taskCount, 1);

    const alphaTasks = index.records.filter((r) => r.project === "alpha");
    assert.equal(alphaTasks.length, 2);
    assert.equal(betaTasksCount(index), 1);
  } finally {
    fs.rmSync(projA.path, { recursive: true, force: true });
    fs.rmSync(projB.path, { recursive: true, force: true });
  }
});

function betaTasksCount(index: SpaiIndex): number {
  return index.records.filter((r) => r.project === "beta").length;
}

test("Kanban project filter toggles and filters columns", () => {
  const projA = { name: "alpha", path: "/tmp/a", hasSpai: true, taskCount: 1 };
  const projB = { name: "beta", path: "/tmp/b", hasSpai: true, taskCount: 1 };

  const index: SpaiIndex = {
    version: 1,
    lastUpdated: "2026-09-23 10:00:00",
    records: [
      {
        id: "SPAI-001",
        title: "Alpha task",
        type: "Todo",
        status: "todo",
        symbol: ".",
        timestamp: "2026-09-23 10:00:00",
        tags: [],
        project: "alpha",
        projectPath: "/tmp/a",
        file: "SPAI-001.md",
      },
      {
        id: "SPAI-002",
        title: "Beta task",
        type: "Todo",
        status: "todo",
        symbol: ".",
        timestamp: "2026-09-23 10:00:00",
        tags: [],
        project: "beta",
        projectPath: "/tmp/b",
        file: "SPAI-002.md",
      },
    ],
  };

  const board = new KanbanBoardComponent({
    cwd: "/tmp/a",
    index,
    projects: [projA, projB],
    onClose: () => {},
  });

  // ALL: both tasks visible in todo column
  assert.equal(board.getActiveProjectFilter(), "ALL");
  assert.equal(board.getVisibleRecords().length, 2);

  // p -> switches to first project with SPAI (alpha)
  board.toggleProjectFilter("next");
  assert.equal(board.getActiveProjectFilter(), "alpha");
  assert.equal(board.getVisibleRecords().length, 1);
  assert.equal(board.getVisibleRecords()[0]?.project, "alpha");

  // p -> switches to beta
  board.toggleProjectFilter("next");
  assert.equal(board.getActiveProjectFilter(), "beta");

  // p -> cycles back to ALL
  board.toggleProjectFilter("next");
  assert.equal(board.getActiveProjectFilter(), "ALL");

  // prev direction works: ALL -> beta (wrap backwards)
  board.toggleProjectFilter("prev");
  assert.equal(board.getActiveProjectFilter(), "beta");
});

test("discoverAllProjects includes cwd and dedupes paths", () => {
  const projects = discoverAllProjects();
  assert.ok(projects.length >= 1);
  const paths = new Set(projects.map((p) => p.path));
  assert.equal(paths.size, projects.length);
});
