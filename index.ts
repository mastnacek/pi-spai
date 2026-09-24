import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { getCompletions } from "./src/commands-completions.js";
import { openKanbanBoard } from "./src/commands-explorer.js";
import {
  handleHelp,
  handleList,
  handleNew,
  handleRealize,
  handleSearch,
  handleShow,
  handleStatus,
  handleToggle,
} from "./src/commands-handlers.js";
import { setProjectsConfigCwd } from "./src/projects-scanner.js";
import { handleSessionStart } from "./src/session-state.js";
import { registerTools } from "./src/tools.js";

export default function (pi: ExtensionAPI): void {
  /** Unsubscribers from every `pi.on()`; drained on session_shutdown (AGENTS §5). */
  const unsubs: Array<() => void> = [];

  /** Retain a `pi.on()` return value; older engine typings declare it void. */
  const track = (sub: unknown) => {
    if (typeof sub === "function") unsubs.push(sub as () => void);
  };

  track(
    pi.on("session_start", (_event, ctx) => {
      // Follow the same pi-projects registry cascade that /proj writes to,
      // otherwise /spai would read roots the user changed for this project.
      setProjectsConfigCwd(ctx.cwd);
      handleSessionStart(ctx);
    }),
  );

  pi.on("session_shutdown", () => {
    while (unsubs.length > 0) {
      try {
        unsubs.pop()?.();
      } catch {
        // Suppress teardown errors
      }
    }
  });

  registerTools(pi);

  pi.registerCommand("spai", {
    description: "Správa úkolů, nápadů a poznámek podle SPAI syntaxe",
    getArgumentCompletions: (prefix: string) => getCompletions(prefix),
    handler: async (
      args: string,
      ctx: ExtensionCommandContext,
    ): Promise<void> => {
      const trimmed = args.trim();
      const tokens = trimmed.split(/\s+/).filter(Boolean);
      const subcommand = (tokens[0] ?? "list").toLowerCase();
      const remainder = tokens.slice(1).join(" ").trim();

      // Quick task assignment detection:
      // If user typed "/spai . Task @subproject", "/spai ? Idea @subproject", "/spai @subproject . Task", etc.
      if (/^[.?xXzZ/!@-]/.test(trimmed)) {
        await handleNew(trimmed, ctx);
        return;
      }

      switch (subcommand) {
        case "board":
        case "kanban":
          await openKanbanBoard(ctx, () => handleNew("", ctx));
          break;
        case "list":
          await handleList(remainder, ctx);
          break;
        case "new":
        case "add":
          await handleNew(remainder, ctx);
          break;
        case "show":
          await handleShow(remainder, ctx);
          break;
        case "toggle":
          await handleToggle(remainder, ctx);
          break;
        case "realize":
        case "run":
          await handleRealize(remainder, ctx);
          break;
        case "search":
          await handleSearch(remainder, ctx);
          break;
        case "status":
          await handleStatus(ctx);
          break;
        case "help":
        case "--help":
        case "-h":
          handleHelp(ctx);
          break;
        default:
          ctx.ui.notify(
            `Neznámý příkaz "/spai ${subcommand}". Použijte: /spai help`,
            "warning",
          );
          break;
      }
    },
  });
}
