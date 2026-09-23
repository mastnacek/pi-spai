import type {
  AutocompleteItem,
  AutocompleteProvider,
  AutocompleteSuggestions,
} from "@earendil-works/pi-tui";
import { matchSpaiPrefix } from "./spai.js";
import {
  type ProjectSummary,
  loadAvailableProjects,
  searchProjects,
} from "./projects.js";

/**
 * Extracts the trailing `@` token from text before the cursor.
 */
export function extractAtQuery(
  textBeforeCursor: string,
): { rawToken: string; query: string } | null {
  // Check unclosed quoted @"...
  const quoteMatch = textBeforeCursor.match(/(?:^|[ \t([{])(@"[^"\n]*)$/);
  if (quoteMatch) {
    const rawToken = quoteMatch[1] ?? "";
    const query = rawToken.slice(2);
    return { rawToken, query };
  }

  // Check bare @...
  const match = textBeforeCursor.match(/(?:^|[ \t([{])(@[^\s"(){}[\];,!?]*)$/);
  if (match) {
    const rawToken = match[1] ?? "";
    const query = rawToken.slice(1);
    return { rawToken, query };
  }

  return null;
}

/**
 * Creates live TUI autocomplete provider that intercepts `@` in SPAI task contexts.
 */
export function createSpaiAutocompleteProvider(
  current: AutocompleteProvider,
  getProjects: () => ProjectSummary[] = loadAvailableProjects,
): AutocompleteProvider {
  return {
    async getSuggestions(
      lines,
      cursorLine,
      cursorCol,
      options,
    ): Promise<AutocompleteSuggestions | null> {
      const currentLine = lines[cursorLine] ?? "";
      const textBefore = currentLine.slice(0, cursorCol);

      // Check if this is a SPAI context
      const isSpaiCommand = /^\s*\/spai\s+new\b/i.test(currentLine);
      const isSpaiLine = matchSpaiPrefix(currentLine.trimStart()) !== null;

      const atToken = extractAtQuery(textBefore);

      if ((isSpaiCommand || isSpaiLine) && atToken) {
        const projects = getProjects();
        const matches = searchProjects(atToken.query, projects);

        if (matches.length > 0) {
          const items: AutocompleteItem[] = matches.slice(0, 25).map((p) => {
            const needsQuotes = p.name.includes(" ");
            const val = needsQuotes ? `@"${p.name}"` : `@${p.name}`;
            return {
              value: val,
              label: `@${p.name}`,
              description: p.type ? `[${p.type}] ${p.path}` : p.path,
            };
          });

          return {
            items,
            prefix: atToken.rawToken,
          };
        }
      }

      // Delegate to base autocomplete provider
      return current.getSuggestions(lines, cursorLine, cursorCol, options);
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
      const currentLine = lines[cursorLine] ?? "";
      const textBefore = currentLine.slice(0, cursorCol);
      const isSpaiCommand = /^\s*\/spai\s+new\b/i.test(currentLine);
      const isSpaiLine = matchSpaiPrefix(currentLine.trimStart()) !== null;
      const atToken = extractAtQuery(textBefore);

      // Suppress file autocomplete popup if actively typing @project in SPAI context
      if ((isSpaiCommand || isSpaiLine) && atToken) {
        return false;
      }

      return (
        current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ??
        true
      );
    },
  };
}

/**
 * Handles argument completions specifically for `/spai new ...`
 */
export function getSpaiNewCompletions(
  newArgText: string,
  getProjects: () => ProjectSummary[] = loadAvailableProjects,
): AutocompleteItem[] | null {
  const atToken = extractAtQuery(newArgText);

  if (atToken) {
    const projects = getProjects();
    const matches = searchProjects(atToken.query, projects);
    if (matches.length === 0) return null;

    const tokenIdx = newArgText.lastIndexOf(atToken.rawToken);
    const prefixBefore = tokenIdx >= 0 ? newArgText.slice(0, tokenIdx) : "";

    return matches.slice(0, 25).map((p) => {
      const needsQuotes = p.name.includes(" ");
      const projToken = needsQuotes ? `@"${p.name}"` : `@${p.name}`;
      return {
        value: `new ${prefixBefore}${projToken} `,
        label: `@${p.name}`,
        description: p.type ? `[${p.type}] ${p.path}` : p.path,
      };
    });
  }

  // If user only typed "/spai new " or empty new args
  if (!newArgText.trim()) {
    return [
      {
        value: "new . ",
        label: ". <úkol>",
        description: "Nový otevřený úkol (todo)",
      },
      {
        value: "new ? ",
        label: "? <nápad>",
        description: "Nový nápad nebo koncept (idea)",
      },
      {
        value: "new - ",
        label: "- <poznámka>",
        description: "Nová poznámka nebo fakt (note)",
      },
      {
        value: "new ! . ",
        label: "! . <prioritní úkol>",
        description: "Úkol s vysokou prioritou (!high)",
      },
    ];
  }

  return null;
}
