/**
 * Types and interfaces for SPAI Task & Idea Ledger (pi-spai).
 * 1:1 aligned with mozek_rust (crates/spai/SPEC.md & src/shared/spai.js).
 */

export type SpaiNoteType = "Note" | "Todo" | "Idea";

export type SpaiStatus =
  | "todo"
  | "working"
  | "waiting"
  | "done"
  | "cancelled"
  | "note"
  | "idea"
  | "inbox";

export type SpaiPriority = "high" | "medium" | "low";

export interface SpaiPrefixDef {
  prefix: string;
  marker: string;
  symbol: string;
  type: SpaiNoteType;
  status: SpaiStatus;
  isDefault?: boolean;
  titleOnly?: boolean;
}

export interface InlineMeta {
  priority?: SpaiPriority;
  deadline?: string;
  tags: string[];
  cleanBody: string;
}

export interface Subtask {
  lineIndex: number;
  status: SpaiStatus;
  done: boolean;
  text: string;
}

export interface SpaiRecord {
  id: string;
  title: string;
  type: SpaiNoteType;
  status: SpaiStatus;
  symbol: string;
  timestamp: string;
  tags: string[];
  description: string;
  priority?: SpaiPriority;
  deadline?: string;
  project?: string;
  file: string;
  body: string;
  subtasks: Subtask[];
  rawContent?: string;
}

export interface SpaiIndexEntry {
  id: string;
  title: string;
  type: SpaiNoteType;
  status: SpaiStatus;
  symbol: string;
  timestamp: string;
  tags: string[];
  priority?: SpaiPriority;
  deadline?: string;
  file: string;
}

export interface SpaiIndex {
  version: number;
  lastUpdated: string;
  records: SpaiIndexEntry[];
}

export interface SearchMatch extends SpaiIndexEntry {
  score: number;
  snippet?: string;
}
