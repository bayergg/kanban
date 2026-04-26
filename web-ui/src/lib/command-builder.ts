export type CommandFormat = "opencode" | "gemini" | "codex";

export interface CommandOptions {
	format: CommandFormat;
	provider?: string;
	model?: string;
	agent?: string;
	flags: Record<string, boolean | string | number | undefined>;
}

export interface ValidationResult {
	isValid: boolean;
	errors: string[];
}

export function validateCommandOptions(options: CommandOptions): ValidationResult {
	const errors: string[] = [];

	if (options.format === "opencode") {
		if (!options.provider) {
			errors.push("Provider is required for OpenCode format");
		}
		if (!options.model) {
			errors.push("Model is required for OpenCode format");
		}
	}

	return {
		isValid: errors.length === 0,
		errors,
	};
}

export function buildCommand(options: CommandOptions): string {
	const { format, provider, model, agent, flags } = options;
	const parts: string[] = [];

	if (format === "opencode") {
		parts.push("opencode");
		if (provider && model) {
			parts.push(`${provider}:${model}`);
		}
		if (agent) {
			parts.push("--agent");
			parts.push(agent);
		}
	} else if (format === "gemini") {
		parts.push("gemini");
	} else if (format === "codex") {
		parts.push("codex");
	}

	// Add flags
	Object.entries(flags).forEach(([key, value]) => {
		if (value === true) {
			parts.push(`--${key}`);
		} else if (value !== false && value !== undefined && value !== "") {
			parts.push(`--${key}`);
			parts.push(String(value));
		}
	});

	return parts.join(" ");
}
