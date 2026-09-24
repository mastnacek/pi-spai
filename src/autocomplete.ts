import type {
  AutocompleteItem,
  AutocompleteProvider,
  AutocompleteSuggestions,
} from "@earendil-works/pi-tui";
import {
  type ProjectSummary,
  loadAvailableProjects,
  normalizePath,
  normalizeSortBy,
} from "./projects.js";

export function abbreviateRootOrigin(
  rootPath?: string,
  source?: string,
): string {
  if (!rootPath) {
    return source === "manual" ? "manual" : "root";
  }

  const norm = rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const driveMatch = norm.match(/^([A-Za-z]:)/);
  const drive = driveMatch ? driveMatch[1] : "";
  const parts = norm.split("/").filter(Boolean);
  const lastFolder = parts[parts.length - 1] || "";

  let shortFolder = lastFolder;
  if (shortFolder.length > 9) {
    if (shortFolder.includes("_")) {
      const segs = shortFolder.split("_");
      shortFolder = segs.map((s) => s.slice(0, 4)).join("_");
    } else if (shortFolder.includes("-")) {
      const segs = shortFolder.split("-");
      shortFolder = segs.map((s) => s.slice(0, 4)).join("-");
    } else {
      shortFolder = `${shortFolder.slice(0, 7)}..`;
    }
  }

  if (drive) {
    return `${drive}${shortFolder}`;
  }
  return shortFolder || "root";
}

export function extractAtToken(
  textBeforeCursor: string,
): { rawPrefix: string; query: string; isQuoted: boolean } | null {
  // Check unclosed quoted @"...
  const quoteMatch = textBeforeCursor.match(/(?:^|[ \t([{])(@"[^"\n]*)$/);
  if (quoteMatch) {
    const rawPrefix = quoteMatch[1] ?? "";
    const query = rawPrefix.slice(2);
    return { rawPrefix, query, isQuoted: true };
  }

  // Check bare @... (allowing colon for Windows drive letters like D:/...)
  const match = textBeforeCursor.match(/(?:^|[ \t([{])(@[^\s"(){}[\];!?]*)$/);
  if (match) {
    const rawPrefix = match[1] ?? "";
    const query = rawPrefix.slice(1);
    return { rawPrefix, query, isQuoted: false };
  }

  return null;
}

/**
 * Backward compatibility alias for extractAtToken.
 */
export function extractAtQuery(
  textBeforeCursor: string,
): { rawToken: string; query: string } | null {
  const t = extractAtToken(textBeforeCursor);
  if (!t) return null;
  return { rawToken: t.rawPrefix, query: t.query };
}

function scoreProject(proj: ProjectSummary, query: string): number {
  if (!query) return 1;

  const lowerQ = query.toLowerCase().replace(/\\/g, "/");
  const lowerName = proj.name.toLowerCase();
  const lowerPath = proj.path.toLowerCase().replace(/\\/g, "/");
  const lowerRel = proj.relativePath
    ? proj.relativePath.toLowerCase().replace(/\\/g, "/")
    : "";
  const lowerType = (proj.type || "").toLowerCase();
  const lowerBranch = proj.git?.branch ? proj.git.branch.toLowerCase() : "";

  // Exact path or name match
  if (
    lowerPath === lowerQ ||
    lowerPath + "/" === lowerQ ||
    lowerName === lowerQ
  )
    return 100;
  if (lowerName.startsWith(lowerQ)) return 85;
  if (lowerPath.startsWith(lowerQ) || lowerQ.startsWith(lowerPath)) return 80;
  if (lowerRel && lowerRel.startsWith(lowerQ)) return 75;
  if (lowerBranch === lowerQ) return 70;
  if (lowerName.includes(lowerQ)) return 60;
  if (lowerRel && lowerRel.includes(lowerQ)) return 50;
  if (lowerPath.includes(lowerQ)) return 40;
  if (lowerType && lowerType.startsWith(lowerQ)) return 30;

  return 0;
}

export function filterProjectsForAutocomplete(
  projects: ProjectSummary[],
  query: string,
  maxResults?: number,
  sortBy: string = "name",
): ProjectSummary[] {
  const normSort = normalizeSortBy(sortBy);

  if (!query) {
    const sorted = [...projects].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (normSort === "mtime") {
        if ((b.lastModified ?? 0) !== (a.lastModified ?? 0)) {
          return (b.lastModified ?? 0) - (a.lastModified ?? 0);
        }
      } else if (normSort === "root") {
        const rootA = (a.rootPath || a.source || "").toLowerCase();
        const rootB = (b.rootPath || b.source || "").toLowerCase();
        const cmp = rootA.localeCompare(rootB, undefined, {
          sensitivity: "base",
        });
        if (cmp !== 0) return cmp;
      } else if (normSort === "type") {
        const cmp = (a.type || "").localeCompare(b.type || "", undefined, {
          sensitivity: "base",
        });
        if (cmp !== 0) return cmp;
      } else if (normSort === "files") {
        if ((b.fileCount ?? 0) !== (a.fileCount ?? 0)) {
          return (b.fileCount ?? 0) - (a.fileCount ?? 0);
        }
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    return maxResults ? sorted.slice(0, maxResults) : sorted;
  }

  const scored = projects
    .map((p) => ({ project: p, score: scoreProject(p, query) }))
    .filter((entry) => entry.score > 0);

  scored.sort((a, b) => {
    if (a.project.pinned && !b.project.pinned) return -1;
    if (!a.project.pinned && b.project.pinned) return 1;
    if (b.score !== a.score) return b.score - a.score;
    if (normSort === "mtime") {
      if ((b.project.lastModified ?? 0) !== (a.project.lastModified ?? 0)) {
        return (b.project.lastModified ?? 0) - (a.project.lastModified ?? 0);
      }
    } else if (normSort === "root") {
      const rootA = (
        a.project.rootPath ||
        a.project.source ||
        ""
      ).toLowerCase();
      const rootB = (
        b.project.rootPath ||
        b.project.source ||
        ""
      ).toLowerCase();
      const cmp = rootA.localeCompare(rootB, undefined, {
        sensitivity: "base",
      });
      if (cmp !== 0) return cmp;
    }
    return a.project.name.localeCompare(b.project.name, undefined, {
      sensitivity: "base",
    });
  });

  return maxResults
    ? scored.slice(0, maxResults).map((e) => e.project)
    : scored.map((e) => e.project);
}

export function formatProjectAutocompleteItem(
  proj: ProjectSummary,
  isQuotedPrefix: boolean,
): AutocompleteItem {
  const normPath = normalizePath(proj.path);
  const pathValue = normPath.endsWith("/") ? normPath : `${normPath}/`;
  const needsQuotes = isQuotedPrefix || pathValue.includes(" ");

  const value = needsQuotes ? `@"${pathValue}"` : `@${pathValue}`;

  const pinIcon = proj.pinned ? "📌 " : proj.source === "manual" ? "📎 " : "";
  let gitTag = "";
  if (proj.git?.branch) {
    gitTag = ` (${proj.git.branch} ${proj.git.statusEmoji ?? ""})`.trim();
  } else if (proj.git?.statusEmoji) {
    gitTag = ` (${proj.git.statusEmoji})`;
  }

  const rootAbbrev = abbreviateRootOrigin(proj.rootPath, proj.source);

  // Check if project is nested within a subfolder
  let parentFolder = "";
  const rel = (proj.relativePath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (rel) {
    const segs = rel.split("/").filter(Boolean);
    if (segs.length > 1) {
      parentFolder = segs.slice(0, -1).join("/");
    }
  } else if (proj.rootPath) {
    const normRoot = proj.rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
    if (normPath.startsWith(normRoot)) {
      const subRel = normPath.slice(normRoot.length).replace(/^\/+|\/+$/g, "");
      const segs = subRel.split("/").filter(Boolean);
      if (segs.length > 1) {
        parentFolder = segs.slice(0, -1).join("/");
      }
    }
  }

  // Keep label concise and focused on project name
  const label = `📁 ${pinIcon}${proj.name}/${gitTag ? ` ${gitTag}` : ""}`;

  // Put tree hierarchy, technology, and origin in description
  const treePrefix = parentFolder ? `📁 ${parentFolder}/ └─ ` : "";
  const gitSummaryTag = proj.git?.statusSummary
    ? `[${proj.git.statusSummary}] `
    : "";

  return {
    value,
    label,
    description: `${treePrefix}[${proj.type || "General"}] ${gitSummaryTag}(${proj.fileCount ?? 0} souborů) [${rootAbbrev}]`,
  };
}

/**
 * Creates live TUI autocomplete provider that offers projects in the full scope
 * as configured by pi-projects.
 */
export function createSpaiAutocompleteProvider(
  current: AutocompleteProvider,
  getProjects: () => ProjectSummary[] = loadAvailableProjects,
  getSortBy: () => string = () => "name",
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

      // First check if current provider already returns rich project items (e.g. from pi-projects)
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

      // Base provider did not handle projects; provide full scope project items
      const allProjects = getProjects();
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
 * Handles argument completions specifically for `/spai new ...`
 */
export function getSpaiNewCompletions(
  newArgText: string,
  getProjects: () => ProjectSummary[] = loadAvailableProjects,
  getSortBy: () => string = () => "name",
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
        value: `new ${prefixBefore}${item.value} `,
        label: item.label,
        description: item.description,
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
