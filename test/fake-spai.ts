import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunOut, Runner } from "../src/spai-cli.js";

export interface Call {
  argv: string[];
  cwd: string;
}

export interface Fake {
  runner: Runner;
  calls: Call[];
}

const ok = (data: object): RunOut => ({ code: 0, stdout: JSON.stringify({ ok: true, data }), stderr: "" });
const fail = (code: number, error: string): RunOut => ({ code, stdout: JSON.stringify({ ok: false, error }), stderr: "" });

/** The value after `flag` in argv. */
export const flagValue = (argv: string[], flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

/**
 * A stand-in for the `spai` process. `add` answers with `addAnswer` (default: written
 * as SPAI-001) and writes nothing; `set` rewrites the `status:` line of the record
 * file, which is what the real binary does and what the lookup tests look at.
 */
export function fakeSpai(addAnswer?: (argv: string[]) => RunOut): Fake {
  const calls: Call[] = [];
  const runner: Runner = async (argv, cwd) => {
    calls.push({ argv, cwd });
    switch (argv[0]) {
      case "add":
        return (
          addAnswer?.(argv) ??
          ok({
            written: true,
            id: "SPAI-001",
            project: "p",
            path: join(flagValue(argv, "--project") ?? cwd, "docs", "spai", "x.md"),
            title: argv[1],
            title_cs: null,
            pending: [],
            duplicates: [],
            related: [],
          })
        );
      case "set": {
        const [, id, status] = argv;
        const project = flagValue(argv, "--project") ?? cwd;
        const dir = join(project, "docs", "spai");
        const file = readdirSync(dir).find((f) => f.endsWith(".md") && f.includes(id ?? "\0"));
        if (!file) return fail(1, `record not found: ${id}`);
        const path = join(dir, file);
        const text = readFileSync(path, "utf8");
        writeFileSync(path, text.replace(/^status:.*$/m, `status: ${status}`));
        return ok({ id, status, from: "todo", changed: true, path, file });
      }
      case "similar":
        return ok({ duplicates: [], related: [] });
      default:
        return fail(2, `unexpected: ${argv.join(" ")}`);
    }
  };
  return { runner, calls };
}

export { fail, ok };
