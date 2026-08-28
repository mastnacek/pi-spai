import test from "node:test";
import assert from "node:assert/strict";
import {
  cycleNextStatus,
  extractDeadline,
  extractInlineTags,
  extractPriority,
  formatSpaiLine,
  matchSpaiPrefix,
  parseInlineMeta,
  parseSpai,
  parseSubtasks,
  stripSpaiPrefix,
  toggleSubtaskDone,
  updateBodyStatusPrefix,
} from "../src/spai.js";

test("matchSpaiPrefix parses standard SPAI table", () => {
  const todo = matchSpaiPrefix(". Úkol pro release");
  assert.ok(todo);
  assert.equal(todo?.status, "todo");
  assert.equal(todo?.type, "Todo");

  const working = matchSpaiPrefix("/ Rozpracováno");
  assert.ok(working);
  assert.equal(working?.status, "working");

  const waiting = matchSpaiPrefix("/. Čeká na review");
  assert.ok(waiting);
  assert.equal(waiting?.status, "waiting");

  const done = matchSpaiPrefix("x Hotovo");
  assert.ok(done);
  assert.equal(done?.status, "done");

  const idea = matchSpaiPrefix("? Nový nápad");
  assert.ok(idea);
  assert.equal(idea?.status, "idea");
  assert.equal(idea?.type, "Idea");

  const note = matchSpaiPrefix("- Poznámka o architektuře");
  assert.ok(note);
  assert.equal(note?.status, "note");
  assert.equal(note?.type, "Note");
});

test("stripSpaiPrefix removes leading prefix", () => {
  assert.equal(stripSpaiPrefix(". Test"), "Test");
  assert.equal(stripSpaiPrefix("x Done"), "Done");
  assert.equal(stripSpaiPrefix("/. Wait"), "Wait");
});

test("extractInlineTags parses chained tags", () => {
  const { tags, cleanText } = extractInlineTags("Oprava IPC :ipc:bug:windows:");
  assert.ok(tags.includes("ipc"));
  assert.ok(tags.includes("bug"));
  assert.ok(tags.includes("windows"));
  assert.equal(cleanText, "Oprava IPC");
});

test("extractPriority parses ! prefix", () => {
  const res = extractPriority("! . Důležitý úkol");
  assert.equal(res.priority, "high");
  assert.equal(res.cleanText, ". Důležitý úkol");
});

test("extractDeadline parses @YYYY-MM-DD and @DD.MM.", () => {
  const res1 = extractDeadline(". Dokončit @2026-09-15");
  assert.equal(res1.deadline, "2026-09-15");
  assert.equal(res1.cleanText, ". Dokončit");

  const res2 = extractDeadline(". Odeslat @15.09.");
  assert.ok(res2.deadline?.includes("09-15"));
});

test("parseInlineMeta extracts all inline metadata together", () => {
  const meta = parseInlineMeta("! . Opravit chybu @2026-09-01 :urgent:core:");
  assert.equal(meta.priority, "high");
  assert.equal(meta.deadline, "2026-09-01");
  assert.ok(meta.tags.includes("urgent"));
  assert.ok(meta.tags.includes("core"));
});

test("parseSpai extracts title, type, and status", () => {
  const parsed = parseSpai(". Implementovat SPAI ledger :dev:");
  assert.equal(parsed.type, "Todo");
  assert.equal(parsed.status, "todo");
  assert.equal(parsed.title, "Implementovat SPAI ledger");
});

test("parseSubtasks and toggleSubtaskDone handle nested tasks", () => {
  const body = `
Hlavní úkol:
. Krok 1
x Krok 2
/. Krok 3
`;
  const subtasks = parseSubtasks(body);
  assert.equal(subtasks.length, 3);
  assert.equal(subtasks[0]?.done, false);
  assert.equal(subtasks[1]?.done, true);

  const toggled = toggleSubtaskDone(body, 2);
  assert.ok(toggled.includes("x Krok 1"));
});

test("cycleNextStatus cycles through all states in order", () => {
  assert.equal(cycleNextStatus("todo", "Todo"), "working");
  assert.equal(cycleNextStatus("working", "Todo"), "waiting");
  assert.equal(cycleNextStatus("waiting", "Todo"), "done");
  assert.equal(cycleNextStatus("done", "Todo"), "cancelled");
  assert.equal(cycleNextStatus("cancelled", "Todo"), "todo");

  assert.equal(cycleNextStatus("idea", "Idea"), "todo");
  assert.equal(cycleNextStatus("note", "Note"), "todo");
});

test("updateBodyStatusPrefix updates leading SPAI line prefix", () => {
  const original = ". Implementovat feature";
  const working = updateBodyStatusPrefix(original, "working");
  assert.equal(working.symbol, "/");
  assert.equal(working.body, "/ Implementovat feature");

  const waiting = updateBodyStatusPrefix(working.body, "waiting");
  assert.equal(waiting.symbol, "/.");
  assert.equal(waiting.body, "/. Implementovat feature");

  const done = updateBodyStatusPrefix(waiting.body, "done");
  assert.equal(done.symbol, "x");
  assert.equal(done.body, "x Implementovat feature");

  const cancelled = updateBodyStatusPrefix(done.body, "cancelled");
  assert.equal(cancelled.symbol, "z");
  assert.equal(cancelled.body, "z Implementovat feature");
});
