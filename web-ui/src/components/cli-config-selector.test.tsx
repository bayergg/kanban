import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIConfigSelector } from "./cli-config-selector";

// Mock the CommandPreview and PermissionFlags to focus on selector logic
vi.mock("./command-preview", () => ({
	CommandPreview: ({ options }: any) => (
		<div data-testid="command-preview">
			Command: {options.format} {options.provider} {options.model} {options.agent} {options.profile}
		</div>
	),
}));

describe("CLIConfigSelector", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.restoreAllMocks();
	});

	const waitFor = async (ms = 0) => {
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, ms));
		});
	};

	it("renders correctly with default OpenCode selection", async () => {
		await act(async () => root.render(<CLIConfigSelector />));

		expect(container.textContent).toContain("CLI Configuration");
		expect(container.textContent).toContain("OpenCode");

		// Wait for providers to load
		await waitFor(600);

		expect(container.textContent).toContain("OpenAI");
	});

	it("switches formats and resets selections", async () => {
		await act(async () => root.render(<CLIConfigSelector />));
		await waitFor(600);

		// Select OpenAI
		const selects = container.querySelectorAll("select");
		const providerSelect = selects[0];

		await act(async () => {
			providerSelect.value = "openai";
			providerSelect.dispatchEvent(new Event("change", { bubbles: true }));
		});

		await waitFor(100);

		const modelSelect = container.querySelectorAll("select")[1];
		await act(async () => {
			modelSelect.value = "gpt-4";
			modelSelect.dispatchEvent(new Event("change", { bubbles: true }));
		});

		const preview = container.querySelector('[data-testid="command-preview"]');
		expect(preview?.textContent).toContain("opencode openai gpt-4");

		// Switch to Gemini
		const geminiButton = Array.from(container.querySelectorAll("button")).find((b) =>
			b.textContent?.includes("Gemini"),
		);
		await act(async () => {
			geminiButton?.click();
		});

		expect(preview?.textContent).toContain("gemini");

		// Switch to Codex
		const codexButton = Array.from(container.querySelectorAll("button")).find((b) =>
			b.textContent?.includes("Codex"),
		);
		await act(async () => {
			codexButton?.click();
		});
		await waitFor(600);

		expect(preview?.textContent).toContain("codex");
		expect(container.textContent).toContain("Work Profile");
	});

	it("validates temperature range for Gemini", async () => {
		await act(async () => root.render(<CLIConfigSelector />));

		const geminiButton = Array.from(container.querySelectorAll("button")).find((b) =>
			b.textContent?.includes("Gemini"),
		);
		await act(async () => geminiButton?.click());

		const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
		await act(async () => {
			// React 16+ value setter hack
			const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
			setter?.call(slider, "0.2");
			slider.dispatchEvent(new Event("input", { bubbles: true }));
		});

		expect(container.textContent).toContain("Temperature (0.2)");
	});
});
