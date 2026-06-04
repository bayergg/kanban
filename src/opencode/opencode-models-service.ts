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
	/**
	 * Model variant names (provider-specific reasoning efforts, e.g. "low", "high", "max").
	 * Derived from the model's `variants` object in `opencode models <provider> --verbose`.
	 * Empty when the model has no variants (e.g. non-reasoning models). Order is preserved
	 * from the OpenCode output.
	 */
	variants: string[];
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

function getOpencodeModelsOutput(providerId?: string, verbose?: boolean): string {
	const args = [OPENCODE_BINARY, "models"];
	if (providerId) {
		args.push(providerId);
	}
	if (verbose) {
		args.push("--verbose");
	}
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
			variants: [],
		});
	}

	return models;
}

/**
 * Parses the output of `opencode models <provider> --verbose`.
 *
 * Verbose output is a sequence of blocks, each made of a bare `provider/model`
 * header line (no leading whitespace) followed by the pretty-printed JSON of the
 * model (which always starts with a `{` on its own line). We detect each header,
 * then capture the following JSON object via brace counting and read the keys of
 * its `variants` object — those keys are the variant names (e.g. "high", "max").
 *
 * Falls back to the lightweight header-only parse (variants `[]`) when no JSON
 * block can be parsed, so the model list never breaks if the format changes.
 */
export function parseVerboseModelsOutput(output: string, providerId: string): OpenCodeModelEntry[] {
	const lines = output.split("\n");
	const models: OpenCodeModelEntry[] = [];
	let parsedAnyJson = false;

	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (line === undefined) {
			break;
		}

		// A header line is a non-indented `provider/model` line (not part of JSON).
		const isHeaderCandidate = line.length > 0 && line[0] !== " " && line[0] !== "\t" && line.trim() !== "{";
		const parsed = isHeaderCandidate ? parseModelLine(line) : null;
		if (!parsed || parsed.provider !== providerId) {
			i += 1;
			continue;
		}

		// Find the start of the JSON object (next line that is exactly `{`).
		let j = i + 1;
		while (j < lines.length && lines[j]?.trim() !== "{") {
			// Stop early if we hit the next header before any JSON.
			if (lines[j] && lines[j]?.[0] !== " " && lines[j]?.[0] !== "\t" && lines[j]?.trim() !== "") {
				break;
			}
			j += 1;
		}

		let variants: string[] = [];
		if (j < lines.length && lines[j]?.trim() === "{") {
			// Capture the JSON object via brace counting.
			let depth = 0;
			let end = j;
			const jsonLines: string[] = [];
			for (let k = j; k < lines.length; k += 1) {
				const jsonLine = lines[k] ?? "";
				jsonLines.push(jsonLine);
				for (const ch of jsonLine) {
					if (ch === "{") depth += 1;
					else if (ch === "}") depth -= 1;
				}
				end = k;
				if (depth === 0) {
					break;
				}
			}
			try {
				const model = JSON.parse(jsonLines.join("\n")) as { variants?: Record<string, unknown> };
				if (model.variants && typeof model.variants === "object") {
					variants = Object.keys(model.variants);
				}
				parsedAnyJson = true;
			} catch {
				// Leave variants empty for this block.
			}
			i = end + 1;
		} else {
			i += 1;
		}

		models.push({
			id: `${parsed.provider}/${parsed.model}`,
			name: modelIdToDisplayName(parsed.model),
			provider: parsed.provider,
			variants,
		});
	}

	// If we couldn't parse any JSON at all, fall back to the lightweight parser so
	// the model list still works (variants will be empty).
	if (!parsedAnyJson && models.length === 0) {
		return parseModelsFromOutput(output, providerId);
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

	// Use --verbose so each model carries its `variants` object, from which we
	// derive the per-model variant names (provider-specific reasoning efforts).
	const output = getOpencodeModelsOutput(providerId, true);
	const models = parseVerboseModelsOutput(output, providerId);

	_modelsCache.set(providerId, models);
	return models;
}

/** Invalidates all caches (useful for testing or manual refresh). */
export function invalidateOpenCodeCache(): void {
	_providersCache = null;
	_modelsCache.clear();
}
