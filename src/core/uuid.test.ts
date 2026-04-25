import { afterEach, describe, expect, it, vi } from "vitest";
import { generateUuid } from "./uuid";

describe("uuid", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("generates a valid UUID v4 using crypto.randomUUID if available", () => {
		const mockUuid = "550e8400-e29b-41d4-a716-446655440000";
		const randomUUID = vi.fn().mockReturnValue(mockUuid);

		vi.stubGlobal("crypto", { randomUUID });

		const result = generateUuid();
		expect(result).toBe(mockUuid);
		expect(randomUUID).toHaveBeenCalled();
	});

	it("falls back to getRandomValues if randomUUID is not available", () => {
		const getRandomValues = vi.fn().mockImplementation((arr) => {
			for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
			return arr;
		});

		vi.stubGlobal("crypto", {
			randomUUID: undefined,
			getRandomValues,
		});

		const result = generateUuid();
		expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
		expect(getRandomValues).toHaveBeenCalled();
	});

	it("falls back to Math.random if crypto is completely unavailable", () => {
		vi.stubGlobal("crypto", undefined);

		const result = generateUuid();
		expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
	});
});
