import type {
  AutocompleteItem,
  AutocompleteProvider,
  AutocompleteSuggestions,
} from "@earendil-works/pi-tui";
import {
  abbreviateRootOrigin,
  extractAtQuery,
  extractAtToken,
  filterProjectsForAutocomplete,
  formatProjectAutocompleteItem,
  scoreProject,
} from "./autocomplete-matching.js";
import { loadAvailableProjects, type ProjectSummary } from "./projects.js";

export {
  abbreviateRootOrigin,
  extractAtQuery,
  extractAtToken,
  filterProjectsForAutocomplete,
  formatProjectAutocompleteItem,
  scoreProject,
};

/**
 * Creates live TUI autocomplete provider that offers projects in the full scope
 * as configured by pi-projects, prioritizing workspace-local subprojects in monorepos.
 */
export function createSpaiAutocompleteProvider(
  current: AutocompleteProvider,
  getProjects: () => ProjectSummary[] = loadAvailableProjects,
  getSortBy: () => string = () => "name",
  workspaceCwd?: string,
): AutocompleteProvider {
  return {
    async getSuggestions(
      lines: string[],
      cursorLine: number,
      cursorCol: number,
      options: { signal: AbortSignal; force?: boolean },
    ): Promise<AutocompleteSuggestions | null> {
      const currentLine = lines[cursorLine] ?? "";
      const textBefore = currentLine.slice(0, cursorCol);

      const atToken = extractAtToken(textBefore);
      if (!atToken) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      let baseSuggestions: AutocompleteSuggestions | null = null;
      try {
        baseSuggestions = await current.getSuggestions(
          lines,
          cursorLine,
          cursorCol,
          options,
        );
      } catch {
        // Base failure non-fatal
      }

      if (options.signal.aborted) {
        return null;
      }

      const hasProjectsInBase = Boolean(
        baseSuggestions?.items &&
          baseSuggestions.items.some(
            (i) => i.label.startsWith("📁 ") || i.description?.includes("souborů"),
          ),
      );

      if (hasProjectsInBase && baseSuggestions) {
        return baseSuggestions;
      }

      const allProjects = workspaceCwd
        ? loadAvailableProjects(false, workspaceCwd)
        : getProjects();

      const matched = filterProjectsForAutocomplete(
        allProjects,
        atToken.query,
        undefined,
        getSortBy(),
      );

      const projectItems = matched.map((p) =>
        formatProjectAutocompleteItem(p, atToken.isQuoted),
      );

      if (
        !baseSuggestions ||
        !baseSuggestions.items ||
        baseSuggestions.items.length === 0
      ) {
        if (projectItems.length > 0) {
          return {
            items: projectItems,
            prefix: atToken.rawPrefix,
          };
        }
        return null;
      }

      const seenValues = new Set(projectItems.map((i) => i.value));
      const remainingBaseItems = baseSuggestions.items.filter(
        (i) => !seenValues.has(i.value),
      );

      return {
        items: [...projectItems, ...remainingBaseItems],
        prefix: baseSuggestions.prefix || atToken.rawPrefix,
      };
    },

    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(
        lines,
        cursorLine,
        cursorCol,
        item,
        prefix,
      );
    },

    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return (
        current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ??
        true
      );
    },
  };
}

/**
 * Handles argument completions specifically for `/spai new ...`, `/spai add ...`, or `/spai . ...`
 */
export function getSpaiNewCompletions(
  newArgText: string,
  getProjects: () => ProjectSummary[] = loadAvailableProjects,
  getSortBy: () => string = () => "name",
  cmdPrefix = "new ",
): AutocompleteItem[] | null {
  const atToken = extractAtToken(newArgText);

  if (atToken) {
    const allProjects = getProjects();
    const matched = filterProjectsForAutocomplete(
      allProjects,
      atToken.query,
      25,
      getSortBy(),
    );
    if (matched.length === 0) return null;

    const tokenIdx = newArgText.lastIndexOf(atToken.rawPrefix);
    const prefixBefore = tokenIdx >= 0 ? newArgText.slice(0, tokenIdx) : "";

    return matched.map((p) => {
      const item = formatProjectAutocompleteItem(p, atToken.isQuoted);
      return {
        value: `${cmdPrefix}${prefixBefore}${item.value} `,
        label: item.label,
        description: item.description,
      };
    });
  }

  // If user only typed "/spai new " or empty args
  if (!newArgText.trim()) {
    return [
      {
        value: `${cmdPrefix}. `,
        label: ". <úkol>",
        description: "Nový otevřený úkol (todo)",
      },
      {
        value: `${cmdPrefix}? `,
        label: "? <nápad>",
        description: "Nový nápad nebo koncept (idea)",
      },
      {
        value: `${cmdPrefix}- `,
        label: "- <poznámka>",
        description: "Nová poznámka nebo fakt (note)",
      },
      {
        value: `${cmdPrefix}! . `,
        label: "! . <prioritní úkol>",
        description: "Úkol s vysokou prioritou (!high)",
      },
    ];
  }

  return null;
}
