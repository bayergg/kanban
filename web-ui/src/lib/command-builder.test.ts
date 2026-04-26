import { describe, expect, it } from "vitest";
import { buildCommand, type CommandOptions, validateCommandOptions } from "./command-builder";

describe("command-builder", () => {
	describe("validateCommandOptions", () => {
		it("should require provider and model for opencode", () => {
			const options: CommandOptions = {
				format: "opencode",
				flags: {},
			};
			const result = validateCommandOptions(options);
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain("Provider is required for OpenCode format");
			expect(result.errors).toContain("Model is required for OpenCode format");
		});

		it("should be valid for opencode when provider and model are present", () => {
			const options: CommandOptions = {
				format: "opencode",
				provider: "openai",
				model: "gpt-4",
				flags: {},
			};
			const result = validateCommandOptions(options);
			expect(result.isValid).toBe(true);
		});

		it("should be valid for gemini without extra fields", () => {
			const options: CommandOptions = {
				format: "gemini",
				flags: {},
			};
			const result = validateCommandOptions(options);
			expect(result.isValid).toBe(true);
		});

		it("should be valid for codex without extra fields", () => {
			const options: CommandOptions = {
				format: "codex",
				flags: {},
			};
			const result = validateCommandOptions(options);
			expect(result.isValid).toBe(true);
		});
	});

	describe("buildCommand", () => {
		it("should build opencode command correctly with agent", () => {
			const options: CommandOptions = {
				format: "opencode",
				provider: "openai",
				model: "gpt-4",
				agent: "cline",
				flags: {
					"dangerously-skip-permissions": true,
				},
			};
			const command = buildCommand(options);
			expect(command).toBe("opencode openai:gpt-4 --agent cline --dangerously-skip-permissions");
		});

		it("should build gemini command correctly", () => {
			const options: CommandOptions = {
				format: "gemini",
				flags: {
					yolo: true,
					sandbox: false,
				},
			};
			const command = buildCommand(options);
			expect(command).toBe("gemini --yolo");
		});

		it("should build codex command correctly with profile", () => {
			const options: CommandOptions = {
				format: "codex",
				profile: "work",
				flags: {
					"dangerously-bypass-approvals-and-sandbox": true,
				},
			};
			const command = buildCommand(options);
			expect(command).toBe("codex --profile work --dangerously-bypass-approvals-and-sandbox");
		});

		it("should handle string and number flags", () => {
			const options: CommandOptions = {
				format: "gemini",
				flags: {
					temperature: 0.7,
					"top-p": "0.9",
				},
			};
			const command = buildCommand(options);
			expect(command).toBe("gemini --temperature 0.7 --top-p 0.9");
		});

		it("should ignore false and undefined flags", () => {
			const options: CommandOptions = {
				format: "gemini",
				flags: {
					yolo: false,
					sandbox: true,
					extra: undefined,
				},
			};
			const command = buildCommand(options);
			expect(command).toBe("gemini --sandbox");
		});
	});
});
