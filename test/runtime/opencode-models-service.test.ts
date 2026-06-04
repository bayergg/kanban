import { describe, expect, it } from "vitest";

import { parseVerboseModelsOutput } from "../../src/opencode/opencode-models-service";

// Helpers to build realistic `opencode models <provider> --verbose` output:
// a bare `provider/model` header line followed by the pretty-printed model JSON.
function block(providerModel: string, model: Record<string, unknown>): string {
	return `${providerModel}\n${JSON.stringify(model, null, 2)}`;
}

describe("parseVerboseModelsOutput", () => {
	it("returns empty variants for a model with no variants", () => {
		const output = block("anthropic/claude-3-5-haiku-latest", {
			id: "claude-3-5-haiku-latest",
			providerID: "anthropic",
			name: "Claude Haiku 3.5 (latest)",
			variants: {},
		});

		const models = parseVerboseModelsOutput(output, "anthropic");

		expect(models).toEqual([
			{
				id: "anthropic/claude-3-5-haiku-latest",
				name: expect.any(String),
				provider: "anthropic",
				variants: [],
			},
		]);
	});

	it("extracts variant names and preserves their order", () => {
		const output = block("anthropic/claude-sonnet-4-5", {
			id: "claude-sonnet-4-5",
			providerID: "anthropic",
			name: "Claude Sonnet 4.5",
			variants: {
				high: { thinking: { type: "enabled", budgetTokens: 16000 } },
				max: { thinking: { type: "enabled", budgetTokens: 31999 } },
			},
		});

		const models = parseVerboseModelsOutput(output, "anthropic");

		expect(models).toHaveLength(1);
		expect(models[0]?.variants).toEqual(["high", "max"]);
	});

	it("handles adaptive models with low/medium/high/max order", () => {
		const output = block("anthropic/claude-opus-4-6", {
			id: "claude-opus-4-6",
			providerID: "anthropic",
			name: "Claude Opus 4.6",
			variants: {
				low: { effort: "low" },
				medium: { effort: "medium" },
				high: { effort: "high" },
				max: { effort: "max" },
			},
		});

		const models = parseVerboseModelsOutput(output, "anthropic");

		expect(models[0]?.variants).toEqual(["low", "medium", "high", "max"]);
	});

	it("parses multiple model blocks and filters by provider", () => {
		const output = [
			block("anthropic/claude-3-5-haiku-latest", {
				id: "claude-3-5-haiku-latest",
				variants: {},
			}),
			block("anthropic/claude-sonnet-4-5", {
				id: "claude-sonnet-4-5",
				variants: { high: {}, max: {} },
			}),
			// A different provider's block must be ignored when filtering anthropic.
			block("openai/gpt-5", {
				id: "gpt-5",
				variants: { minimal: {}, low: {}, medium: {}, high: {} },
			}),
		].join("\n");

		const models = parseVerboseModelsOutput(output, "anthropic");

		expect(models.map((m) => m.id)).toEqual(["anthropic/claude-3-5-haiku-latest", "anthropic/claude-sonnet-4-5"]);
		expect(models[0]?.variants).toEqual([]);
		expect(models[1]?.variants).toEqual(["high", "max"]);
	});

	it("keeps the model with empty variants when its JSON is malformed", () => {
		// Header present but the following JSON is truncated/unparseable.
		const output = 'anthropic/claude-broken\n{\n  "id": "claude-broken",\n  "variants": {';

		const models = parseVerboseModelsOutput(output, "anthropic");

		expect(models).toEqual([
			{
				id: "anthropic/claude-broken",
				name: expect.any(String),
				provider: "anthropic",
				variants: [],
			},
		]);
	});

	it("falls back to header-only parsing when there is no JSON at all", () => {
		// Non-verbose style output (just `provider/model` lines).
		const output = ["anthropic/claude-sonnet-4-5", "anthropic/claude-3-5-haiku-latest"].join("\n");

		const models = parseVerboseModelsOutput(output, "anthropic");

		expect(models.map((m) => m.id)).toEqual(["anthropic/claude-sonnet-4-5", "anthropic/claude-3-5-haiku-latest"]);
		expect(models.every((m) => m.variants.length === 0)).toBe(true);
	});

	it("handles model ids that contain a slash (provider split on first slash)", () => {
		const output = block("openrouter/anthropic/claude-sonnet-4-5", {
			id: "anthropic/claude-sonnet-4-5",
			variants: { high: {}, max: {} },
		});

		const models = parseVerboseModelsOutput(output, "openrouter");

		expect(models).toHaveLength(1);
		expect(models[0]?.id).toBe("openrouter/anthropic/claude-sonnet-4-5");
		expect(models[0]?.provider).toBe("openrouter");
		expect(models[0]?.variants).toEqual(["high", "max"]);
	});
});
