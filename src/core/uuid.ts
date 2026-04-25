/**
 * Generates a random UUID (v4).
 * Uses crypto.randomUUID() if available, otherwise falls back to crypto.getRandomValues().
 */
export function generateUuid(): string {
	// 1. Try standard Web Crypto randomUUID
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}

	// 2. Fallback to getRandomValues for older browsers/environments
	if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
		// @ts-expect-error - common UUID v4 generation using getRandomValues
		return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
			(c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
		);
	}

	// 3. Last resort fallback (not cryptographically secure)
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}
