import { existsSync, readdirSync, readFileSync } from "node:fs";
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

const CACHE_PATH = join(homedir(), ".pi", "agent", "pi-projects-cache.json");
const CONFIG_PATH = join(homedir(), ".pi", "agent", "pi-projects.json");

export function loadProjectsConfig(): ProjectsConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, "utf8");
      const parsed = JSON.parse(raw);
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
        sortBy: normalizeSortBy(parsed.sortBy),
        lastScanTime: parsed.lastScanTime,
      };
    }
  } catch {
    // Ignore config read error
  }

  return {
    roots: ["D:/01_programovani"],
    manualProjects: [],
    excludedPaths: [],
    pinnedPaths: [],
    maxDepth: 5,
    prependToAtAutocomplete: true,
    rescanIntervalMinutes: 30,
    sortBy: "name",
  };
}

/**
 * Scans filesystem root folders for projects with code markers or SPAI directories.
 */
function scanRootDirectories(roots: string[]): string[] {
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

let cachedProjectsMemory: ProjectSummary[] | null = null;

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

export function loadAvailableProjects(forceRefresh = false): ProjectSummary[] {
  if (!forceRefresh && cachedProjectsMemory && cachedProjectsMemory.length > 0) {
    return cachedProjectsMemory;
  }

  const config = loadProjectsConfig();
  const pinnedSet = new Set((config.pinnedPaths || []).map((p) => normalizePath(p)));
  const projects: ProjectSummary[] = [];
  const seenPaths = new Set<string>();

  // 1. Try reading pi-projects-cache.json (complete rich project index)
  if (existsSync(CACHE_PATH)) {
    try {
      const raw = readFileSync(CACHE_PATH, "utf8");
      const data = JSON.parse(raw);
      if (Array.isArray(data?.projects)) {
        for (const p of data.projects) {
          if (p?.name && p?.path) {
            const normPath = normalizePath(p.path);
            if (!seenPaths.has(normPath)) {
              seenPaths.add(normPath);
              projects.push({
                id: p.id,
                name: p.name,
                path: normPath,
                rootPath: p.rootPath ? normalizePath(p.rootPath) : undefined,
                relativePath: p.relativePath,
                type: p.type || "General",
                markers: Array.isArray(p.markers) ? p.markers : [],
                description: p.description,
                fileCount: typeof p.fileCount === "number" ? p.fileCount : 0,
                lastModified: typeof p.lastModified === "number" ? p.lastModified : 0,
                source: p.source || "scan",
                pinned: Boolean(p.pinned || pinnedSet.has(normPath)),
                git: p.git,
              });
            }
          }
        }
      }
    } catch {
      // Ignore parse failure
    }
  }

  // 2. Try reading manual projects from pi-projects.json
  if (Array.isArray(config.manualProjects)) {
    for (const p of config.manualProjects) {
      if (p?.path) {
        const normPath = normalizePath(p.path);
        if (!seenPaths.has(normPath)) {
          seenPaths.add(normPath);
          projects.push({
            name: p.name || basename(normPath),
            path: normPath,
            type: p.type || "Manual",
            description: p.description,
            source: "manual",
            pinned: pinnedSet.has(normPath),
            fileCount: 0,
            lastModified: 0,
          });
        }
      }
    }
  }

  // 3. Fallback: current directory and its parent's siblings if no projects found
  if (projects.length === 0) {
    const cwd = normalizePath(process.cwd());
    projects.push({
      name: basename(cwd),
      path: cwd,
      type: "Current",
      pinned: pinnedSet.has(cwd),
      fileCount: 0,
      lastModified: 0,
    });
    seenPaths.add(cwd);

    try {
      const parent = dirname(cwd);
      const entries = readdirSync(parent, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          const siblingPath = normalizePath(join(parent, entry.name));
          if (!seenPaths.has(siblingPath)) {
            seenPaths.add(siblingPath);
            projects.push({
              name: entry.name,
              path: siblingPath,
              pinned: pinnedSet.has(siblingPath),
              fileCount: 0,
              lastModified: 0,
            });
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  const sorted = sortProjects(projects, config.sortBy || "name");
  cachedProjectsMemory = sorted;
  return sorted;
}

/**
 * Aggregated multi-project discovery: pi-projects cache + manual config +
 * filesystem root scan. Only keeps projects with code markers or SPAI data.
 */
export function discoverAllProjects(): ProjectSummary[] {
  const projectMap = new Map<string, ProjectSummary>();

  // 1. Current working directory always included
  const currentCwd = normalizePath(process.cwd());
  const currentSpai = getSpaiDirForProject(currentCwd);
  projectMap.set(currentCwd, {
    name: basename(currentCwd),
    path: currentCwd,
    spaiDir: currentSpai,
    hasSpai: existsSync(currentSpai),
  });

  // 2. pi-projects cache + manual config
  for (const p of loadAvailableProjects(true)) {
    if (!projectMap.has(p.path)) {
      const spaiDir = getSpaiDirForProject(p.path);
      projectMap.set(p.path, {
        ...p,
        spaiDir,
        hasSpai: existsSync(spaiDir),
      });
    }
  }

  // 3. Filesystem root scan (only projects with code markers or SPAI)
  const config = loadProjectsConfig();
  for (const dir of scanRootDirectories(config.roots)) {
    if (!projectMap.has(dir)) {
      const spaiDir = getSpaiDirForProject(dir);
      const hasSpai = existsSync(spaiDir);
      const hasCodeMarker =
        hasSpai ||
        existsSync(join(dir, ".git")) ||
        existsSync(join(dir, "package.json")) ||
        existsSync(join(dir, "Cargo.toml"));

      if (hasCodeMarker) {
        projectMap.set(dir, {
          name: basename(dir),
          path: dir,
          spaiDir,
          hasSpai,
        });
      }
    }
  }

  const projects = Array.from(projectMap.values());
  projects.sort((a, b) => {
    if (a.hasSpai && !b.hasSpai) return -1;
    if (!a.hasSpai && b.hasSpai) return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return projects;
}

export function searchProjects(
  query: string,
  projects?: ProjectSummary[],
): ProjectSummary[] {
  const list = projects || loadAvailableProjects();
  if (!query.trim()) {
    return list;
  }

  const q = query.toLowerCase().replace(/^@/, "");
  return list
    .filter((p) => {
      const name = p.name.toLowerCase();
      const path = p.path.toLowerCase();
      return name.includes(q) || path.includes(q);
    })
    .sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      if (aName === q && bName !== q) return -1;
      if (bName === q && aName !== q) return 1;
      if (aName.startsWith(q) && !bName.startsWith(q)) return -1;
      if (bName.startsWith(q) && !aName.startsWith(q)) return 1;
      return aName.localeCompare(bName);
    });
}

/**
 * Resolves a project identifier (path or name) into canonical project name and path.
 */
export function resolveProjectFromIdentifier(
  identifier: string,
  getProjects: () => ProjectSummary[] = loadAvailableProjects,
): { name: string; path?: string } {
  if (!identifier) return { name: "" };

  const trimmed = identifier.trim().replace(/^@"?|"?$/g, "");
  const norm = normalizePath(trimmed.replace(/\/+$/, ""));
  const normLower = norm.toLowerCase();
  const idLower = trimmed.toLowerCase().replace(/\/+$/, "");
  const projects = getProjects();

  // 1. If it looks like a path (has slash, backslash or colon):
  const isPathLike = /[\\/:]/.test(trimmed);
  if (isPathLike) {
    for (const p of projects) {
      if (
        p.path.toLowerCase() === normLower ||
        normalizePath(p.path).toLowerCase() === normLower
      ) {
        return { name: p.name, path: p.path };
      }
    }

    try {
      if (existsSync(norm)) {
        return { name: basename(norm), path: norm };
      }
    } catch {
      // Ignore
    }
  }

  // 2. Exact name match (case-insensitive)
  for (const p of projects) {
    if (p.name.toLowerCase() === idLower) {
      return { name: p.name, path: p.path };
    }
  }

  // 3. If path-like, also check if directory basename matches idLower
  if (isPathLike) {
    for (const p of projects) {
      const pNorm = normalizePath(p.path).toLowerCase();
      if (pNorm.endsWith(`/${idLower}`)) {
        return { name: p.name, path: p.path };
      }
    }
  }

  // 4. If directory exists on disk directly
  try {
    if (existsSync(norm)) {
      return { name: basename(norm), path: norm };
    }
  } catch {
    // Ignore
  }

  // 5. Fallback to raw identifier
  return { name: trimmed, path: undefined };
}
