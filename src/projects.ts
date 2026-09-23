import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, normalize, resolve } from "node:path";

export interface ProjectSummary {
  name: string;
  path: string;
  type?: string;
  description?: string;
  spaiDir?: string;
  hasSpai?: boolean;
  taskCount?: number;
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

/**
 * Scans filesystem root folders (e.g. D:/01_programovani) for projects with
 * code markers or SPAI directories. Ported from herdr spai.ledger plugin.
 */
function scanRootDirectories(): string[] {
  const candidates = [
    "D:/01_programovani",
    "C:/01_programovani",
    join(homedir(), "projects"),
    join(homedir(), "workspace"),
    join(homedir(), "dev"),
    dirname(process.cwd()),
  ];

  const results: string[] = [];
  for (const root of candidates) {
    if (existsSync(root)) {
      try {
        const entries = readdirSync(root, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith(".")) {
            results.push(normalizePath(join(root, entry.name)));
          }
        }
      } catch {
        // Ignore unreadable root
      }
    }
  }
  return results;
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
        path: p.path,
        spaiDir,
        hasSpai: existsSync(spaiDir),
      });
    }
  }

  // 3. Filesystem root scan (only projects with code markers or SPAI)
  for (const dir of scanRootDirectories()) {
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

const CACHE_PATH = join(homedir(), ".pi", "agent", "pi-projects-cache.json");
const CONFIG_PATH = join(homedir(), ".pi", "agent", "pi-projects.json");

let cachedProjectsMemory: ProjectSummary[] | null = null;

export function loadAvailableProjects(forceRefresh = false): ProjectSummary[] {
  if (!forceRefresh && cachedProjectsMemory && cachedProjectsMemory.length > 0) {
    return cachedProjectsMemory;
  }

  const projects: ProjectSummary[] = [];
  const seenPaths = new Set<string>();

  // 1. Try reading pi-projects-cache.json
  if (existsSync(CACHE_PATH)) {
    try {
      const raw = readFileSync(CACHE_PATH, "utf8");
      const data = JSON.parse(raw);
      if (Array.isArray(data?.projects)) {
        for (const p of data.projects) {
          if (p?.name && p?.path) {
            const normPath = normalize(resolve(p.path)).replace(/\\/g, "/");
            if (!seenPaths.has(normPath)) {
              seenPaths.add(normPath);
              projects.push({
                name: p.name,
                path: normPath,
                type: p.type,
                description: p.description,
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
  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = readFileSync(CONFIG_PATH, "utf8");
      const data = JSON.parse(raw);
      if (Array.isArray(data?.manualProjects)) {
        for (const p of data.manualProjects) {
          if (p?.path) {
            const normPath = normalize(resolve(p.path)).replace(/\\/g, "/");
            if (!seenPaths.has(normPath)) {
              seenPaths.add(normPath);
              projects.push({
                name: p.name || basename(normPath),
                path: normPath,
                type: p.type || "Manual",
                description: p.description,
              });
            }
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  // 3. Fallback: current directory and its parent's siblings if no projects found
  if (projects.length === 0) {
    const cwd = normalize(resolve(process.cwd())).replace(/\\/g, "/");
    projects.push({
      name: basename(cwd),
      path: cwd,
      type: "Current",
    });
    seenPaths.add(cwd);

    try {
      const parent = dirname(cwd);
      const entries = readdirSync(parent, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          const siblingPath = join(parent, entry.name).replace(/\\/g, "/");
          if (!seenPaths.has(siblingPath)) {
            seenPaths.add(siblingPath);
            projects.push({
              name: entry.name,
              path: siblingPath,
            });
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  cachedProjectsMemory = projects;
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
