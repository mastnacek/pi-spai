import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The module computes CONFIG_PATH at load time, so the agent dir must be
// redirected before it is imported — hence the dynamic import in `before`.
const root = mkdtempSync(join(tmpdir(), "pi-spai-cascade-"));
const agentDir = join(root, "agent");
const projectDir = join(root, "project");
mkdirSync(agentDir, { recursive: true });
mkdirSync(join(projectDir, ".pi"), { recursive: true });
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;

describe("pi-spai shared pi-projects registry cascade", () => {
	let scanner: typeof import("../src/projects-scanner.js");

	before(async () => {
		scanner = await import("../src/projects-scanner.js");
	});

	after(() => {
		if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		scanner?.setProjectsConfigCwd(undefined);
		rmSync(root, { recursive: true, force: true });
	});

	it("points the shared registry at the redirected agent dir", () => {
		assert.strictEqual(scanner.CONFIG_PATH, join(agentDir, "pi-projects.json"));
		assert.strictEqual(
			scanner.projectConfigPath(projectDir),
			join(projectDir, ".pi", "pi-projects.json"),
		);
	});

	it("reads the global layer when no project layer exists", () => {
		writeFileSync(
			scanner.CONFIG_PATH,
			JSON.stringify({ maxDepth: 7, roots: ["D:/from-global"] }),
			"utf8",
		);

		const config = scanner.loadProjectsConfig(projectDir);
		assert.strictEqual(config.maxDepth, 7);
		assert.deepStrictEqual(config.roots, [scanner.normalizePath("D:/from-global")]);
	});

	it("lets the project layer override the global layer key by key", () => {
		writeFileSync(
			scanner.projectConfigPath(projectDir),
			JSON.stringify({ maxDepth: 2 }),
			"utf8",
		);

		const config = scanner.loadProjectsConfig(projectDir);
		assert.strictEqual(config.maxDepth, 2, "the project layer must win");
		assert.deepStrictEqual(
			config.roots,
			[scanner.normalizePath("D:/from-global")],
			"untouched global keys must survive",
		);
	});

	it("follows the session cwd registered by setProjectsConfigCwd", () => {
		scanner.setProjectsConfigCwd(projectDir);
		assert.strictEqual(scanner.loadProjectsConfig().maxDepth, 2);

		scanner.setProjectsConfigCwd(undefined);
		assert.strictEqual(
			scanner.loadProjectsConfig().maxDepth,
			7,
			"without a session cwd only the global layer applies",
		);
	});
});
