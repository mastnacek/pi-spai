import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import {
  discoverAllProjects,
  searchProjects,
} from "./projects-discovery.js";
import {
  CACHE_PATH,
  getSpaiDirForProject,
  loadProjectsConfig,
  normalizePath,
  normalizeSortBy,
  scanRootDirectories,
  scanWorkspaceSubprojects,
  sortProjects,
  type GitInfo,
  type ProjectSummary,
  type ProjectsConfig,
} from "./projects-scanner.js";

export type { GitInfo, ProjectSummary, ProjectsConfig };
export {
  discoverAllProjects,
  getSpaiDirForProject,
  loadProjectsConfig,
  normalizePath,
  normalizeSortBy,
  scanRootDirectories,
  scanWorkspaceSubprojects,
  searchProjects,
  sortProjects,
};

let cachedProjectsMemory: ProjectSummary[] | null = null;

export function loadAvailableProjects(
  forceRefresh = false,
  workspaceCwd?: string,
): ProjectSummary[] {
  if (!forceRefresh && cachedProjectsMemory && cachedProjectsMemory.length > 0) {
    if (!workspaceCwd) {
      return cachedProjectsMemory;
    }
  }

  const config = loadProjectsConfig();
  const pinnedSet = new Set((config.pinnedPaths || []).map((p) => normalizePath(p)));
  const projects: ProjectSummary[] = [];
  const seenPaths = new Set<string>();

  // 1. Workspace-local subprojects (monorepo priority)
  const currentWorkspace = workspaceCwd || process.cwd();
  if (currentWorkspace) {
    const localSubs = scanWorkspaceSubprojects(currentWorkspace);
    for (const sub of localSubs) {
      if (!seenPaths.has(sub.path)) {
        seenPaths.add(sub.path);
        projects.push(sub);
      }
    }
  }

  // 2. Try reading pi-projects-cache.json
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

  // 3. Try reading manual projects from pi-projects.json
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

  // 4. Fallback: current directory and its parent's siblings if no projects found
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
 * Resolves a project identifier (path or name) into canonical project name and path.
 * Supports workspace-relative paths, monorepo subprojects, and absolute paths.
 */
export function resolveProjectFromIdentifier(
  identifier: string,
  getProjects: () => ProjectSummary[] = loadAvailableProjects,
  baseCwd?: string,
): { name: string; path?: string } {
  if (!identifier) return { name: "" };

  const trimmed = identifier.trim().replace(/^@"?|"?$/g, "");
  const normLower = normalizePath(trimmed.replace(/\/+$/, "")).toLowerCase();
  const idLower = trimmed.toLowerCase().replace(/\/+$/, "");
  const projects = getProjects();

  // 1. Exact or path match in available projects list
  for (const p of projects) {
    if (
      p.path.toLowerCase() === normLower ||
      normalizePath(p.path).toLowerCase() === normLower ||
      p.name.toLowerCase() === idLower
    ) {
      return { name: p.name, path: p.path };
    }
  }

  // 2. If baseCwd is provided, check direct resolution or monorepo subprojects
  if (baseCwd) {
    const normBase = normalizePath(baseCwd);
    const directRel = resolve(normBase, trimmed.replace(/\/+$/, ""));
    try {
      if (existsSync(directRel) && statSync(directRel).isDirectory()) {
        const normDirect = normalizePath(directRel);
        const pkgJson = join(normDirect, "package.json");
        let name = basename(normDirect);
        if (existsSync(pkgJson)) {
          try {
            const raw = readFileSync(pkgJson, "utf8");
            const parsed = JSON.parse(raw);
            if (typeof parsed?.name === "string") {
              name = parsed.name.replace(/^@[^/]+\//, "");
            }
          } catch {
            // ignore
          }
        }
        return { name, path: normDirect };
      }
    } catch {
      // ignore
    }

    // Check monorepo subprojects of baseCwd
    const subprojects = scanWorkspaceSubprojects(normBase);
    for (const sub of subprojects) {
      if (
        sub.name.toLowerCase() === idLower ||
        sub.path.toLowerCase() === normLower ||
        normalizePath(sub.path).toLowerCase() === normLower ||
        sub.relativePath?.toLowerCase() === idLower ||
        basename(sub.path).toLowerCase() === idLower
      ) {
        return { name: sub.name, path: sub.path };
      }
    }
  }

  // 3. Absolute path or path relative to process.cwd()
  const isPathLike = /[\\/:]/.test(trimmed) || isAbsolute(trimmed);
  const normProc = normalizePath(trimmed.replace(/\/+$/, ""));
  try {
    if (existsSync(normProc) && statSync(normProc).isDirectory()) {
      return { name: basename(normProc), path: normProc };
    }
  } catch {
    // Ignore
  }

  // 4. If path-like, also check if directory basename matches idLower
  if (isPathLike) {
    for (const p of projects) {
      const pNorm = normalizePath(p.path).toLowerCase();
      if (pNorm.endsWith(`/${idLower}`)) {
        return { name: p.name, path: p.path };
      }
    }
  }

  // 5. Fallback: scan workspace subprojects from process.cwd()
  if (!baseCwd) {
    const subprojects = scanWorkspaceSubprojects(process.cwd());
    for (const sub of subprojects) {
      if (
        sub.name.toLowerCase() === idLower ||
        sub.path.toLowerCase() === normLower ||
        normalizePath(sub.path).toLowerCase() === normLower ||
        sub.relativePath?.toLowerCase() === idLower ||
        basename(sub.path).toLowerCase() === idLower
      ) {
        return { name: sub.name, path: sub.path };
      }
    }
  }

  // 6. Direct child of process.cwd()
  try {
    const fromProc = resolve(process.cwd(), trimmed.replace(/\/+$/, ""));
    if (existsSync(fromProc) && statSync(fromProc).isDirectory()) {
      return { name: basename(fromProc), path: normalizePath(fromProc) };
    }
  } catch {
    // Ignore
  }

  // 7. Fallback to raw identifier
  return { name: trimmed, path: undefined };
}
