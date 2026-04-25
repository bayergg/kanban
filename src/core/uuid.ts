/**
 * Generates a random UUID (v4).
 * Uses crypto.randomUUID() if available, otherwise falls back to crypto.getRandomValues().
 */
export function generateUuid(): string {
	// 1. Try standard Web Crypto randomUUID
	const c = typeof crypto !== "undefined" ? crypto : undefined;
	if (c && typeof c.randomUUID === "function") {
		return c.randomUUID();
	}

	// 2. Fallback to getRandomValues for older browsers/environments
	if (c && typeof c.getRandomValues === "function") {
		// @ts-expect-error - common UUID v4 generation using getRandomValues
		return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (ch) => {
			const arr = new Uint8Array(1);
			c.getRandomValues(arr);
			const val = arr[0] ?? 0;
			return (Number.parseInt(ch, 10) ^ (val & (15 >> (Number.parseInt(ch, 10) / 4)))).toString(16);
		});
	}

	// 3. Last resort fallback (not cryptographically secure)
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}
