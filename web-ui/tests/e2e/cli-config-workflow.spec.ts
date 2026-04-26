import { expect, test } from "@playwright/test";

test.describe("CLI Configuration Workflow", () => {
	test.beforeEach(async ({ page }) => {
		// In a real app, we would navigate to the settings page and click the CLI Config tab
		// For this E2E test, we assume the component is rendered on its own route for testing
		await page.goto("/cli-config");
	});

	test("should complete the OpenCode configuration workflow", async ({ page }) => {
		// Select OpenCode (default)
		await expect(page.getByText("OpenCode")).toBeVisible();

		// Select Provider
		await page.getByLabel("Provider").selectOption("openai");

		// Select Model
		await page.getByLabel("Model").selectOption("gpt-4");

		// Select Agent
		await page.getByLabel("Agent").selectOption("cline");

		// Verify Command Preview
		const preview = page.locator('[data-testid="command-preview"]');
		await expect(preview).toContainText("opencode openai:gpt-4");
		await expect(preview).toContainText("--agent cline");

		// Copy to clipboard
		await page.getByRole("button", { name: /copy/i }).click();
		await expect(page.getByRole("button", { name: /copied/i })).toBeVisible();
	});

	test("should complete the Gemini configuration workflow", async ({ page }) => {
		// Switch to Gemini
		await page.getByText("Gemini").click();

		// Select Model
		await page.getByLabel("Model").selectOption("gemini-1.5-pro");

		// Adjust Temperature
		const slider = page.getByRole("slider");
		await slider.fill("0.2");

		// Enable YOLO mode
		await page.getByRole("switch", { name: /yolo mode/i }).click();

		// Confirm Security Warning
		await expect(page.getByText(/security warning: yolo mode/i)).toBeVisible();
		await page.getByRole("button", { name: /enable yolo mode/i }).click();

		// Verify Command Preview contains --yolo
		const preview = page.locator('[data-testid="command-preview"]');
		await expect(preview).toContainText("gemini --yolo");
		await expect(preview).toContainText("--temperature 0.2");
	});

	test("should complete the Codex configuration workflow", async ({ page }) => {
		// Switch to Codex
		await page.getByText("Codex").click();

		// Select Profile
		await page.getByLabel("Profile").selectOption("work");

		// Select Approval Policy
		await page.getByLabel("Approval Policy").selectOption("always");

		// Verify Command Preview
		const preview = page.locator('[data-testid="command-preview"]');
		await expect(preview).toContainText("codex --profile work");
		await expect(preview).toContainText("--approval-policy always");
	});

	test("should reset model when provider changes", async ({ page }) => {
		await page.getByLabel("Provider").selectOption("openai");
		await page.getByLabel("Model").selectOption("gpt-4");

		// Change provider
		await page.getByLabel("Provider").selectOption("anthropic");

		// Model should be reset
		await expect(page.getByLabel("Model")).toHaveValue("");
	});
});
