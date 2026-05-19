import { execSync } from "node:child_process";
import { isBinaryAvailableOnPath } from "../terminal/command-discovery";

const OPENCODE_BINARY = "opencode";

export interface OpenCodeAgentEntry {
	id: string;
	name: string;
	type: string;
}

let _agentsCache: OpenCodeAgentEntry[] | null = null;

function capitalizeWord(word: string): string {
	if (!word) return word;
	return word.charAt(0).toUpperCase() + word.slice(1);
}

function parseAgentLine(line: string): { name: string; type: string } | null {
	const trimmed = line.trim();
	if (!trimmed) return null;

	const match = trimmed.match(/^(\S+)\s+\((\w+)\)$/);
	if (!match) return null;

	return { name: match[1] ?? "", type: match[2] ?? "" };
}

function getOpencodeAgentsOutput(): string {
	try {
		return execSync([OPENCODE_BINARY, "agent", "list"].join(" "), {
			encoding: "utf-8",
			timeout: 30000,
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch {
		return "";
	}
}

function parseAgentsFromOutput(output: string): OpenCodeAgentEntry[] {
	const agents: OpenCodeAgentEntry[] = [];

	for (const line of output.split("\n")) {
		const parsed = parseAgentLine(line);
		if (!parsed) continue;
		if (parsed.type !== "primary") continue;

		agents.push({
			id: parsed.name,
			name: capitalizeWord(parsed.name),
			type: parsed.type,
		});
	}

	return agents;
}

export function isOpenCodeInstalled(): boolean {
	return isBinaryAvailableOnPath(OPENCODE_BINARY);
}

export function fetchOpenCodeAgents(): OpenCodeAgentEntry[] {
	if (_agentsCache) {
		return _agentsCache;
	}

	if (!isOpenCodeInstalled()) {
		_agentsCache = [];
		return [];
	}

	const output = getOpencodeAgentsOutput();
	const agents = parseAgentsFromOutput(output);

	_agentsCache = agents;
	return agents;
}

export function invalidateOpenCodeCache(): void {
	_agentsCache = null;
}
