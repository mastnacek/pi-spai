import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, normalize, resolve } from "node:path";
export interface GitInfo {
  isGit?: boolean;
  branch?: string;
  clean?: boolean;
  statusEmoji?: string;
  modifiedCount?: number;
  stagedCount?: number;
  untrackedCount?: number;
  aheadCount?: number;
  behindCount?: number;
  statusSummary?: string;
}

export interface ProjectSummary {
  id?: string;
  name: string;
  path: string;
  rootPath?: string;
  relativePath?: string;
  type?: string;
  markers?: string[];
  description?: string;
  spaiDir?: string;
  hasSpai?: boolean;
  taskCount?: number;
  fileCount?: number;
  lastModified?: number;
  source?: "scan" | "manual" | "auto";
  pinned?: boolean;
  tags?: string[];
  git?: GitInfo;
}

export interface ProjectsConfig {
  roots: string[];
  manualProjects: Array<{ name?: string; path: string; type?: string; description?: string }>;
  excludedPaths: string[];
  pinnedPaths?: string[];
  maxDepth: number;
  prependToAtAutocomplete: boolean;
  rescanIntervalMinutes: number;
  sortBy?: "name" | "root" | "mtime" | "type" | "files" | "git";
  lastScanTime?: number;
}

/** agent dir root; `PI_CODING_AGENT_DIR` overrides it (tests, custom layouts). */
function agentDir(): string {
  const override = process.env.PI_CODING_AGENT_DIR?.trim();
  return override && override.length > 0 ? override : join(homedir(), ".pi", "agent");
}

export const CACHE_PATH = join(agentDir(), "pi-projects-cache.json");
export const CONFIG_PATH = join(agentDir(), "pi-projects.json");

export const MONOREPO_CONTAINERS = [
  "packages",
  "apps",
  "libs",
  "modules",
  "plugins",
  "services",
  "components",
  "crates",
];

export const PROJECT_CODE_MARKERS = [
  "package.json",
  "Cargo.toml",
  "pyproject.toml",
  "go.mod",
  ".git",
  join("docs", "spai"),
  join(".pi", "spai"),
];

export function normalizePath(p: string): string {
  const norm = normalize(resolve(p)).replace(/\\/g, "/");
  if (norm.length > 3 && norm.endsWith("/")) {
    return norm.slice(0, -1);
  }
  return norm;
}

export function getSpaiDirForProject(projectPath: string): string {
  const candidates = [
    join(projectPath, "docs", "spai"),
    join(projectPath, ".pi", "spai"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return normalizePath(c);
  }
  return normalizePath(join(projectPath, "docs", "spai"));
}

export function normalizeSortBy(
  s?: string,
): "name" | "root" | "mtime" | "type" | "files" | "git" {
  if (!s) return "name";
  const lower = s.toLowerCase().trim();
  if (lower === "root" || lower === "origin" || lower === "koren")
    return "root";
  if (
    lower === "mtime" ||
    lower === "date" ||
    lower === "time" ||
    lower === "cas"
  )
    return "mtime";
  if (lower === "type" || lower === "typ" || lower === "tech") return "type";
  if (lower === "files" || lower === "soubory" || lower === "count")
    return "files";
  if (lower === "git" || lower === "status") return "git";
  return "name";
}

/** Project layer of the shared pi-projects registry; wins over the global file. */
export function projectConfigPath(cwd: string): string {
  return join(cwd, ".pi", "pi-projects.json");
}

/** Session cwd the shared-registry cascade hangs off; unset = global file only. */
let projectsConfigCwd: string | undefined;

/**
 * Rebind the shared registry cascade to a session's project layer.
 * pi-projects writes `<cwd>/.pi/pi-projects.json` unless `--global` is given, so
 * /spai must read the same layers or the two commands would disagree about the
 * configured roots and the project list built from them.
 */
export function setProjectsConfigCwd(cwd?: string): void {
  projectsConfigCwd = cwd;
}

/** Raw contents of one cascade layer; `{}` when absent or unreadable. */
function readProjectsLayer(path: string | undefined): Record<string, unknown> {
  if (!path) return {};
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    }
  } catch {
    // Ignore config read error
  }
  return {};
}

/** Global layer, then the project layer overriding it key by key. */
export function loadProjectsConfig(
  cwd: string | undefined = projectsConfigCwd,
): ProjectsConfig {
  const parsed = {
    ...readProjectsLayer(CONFIG_PATH),
    ...readProjectsLayer(cwd ? projectConfigPath(cwd) : undefined),
  };

  return {
    roots: Array.isArray(parsed.roots)
      ? parsed.roots.map((r: string) => normalizePath(r))
      : ["D:/01_programovani"],
    manualProjects: Array.isArray(parsed.manualProjects)
      ? parsed.manualProjects
      : [],
    excludedPaths: Array.isArray(parsed.excludedPaths)
      ? parsed.excludedPaths.map((p: string) => normalizePath(p))
      : [],
    pinnedPaths: Array.isArray(parsed.pinnedPaths)
      ? parsed.pinnedPaths.map((p: string) => normalizePath(p))
      : [],
    maxDepth: typeof parsed.maxDepth === "number" ? parsed.maxDepth : 5,
    prependToAtAutocomplete:
      typeof parsed.prependToAtAutocomplete === "boolean"
        ? parsed.prependToAtAutocomplete
        : true,
    rescanIntervalMinutes:
      typeof parsed.rescanIntervalMinutes === "number"
        ? parsed.rescanIntervalMinutes
        : 30,
    sortBy: normalizeSortBy(parsed.sortBy as string | undefined),
    lastScanTime:
      typeof parsed.lastScanTime === "number" ? parsed.lastScanTime : undefined,
  };
}

export function scanRootDirectories(roots: string[]): string[] {
  const candidates = [
    ...roots,
    "D:/01_programovani",
    "C:/01_programovani",
    join(homedir(), "projects"),
    join(homedir(), "workspace"),
    join(homedir(), "dev"),
    dirname(process.cwd()),
  ];

  const results: string[] = [];
  const seen = new Set<string>();

  for (const root of candidates) {
    const normRoot = normalizePath(root);
    if (seen.has(normRoot)) continue;
    seen.add(normRoot);

    if (existsSync(normRoot)) {
      try {
        const entries = readdirSync(normRoot, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith(".")) {
            results.push(normalizePath(join(normRoot, entry.name)));
          }
        }
      } catch {
        // Ignore unreadable root
      }
    }
  }
  return results;
}

export function sortProjects(
  projects: ProjectSummary[],
  sortBy: string = "name",
): ProjectSummary[] {
  const normSort = normalizeSortBy(sortBy);
  return [...projects].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    if (normSort === "mtime") {
      if ((b.lastModified ?? 0) !== (a.lastModified ?? 0)) {
        return (b.lastModified ?? 0) - (a.lastModified ?? 0);
      }
    } else if (normSort === "root") {
      const rootA = (a.rootPath || a.source || "").toLowerCase();
      const rootB = (b.rootPath || b.source || "").toLowerCase();
      const cmp = rootA.localeCompare(rootB, undefined, { sensitivity: "base" });
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
}

/**
 * Scans workspace directory for monorepo subprojects and nested packages.
 */
export function scanWorkspaceSubprojects(workspaceCwd: string): ProjectSummary[] {
  const normBase = normalizePath(workspaceCwd);
  if (!existsSync(normBase)) return [];

  const subprojects: ProjectSummary[] = [];
  const seenPaths = new Set<string>();

  const checkDir = (dirPath: string, relPath: string, isContainerChild = false) => {
    const norm = normalizePath(dirPath);
    if (seenPaths.has(norm) || norm === normBase) return;

    try {
      if (!statSync(norm).isDirectory()) return;
    } catch {
      return;
    }

    let hasMarker = false;
    const markers: string[] = [];
    let detectedType = "General";
    let pkgName: string | undefined;

    for (const marker of PROJECT_CODE_MARKERS) {
      if (existsSync(join(norm, marker))) {
        hasMarker = true;
        markers.push(marker);
        if (marker === "package.json") {
          try {
            const raw = readFileSync(join(norm, "package.json"), "utf8");
            const parsed = JSON.parse(raw);
            if (typeof parsed?.name === "string") {
              pkgName = parsed.name.replace(/^@[^/]+\//, "");
            }
          } catch {
            // ignore
          }
          if (detectedType === "General") detectedType = "Node.js";
        } else if (marker === "Cargo.toml") {
          if (detectedType === "General") detectedType = "Rust";
        } else if (marker === "pyproject.toml") {
          if (detectedType === "General") detectedType = "Python";
        } else if (marker === "go.mod") {
          if (detectedType === "General") detectedType = "Go";
        }
      }
    }

    const spaiDir = getSpaiDirForProject(norm);
    const hasSpai = existsSync(spaiDir);

    if (hasMarker || hasSpai || isContainerChild) {
      seenPaths.add(norm);
      const name = pkgName || basename(norm);
      subprojects.push({
        name,
        path: norm,
        rootPath: normBase,
        relativePath: relPath.replace(/\\/g, "/"),
        type: detectedType,
        markers,
        spaiDir,
        hasSpai,
        source: "auto",
        pinned: true,
        fileCount: 0,
        lastModified: 0,
      });
    }
  };

  try {
    const entries = readdirSync(normBase, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (
        name.startsWith(".") ||
        name === "node_modules" ||
        name === "dist" ||
        name === "build" ||
        name === "coverage"
      ) {
        continue;
      }

      const fullSub = join(normBase, name);
      checkDir(fullSub, name);

      if (MONOREPO_CONTAINERS.includes(name.toLowerCase())) {
        try {
          const containerEntries = readdirSync(fullSub, { withFileTypes: true });
          for (const cEntry of containerEntries) {
            if (!cEntry.isDirectory() || cEntry.name.startsWith(".")) continue;
            checkDir(join(fullSub, cEntry.name), `${name}/${cEntry.name}`, true);
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  return subprojects;
}
