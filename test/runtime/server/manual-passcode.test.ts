/**
 * Unit tests for manual passcode setup in passcode-manager.ts.
 */

import { describe, expect, it } from "vitest";
import {
	generatePasscode,
	isPasscodeEnabled,
	issueSession,
	setPasscode,
	validatePasscode,
	validateSession,
} from "../../../src/security/passcode-manager";

describe("Manual passcode setup", () => {
	it("allows setting a manual passcode", () => {
		const manualValue = "my-secret-passcode";
		setPasscode(manualValue);
		expect(isPasscodeEnabled()).toBe(true);
		expect(validatePasscode(manualValue)).toBe(true);
		expect(validatePasscode("wrong")).toBe(false);
	});

	it("invalidates existing sessions when passcode is updated", () => {
		generatePasscode();
		const session = issueSession();
		expect(validateSession(session)).toBe(true);

		setPasscode("new-passcode");
		expect(validateSession(session)).toBe(false);
	});

	it("overwrites auto-generated passcode", () => {
		const autoValue = generatePasscode();
		expect(validatePasscode(autoValue)).toBe(true);

		const manualValue = "manual-override";
		setPasscode(manualValue);
		expect(validatePasscode(manualValue)).toBe(true);
		expect(validatePasscode(autoValue)).toBe(false);
	});
});
