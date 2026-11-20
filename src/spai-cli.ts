/**
 * Klient binárky `spai`: jediné místo, kde pi-spai zapisuje záznamy a mění jejich stav.
 *
 * `spai` vlastní pravidla (anglické úložiště, `title_cs`, ID, duplicity, `pending` bez sítě).
 * Tady se jen spouští jako proces (`execFile`, bez shellu) s `--json` a čte se stdout
 * a návratový kód: 0 ok, 1 selhání, 2 špatné použití, 3 nalezena duplicita.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export const NOT_FOUND =
  "spai nenalezen — `cargo install --path cli` v repu spai nebo nastav SPAI_BIN";

export interface RunOut {
  code: number;
  stdout: string;
  stderr: string;
}

/** Spustí `spai` s argv v cwd. Testy ho nahrazují podvrženým. */
export type Runner = (argv: string[], cwd: string) => Promise<RunOut>;

/** Selhání `spai` (kód 1/2, chybějící binárka, neplatný výstup); `message` je text pro uživatele. */
export class SpaiCliError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
    this.name = "SpaiCliError";
  }
}

function exeName(): string {
  return process.platform === "win32" ? "spai.exe" : "spai";
}

/** `SPAI_BIN`, potom PATH, potom `~/.cargo/bin`. */
export function findBinary(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env.SPAI_BIN;
  if (explicit && existsSync(explicit)) return explicit;
  for (const dir of (env.PATH ?? env.Path ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, exeName());
    if (existsSync(candidate)) return candidate;
  }
  const home = env.USERPROFILE ?? env.HOME;
  if (home) {
    const candidate = join(home, ".cargo", "bin", exeName());
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** Skutečný proces. `env` přepisuje prostředí dítěte (testy tím přesměrují cesty). */
export function processRunner(env?: NodeJS.ProcessEnv): Runner {
  return (argv, cwd) =>
    new Promise((resolve, reject) => {
      const bin = findBinary(env ? { ...process.env, ...env } : process.env);
      if (!bin) {
        reject(new SpaiCliError(NOT_FOUND, 1));
        return;
      }
      execFile(
        bin,
        argv,
        {
          cwd,
          env: env ? { ...process.env, ...env } : process.env,
          encoding: "utf8",
          maxBuffer: 16 * 1024 * 1024,
          timeout: 180_000,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (error && typeof (error as { code?: unknown }).code !== "number") {
            reject(new SpaiCliError(`spai se nespustil: ${error.message}`, 1));
            return;
          }
          const code = error ? ((error as { code?: number }).code as number) : 0;
          resolve({ code, stdout: String(stdout), stderr: String(stderr) });
        },
      );
    });
}

let runner: Runner = processRunner();

/** Nahradí proces podvrženým runnerem (testy); bez argumentu vrátí skutečný. */
export function setRunner(next?: Runner): void {
  runner = next ?? processRunner();
}

/** Zavolá `spai <args> --json`; vrátí `data`, kód (0 nebo 3) a varování ze stderr. */
async function call(
  args: string[],
  cwd: string,
): Promise<{ code: number; data: Record<string, unknown>; warnings: string[] }> {
  const out = await runner([...args, "--json"], cwd);
  let json: { data?: Record<string, unknown>; error?: string } = {};
  try {
    json = JSON.parse(out.stdout.trim()) as typeof json;
  } catch {
    // Výstup není JSON: chyba se odvodí z kódu a stderr níž.
  }
  if (out.code !== 0 && out.code !== 3) {
    const lastLine = out.stderr
      .split(/\r?\n/)
      .reverse()
      .find((line) => line.trim());
    throw new SpaiCliError(
      json.error ?? lastLine?.trim() ?? `spai skončil kódem ${out.code}`,
      out.code,
    );
  }
  if (!json.data) throw new SpaiCliError("spai nevrátil žádná data", out.code);
  const warnings = out.stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("pozor:"))
    .map((line) => line.slice("pozor:".length).trim());
  return { code: out.code, data: json.data, warnings };
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Podobný záznam z libovolného projektu. */
export interface SimilarHit {
  project: string;
  id: string;
  /** České zobrazení, když ho záznam má (spai ho vrací v `title`). */
  title: string;
  /** 0–1. */
  score: number;
  path: string;
  /** Na nebo nad prahem duplicity (jinak jen příbuzný). */
  duplicate: boolean;
}

function hitsOf(data: Record<string, unknown>): SimilarHit[] {
  const list = (key: string, duplicate: boolean): SimilarHit[] =>
    (Array.isArray(data[key]) ? (data[key] as Record<string, unknown>[]) : []).map((h) => ({
      project: str(h.project),
      id: str(h.id),
      title: str(h.title),
      score: typeof h.score === "number" ? h.score : 0,
      path: str(h.path),
      duplicate,
    }));
  return [...list("duplicates", true), ...list("related", false)];
}

export interface Written {
  written: true;
  id: string;
  project: string;
  path: string;
  title: string;
  titleCs?: string;
  /** Práce, která čeká na síť: `translate_cs`, `embed`, … (doplní `spai reindex`). */
  pending: string[];
  warnings: string[];
  related: SimilarHit[];
}

export interface Duplicates {
  written: false;
  duplicates: SimilarHit[];
  related: SimilarHit[];
  warnings: string[];
}

export type AddOutcome = Written | Duplicates;

/** `spai add` do `project` (složka projektu). `force` zapíše i přes duplicitu. */
export async function addRecord(
  cwd: string,
  text: string,
  opts: { project?: string; force?: boolean } = {},
): Promise<AddOutcome> {
  const args = ["add", text, "--source", "pi"];
  if (opts.project) args.push("--project", opts.project);
  if (opts.force) args.push("--force");
  const { code, data, warnings } = await call(args, cwd);
  const hits = hitsOf(data);
  if (code === 3 || data.written !== true) {
    return {
      written: false,
      duplicates: hits.filter((h) => h.duplicate),
      related: hits.filter((h) => !h.duplicate),
      warnings,
    };
  }
  return {
    written: true,
    id: str(data.id),
    project: str(data.project),
    path: str(data.path),
    title: str(data.title),
    titleCs: str(data.title_cs) || undefined,
    pending: Array.isArray(data.pending) ? (data.pending as unknown[]).map(str) : [],
    warnings,
    related: hits.filter((h) => !h.duplicate),
  };
}

/** `spai similar`: duplicity a příbuzné záznamy; nic nezapíše. */
export async function similar(cwd: string, text: string): Promise<SimilarHit[]> {
  const { data } = await call(["similar", text], cwd);
  return hitsOf(data);
}

export interface StatusChange {
  id: string;
  path: string;
  status: string;
  from: string;
  changed: boolean;
}

/** `spai set <id> <stav>` v projektu `project` (stav jménem nebo symbolem). */
export async function setStatus(
  cwd: string,
  id: string,
  status: string,
  project?: string,
): Promise<StatusChange> {
  const args = ["set", id, status];
  if (project) args.push("--project", project);
  const { data } = await call(args, cwd);
  return {
    id: str(data.id),
    path: str(data.path),
    status: str(data.status),
    from: str(data.from),
    changed: data.changed === true,
  };
}

/** Text o zapsaném záznamu pro agenta i uživatele. */
export function describeWritten(w: Written): string {
  const lines = [
    `Vytvořena SPAI položka ${w.id} (projekt ${w.project}): ${w.titleCs ?? w.title}`,
    `Cesta: ${w.path}`,
  ];
  if (w.pending.length > 0) {
    lines.push(`Bez sítě, čeká: ${w.pending.join(", ")} (doplní \`spai reindex\`).`);
  }
  for (const warning of w.warnings) lines.push(`Pozor: ${warning}`);
  if (w.related.length > 0) lines.push("Příbuzné:", ...w.related.map(describeHit));
  return lines.join("\n");
}

export function describeHit(h: SimilarHit): string {
  return `- [@${h.project}] ${h.id} (${Math.round(h.score * 100)} %): ${h.title}`;
}

/** Text o zastaveném zápisu: nic se nezapsalo, protože podobný záznam existuje. */
export function describeDuplicates(d: Duplicates): string {
  return [
    "Nic nezapsáno: podobný záznam už existuje.",
    ...d.duplicates.map(describeHit),
    "Je-li to přesto nový záznam, zapiš ho znovu s force=true — jen na výslovné přání uživatele.",
  ].join("\n");
}
