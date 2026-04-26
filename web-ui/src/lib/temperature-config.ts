/**
 * Temperature configuration for AI models.
 * Temperature values are floats between 0.0 and 1.0.
 */

export const TEMPERATURE_DEFAULTS = {
	OPENCODE: 0.0,
	GEMINI: 0.7,
	/** Codex does not support temperature configuration */
	CODEX: null,
} as const;

export const TEMPERATURE_RANGE = {
	MIN: 0.0,
	MAX: 1.0,
	STEP: 0.1,
} as const;

/**
 * Validates if a value is a valid temperature (float between 0.0 and 1.0).
 */
export function isValidTemperature(value: number): boolean {
	return !Number.isNaN(value) && value >= TEMPERATURE_RANGE.MIN && value <= TEMPERATURE_RANGE.MAX;
}

/**
 * Formats a temperature value to one decimal place.
 */
export function formatTemperature(value: number): string {
	return value.toFixed(1);
}
