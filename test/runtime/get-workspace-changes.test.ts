import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getWorkspaceChanges } from "../../src/workspace/get-workspace-changes";

function git(cwd: string, args: string[]): void {
	execFileSync("git", args, { cwd, stdio: ["ignore", "ignore", "ignore"] });
}

let repoRoot: string;

beforeEach(() => {
	repoRoot = mkdtempSync(join(tmpdir(), "kanban-wsc-"));
	git(repoRoot, ["init"]);
	git(repoRoot, ["config", "user.email", "test@example.com"]);
	git(repoRoot, ["config", "user.name", "Test"]);
	git(repoRoot, ["config", "commit.gpgsign", "false"]);
	writeFileSync(join(repoRoot, "small.txt"), "line1\nline2\n");
	git(repoRoot, ["add", "."]);
	git(repoRoot, ["commit", "-m", "initial"]);
});

afterEach(() => {
	rmSync(repoRoot, { recursive: true, force: true });
});

describe("getWorkspaceChanges – large file handling", () => {
	it("embeds contents for small files", async () => {
		writeFileSync(join(repoRoot, "small.txt"), "line1\nline2\nline3\n");

		const result = await getWorkspaceChanges(repoRoot);
		const small = result.files.find((f) => f.path === "small.txt");

		expect(small).toBeDefined();
		expect(small?.isTooLarge).toBeUndefined();
		expect(small?.newText).toContain("line3");
	});

	it("omits contents and flags isTooLarge for a large untracked file without crashing", async () => {
		// > 2 MB untracked file. Embedding its content previously bloated the
		// response; now it must be omitted and flagged.
		const bigContent = `${"x".repeat(3 * 1024 * 1024)}\n`;
		writeFileSync(join(repoRoot, "big.csv"), bigContent);

		const result = await getWorkspaceChanges(repoRoot);
		const big = result.files.find((f) => f.path === "big.csv");

		expect(big).toBeDefined();
		expect(big?.isTooLarge).toBe(true);
		expect(big?.newText).toBeNull();
		expect(big?.oldText).toBeNull();

		// The whole response must serialize well under V8's max string length.
		const serialized = JSON.stringify(result);
		expect(serialized.length).toBeLessThan(1024 * 1024);
	});

	it("omits contents for a large modified tracked file but keeps diff stats", async () => {
		// Commit a large file, then modify it. Both sides exceed the cap.
		const bigContent = `${"y".repeat(3 * 1024 * 1024)}\n`;
		writeFileSync(join(repoRoot, "data.bin"), bigContent);
		git(repoRoot, ["add", "."]);
		git(repoRoot, ["commit", "-m", "add big"]);
		writeFileSync(join(repoRoot, "data.bin"), `${bigContent}extra-line\n`);

		const result = await getWorkspaceChanges(repoRoot);
		const big = result.files.find((f) => f.path === "data.bin");

		expect(big).toBeDefined();
		expect(big?.isTooLarge).toBe(true);
		expect(big?.oldText).toBeNull();
		expect(big?.newText).toBeNull();
		expect(big?.status).toBe("modified");
		// numstat-derived additions are still reported (content not embedded).
		expect(big?.additions).toBeGreaterThanOrEqual(1);
	});
});
