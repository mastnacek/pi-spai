import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import {
  getSpaiDirForProject,
  loadProjectsConfig,
  normalizePath,
  scanRootDirectories,
  scanWorkspaceSubprojects,
  type ProjectSummary,
} from "./projects-scanner.js";
import { loadAvailableProjects } from "./projects.js";

/**
 * Aggregated multi-project discovery: pi-projects cache + manual config +
 * filesystem root scan + monorepo subprojects.
 */
export function discoverAllProjects(workspaceCwd?: string): ProjectSummary[] {
  const projectMap = new Map<string, ProjectSummary>();

  // 1. Current working directory always included
  const currentCwd = normalizePath(workspaceCwd || process.cwd());
  const currentSpai = getSpaiDirForProject(currentCwd);
  projectMap.set(currentCwd, {
    name: basename(currentCwd),
    path: currentCwd,
    spaiDir: currentSpai,
    hasSpai: existsSync(currentSpai),
  });

  // 2. Discover workspace subprojects (monorepo)
  const localSubs = scanWorkspaceSubprojects(currentCwd);
  for (const sub of localSubs) {
    if (!projectMap.has(sub.path)) {
      projectMap.set(sub.path, sub);
    }
  }

  // 3. pi-projects cache + manual config
  for (const p of loadAvailableProjects(true, currentCwd)) {
    if (!projectMap.has(p.path)) {
      const spaiDir = getSpaiDirForProject(p.path);
      projectMap.set(p.path, {
        ...p,
        spaiDir,
        hasSpai: existsSync(spaiDir),
      });
    }
  }

  // 4. Filesystem root scan (only projects with code markers or SPAI)
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
