/**
 * Characterization tests for `KanbanBoardComponent`'s rendering and navigation.
 *
 * Written before splitting the 901-line module (line-limit campaign). The component
 * already had one render test and one constructor test, which is thin cover for a
 * 794-line class, so these pin the actual output of every layout — wide grid, narrow
 * single-column, project picker — plus focus/selection movement and the callbacks.
 *
 * Assertions use real markers read off the rendered output (▶ focused column, ▸
 * selected row, the per-layout banner title) rather than approximate ones, so a
 * refactor that changes any of them fails here.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { KanbanBoardComponent } from "../src/kanban.js";
import type { SpaiIndex } from "../src/types.js";

const ANSI = /\x1b\[[0-9;]*m/g;
const plain = (s: string) => s.replace(ANSI, "");

function fixtureIndex(): SpaiIndex {
	return {
		version: 1,
		lastUpdated: "2026-08-27 10:50:45",
		records: [
			{ id: "SPAI-001", title: "First task", type: "Todo", status: "todo", symbol: ".", timestamp: "t", tags: [], file: "1.md", project: "alpha" },
			{ id: "SPAI-002", title: "Second task", type: "Todo", status: "todo", symbol: ".", timestamp: "t", tags: [], file: "2.md", project: "beta" },
			{ id: "SPAI-003", title: "Working task", type: "Todo", status: "working", symbol: "/", timestamp: "t", tags: [], file: "3.md", project: "alpha" },
		],
	} as SpaiIndex;
}

const PROJECTS = [
	{ name: "alpha", hasSpai: true, taskCount: 2 },
	{ name: "beta", hasSpai: true, taskCount: 1 },
] as never;

function makeBoard(over: Record<string, unknown> = {}) {
	const calls = { newTask: 0, close: 0, statusChanges: [] as Array<[string, string]>, renders: 0 };
	const board = new KanbanBoardComponent({
		cwd: process.cwd(),
		index: fixtureIndex(),
		projects: PROJECTS,
		onClose: () => {
			calls.close += 1;
		},
		onNewTask: () => {
			calls.newTask += 1;
		},
		onStatusChange: (id: string, status: string) => {
			calls.statusChanges.push([id, status]);
		},
		onRequestRender: () => {
			calls.renders += 1;
		},
		...over,
	} as never);
	return { board, calls };
}

const lines = (board: KanbanBoardComponent, width = 100) => board.render(width).map(plain);
const joined = (board: KanbanBoardComponent, width = 100) => lines(board, width).join("\n");

// --- layout ------------------------------------------------------------------

test("the wide grid renders a fixed 20-line frame", () => {
	const { board } = makeBoard();
	const out = lines(board, 100);
	assert.equal(out.length, 20, "wide layout line count");
	assert.match(out[0] ?? "", /^╭─+╮$/);
	assert.match(out[19] ?? "", /^╰─+╯$/);
	assert.match(out[1] ?? "", /◈ SPAI KANBAN · ★ ALL PROJECTS ◈/);
	assert.match(out[1] ?? "", /⚡ 3 aktivních/);
	assert.match(out[3] ?? "", /←→: sloupec/);
});

test("the wide grid shows every column, clipping the last label", () => {
	const { board } = makeBoard();
	const out = joined(board, 100);
	assert.match(out, /▶ ○ TODO \[1\] \(2\)/, "focused column first");
	assert.match(out, /◐ WORKING \[2\]/);
	assert.match(out, /⏳ WAITING \[3\]/);
	assert.match(out, /✓ DONE \[4\]/);
	// Pinned: at 100 columns the final header is truncated with an ellipsis.
	assert.match(out, /✗ CANCELLED \[5…/);
	assert.match(out, /▸ #1 First task/);
	assert.match(out, /#2 Second task/);
	assert.match(out, /#3 Working task/);
});

test("the narrow layout switches to one focused column with tabs", () => {
	const { board } = makeBoard();
	const out = lines(board, 40);
	assert.equal(out.length, 21, "narrow layout line count");
	assert.match(out[1] ?? "", /◈ SPAI BOARD · ★ ALL PROJECTS ◈/, "narrow banner title differs");
	assert.match(out[2] ?? "", /▶ 1 ○ \(2\) ◀/, "focused tab is bracketed");
	assert.match(out[2] ?? "", /\[2 ◐:1\]/, "unfocused tab shows its count");
	assert.match(out[5] ?? "", /○ TODO \[1\] — 2 úkolů/, "focused column header");
	assert.match(out[7] ?? "", /▸ #1 First task/, "selected row");
});

test("an empty column renders its placeholder in the wide grid", () => {
	const { board } = makeBoard();
	assert.match(joined(board, 100), /· — ·/);
});

// --- focus and selection -----------------------------------------------------

test("l/h move the focused column and the ▶ marker with it", () => {
	const { board, calls } = makeBoard();
	const header = () => plain(board.render(100)[5] ?? "");
	assert.match(header(), /▶ ○ TODO/);

	board.handleInput("l");
	assert.match(header(), /▶ ◐ WORKING/);
	assert.match(joined(board), /▶ SPAI-003 Working task/, "inspector follows the focus");

	board.handleInput("h");
	assert.match(header(), /▶ ○ TODO/);
	assert.ok(calls.renders >= 2, "each move requests a render");
});

test("focus cannot move past either end", () => {
	const { board } = makeBoard();
	board.handleInput("h");
	assert.match(plain(board.render(100)[5] ?? ""), /▶ ○ TODO/);
	for (let i = 0; i < 8; i++) board.handleInput("l");
	assert.match(plain(board.render(100)[5] ?? ""), /▶ ✗ CANCELLED/);
});

test("j/k move the selection and clamp at the column bounds", () => {
	const { board } = makeBoard();
	const selected = () => lines(board, 100).filter((l) => l.includes("▸"));
	assert.match(selected().join("\n"), /▸ #1 First task/);

	board.handleInput("j");
	assert.match(selected().join("\n"), /▸ #2 Second task/);

	// Clamp: TODO holds two tasks, so further j presses stay on the second.
	for (let i = 0; i < 5; i++) board.handleInput("j");
	assert.match(selected().join("\n"), /▸ #2 Second task/);
	assert.equal(selected().length, 1, "exactly one row is selected");

	board.handleInput("k");
	assert.match(selected().join("\n"), /▸ #1 First task/);
	for (let i = 0; i < 5; i++) board.handleInput("k");
	assert.match(selected().join("\n"), /▸ #1 First task/);
});

// --- project picker ----------------------------------------------------------

test("o opens the project picker and escape returns to the board", () => {
	const { board } = makeBoard();
	board.handleInput("o");
	const picker = lines(board, 100);
	assert.equal(picker.length, 9, "picker line count");
	assert.match(picker.join("\n"), /◈ VÝBĚR PROJEKTU ◈/);
	assert.match(picker.join("\n"), /▶ ★ ALL PROJECTS/, "single marker, not doubled");
	assert.equal(/★ ★/.test(picker.join("\n")), false, "FIXED: the marker used to be doubled");
	assert.match(picker.join("\n"), /📁 alpha \(2\)/);
	assert.match(picker.join("\n"), /📁 beta \(1\)/);
	assert.equal(/📁 📁/.test(picker.join("\n")), false, "FIXED: no doubled folder marker");
	assert.match(picker[3] ?? "", /▶/, "first option is marked");
	assert.match(picker.join("\n"), /↑\/↓ nebo j\/k: výběr/);

	board.handleInput("\u001b");
	assert.match(joined(board, 100), /◈ SPAI KANBAN/, "back on the board");
});

test("picker j/k move the cursor and enter applies the filter", () => {
	const { board } = makeBoard();
	board.handleInput("o");
	assert.equal(board.getActiveProjectFilter(), "ALL");

	board.handleInput("j");
	assert.match(lines(board, 100)[4] ?? "", /▶/, "cursor moved to the second option");

	board.handleInput("\r");
	assert.equal(board.getActiveProjectFilter(), "alpha", "enter applies the highlighted project");
	assert.match(joined(board, 100), /◈ SPAI KANBAN · 📁 alpha ◈/);
	assert.equal(board.getVisibleRecords().length, 2, "only alpha's records remain");
});

test("picker escape leaves the filter untouched", () => {
	const { board } = makeBoard();
	board.handleInput("o");
	board.handleInput("j");
	board.handleInput("q");
	assert.equal(board.getActiveProjectFilter(), "ALL");
	assert.equal(board.getVisibleRecords().length, 3);
});

// --- project filter ----------------------------------------------------------

test("p cycles the project filter and wraps around", () => {
	const { board } = makeBoard();
	assert.equal(board.getActiveProjectFilter(), "ALL");
	board.handleInput("p");
	assert.equal(board.getActiveProjectFilter(), "alpha");
	board.handleInput("p");
	assert.equal(board.getActiveProjectFilter(), "beta");
	board.handleInput("p");
	assert.equal(board.getActiveProjectFilter(), "ALL", "wraps back to ALL");
});

test("getVisibleRecords filters by project name", () => {
	const { board } = makeBoard();
	board.handleInput("p");
	assert.deepEqual(
		board.getVisibleRecords().map((r) => r.id),
		["SPAI-001", "SPAI-003"],
	);
});

// --- callbacks ---------------------------------------------------------------

test("n/a request a new task and q/escape close the board", () => {
	const { board, calls } = makeBoard();
	board.handleInput("n");
	board.handleInput("a");
	assert.equal(calls.newTask, 2);

	board.handleInput("q");
	assert.equal(calls.close, 1);

	const second = makeBoard();
	second.board.handleInput("\u001b");
	assert.equal(second.calls.close, 1);
});

test("a status key for the current column is a no-op", async () => {
	// TODO is the focused column and SPAI-001 is already todo, so nothing happens —
	// no disk access and no callback.
	const { board, calls } = makeBoard();
	board.handleInput("1");
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.deepEqual(calls.statusChanges, []);
});

// --- state -------------------------------------------------------------------

test("setIndex replaces the rendered records", () => {
	const { board } = makeBoard();
	board.setIndex({ version: 1, lastUpdated: "t", records: [] } as SpaiIndex);
	const out = joined(board, 100);
	assert.equal(out.includes("First task"), false, "old records are gone");
	assert.match(out, /⚡ 0 aktivních/);
});

test("invalidate clears the cache and the board still renders", () => {
	const { board } = makeBoard();
	const first = lines(board, 100);
	board.invalidate();
	const second = lines(board, 100);
	assert.deepEqual(second, first, "same state renders the same frame");
});
