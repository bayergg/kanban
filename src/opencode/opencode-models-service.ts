// Service for fetching OpenCode provider and model data via the opencode CLI.
// Follows the same pattern as src/cline-sdk/cline-provider-service.ts.

import { execSync } from "node:child_process";
import { isBinaryAvailableOnPath } from "../terminal/command-discovery";

const OPENCODE_BINARY = "opencode";

export interface OpenCodeProviderEntry {
	id: string;
	name: string;
}

export interface OpenCodeModelEntry {
	id: string;
	name: string;
	provider: string;
}

// --- In-memory cache ---

let _providersCache: OpenCodeProviderEntry[] | null = null;
const _modelsCache = new Map<string, OpenCodeModelEntry[]>();

// --- Helpers ---

function capitalizeWord(word: string): string {
	if (!word) return word;
	return word.charAt(0).toUpperCase() + word.slice(1);
}

function providerIdToDisplayName(id: string): string {
	// Handle known special cases
	if (id === "opencode") return "OpenCode";

	// Split on hyphens, capitalize each part
	const parts = id.split("-");
	const displayParts = parts.map((part) => {
		// Uppercase common acronyms
		if (part === "cn") return "CN";
		if (part === "ai") return "AI";
		return capitalizeWord(part);
	});
	return displayParts.join(" ");
}

function modelIdToDisplayName(id: string): string {
	// Split on hyphens, capitalize each part
	const parts = id.split("-");
	const displayParts = parts.map((part) => {
		if (part === "ai") return "AI";
		if (part === "cn") return "CN";
		return capitalizeWord(part);
	});
	return displayParts.join(" ");
}

function parseModelLine(line: string): { provider: string; model: string } | null {
	const trimmed = line.trim();
	if (!trimmed) return null;

	const slashIndex = trimmed.indexOf("/");
	if (slashIndex <= 0 || slashIndex === trimmed.length - 1) return null;

	const provider = trimmed.slice(0, slashIndex);
	const model = trimmed.slice(slashIndex + 1);
	if (!provider || !model) return null;

	return { provider, model };
}

// --- CLI execution ---

function getOpencodeModelsOutput(providerId?: string): string {
	const args = providerId ? [OPENCODE_BINARY, "models", providerId] : [OPENCODE_BINARY, "models"];
	try {
		return execSync(args.join(" "), {
			encoding: "utf-8",
			timeout: 30000,
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch {
		return "";
	}
}

function parseProvidersFromOutput(output: string): OpenCodeProviderEntry[] {
	const providerMap = new Map<string, string>();

	for (const line of output.split("\n")) {
		const parsed = parseModelLine(line);
		if (!parsed) continue;

		if (!providerMap.has(parsed.provider)) {
			providerMap.set(parsed.provider, providerIdToDisplayName(parsed.provider));
		}
	}

	return Array.from(providerMap.entries())
		.map(([id, name]) => ({ id, name }))
		.sort((a, b) => a.id.localeCompare(b.id));
}

function parseModelsFromOutput(output: string, providerId: string): OpenCodeModelEntry[] {
	const models: OpenCodeModelEntry[] = [];

	for (const line of output.split("\n")) {
		const parsed = parseModelLine(line);
		if (!parsed) continue;
		if (parsed.provider !== providerId) continue;

		models.push({
			id: `${parsed.provider}/${parsed.model}`,
			name: modelIdToDisplayName(parsed.model),
			provider: parsed.provider,
		});
	}

	return models;
}

// --- Public API ---

/** Returns true if the opencode binary is available on PATH. */
export function isOpenCodeInstalled(): boolean {
	return isBinaryAvailableOnPath(OPENCODE_BINARY);
}

/** Fetches all available providers from the opencode CLI. Returns cached data if available. */
export function fetchOpenCodeProviders(): OpenCodeProviderEntry[] {
	if (_providersCache) {
		return _providersCache;
	}

	if (!isOpenCodeInstalled()) {
		_providersCache = [];
		return [];
	}

	const output = getOpencodeModelsOutput();
	const providers = parseProvidersFromOutput(output);

	_providersCache = providers;
	return providers;
}

/** Fetches available models for a specific provider. Returns cached data if available. */
export function fetchOpenCodeModels(providerId: string): OpenCodeModelEntry[] {
	const cached = _modelsCache.get(providerId);
	if (cached) {
		return cached;
	}

	if (!isOpenCodeInstalled()) {
		_modelsCache.set(providerId, []);
		return [];
	}

	const output = getOpencodeModelsOutput(providerId);
	const models = parseModelsFromOutput(output, providerId);

	_modelsCache.set(providerId, models);
	return models;
}

/** Invalidates all caches (useful for testing or manual refresh). */
export function invalidateOpenCodeCache(): void {
	_providersCache = null;
	_modelsCache.clear();
}
