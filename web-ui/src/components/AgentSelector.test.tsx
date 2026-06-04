import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentSelectorSelection } from "@/components/AgentSelector";
import type { Model } from "@/data/cli-models";

const useOpenCodeProvidersMock = vi.hoisted(() => vi.fn());
const useOpenCodeModelsMock = vi.hoisted(() => vi.fn());
const useOpenCodeAgentsMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useOpenCodeProviders", () => ({
	useOpenCodeProviders: useOpenCodeProvidersMock,
}));
vi.mock("@/hooks/useOpenCodeModels", () => ({
	useOpenCodeModels: useOpenCodeModelsMock,
}));
vi.mock("@/hooks/useOpenCodeAgents", () => ({
	useOpenCodeAgents: useOpenCodeAgentsMock,
}));

const ANTHROPIC_PROVIDER = { id: "anthropic", name: "Anthropic" };
const SONNET_WITH_VARIANTS: Model = {
	id: "anthropic/claude-sonnet-4-5",
	name: "Claude Sonnet 4.5",
	provider: "anthropic",
	variants: ["high", "max"],
};
const HAIKU_NO_VARIANTS: Model = {
	id: "anthropic/claude-3-5-haiku-latest",
	name: "Claude Haiku 3.5",
	provider: "anthropic",
	variants: [],
};

function mockHooks(models: Model[]): void {
	useOpenCodeProvidersMock.mockReturnValue({ providers: [ANTHROPIC_PROVIDER], isLoading: false });
	useOpenCodeAgentsMock.mockReturnValue({
		agents: [{ id: "build", name: "Build", type: "primary" }],
		isLoading: false,
	});
	useOpenCodeModelsMock.mockReturnValue({ models, isLoading: false });
}

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

describe("AgentSelector – OpenCode variant", () => {
	it("renders the Variant field and emits the parsed --variant from initial custom args", async () => {
		mockHooks([SONNET_WITH_VARIANTS, HAIKU_NO_VARIANTS]);
		const onSelectionChange = vi.fn();
		const { AgentSelector } = await import("@/components/AgentSelector");

		await act(async () =>
			root.render(
				<AgentSelector
					cli="opencode"
					onSelectionChange={onSelectionChange}
					initialCustomArgs={["--agent", "build", "--model", "anthropic/claude-sonnet-4-5", "--variant", "high"]}
				/>,
			),
		);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});

		// The Variant selector is rendered because the selected model has variants.
		expect(container.textContent).toContain("Variant");

		const lastCall = onSelectionChange.mock.calls.at(-1)?.[0] as AgentSelectorSelection | undefined;
		expect(lastCall).toMatchObject({
			agentId: "build",
			modelId: "anthropic/claude-sonnet-4-5",
			variant: "high",
		});
	});

	it("does not render the Variant field for a model with no variants", async () => {
		mockHooks([HAIKU_NO_VARIANTS]);
		const onSelectionChange = vi.fn();
		const { AgentSelector } = await import("@/components/AgentSelector");

		await act(async () =>
			root.render(
				<AgentSelector
					cli="opencode"
					onSelectionChange={onSelectionChange}
					initialCustomArgs={["--model", "anthropic/claude-3-5-haiku-latest"]}
				/>,
			),
		);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});

		expect(container.textContent).not.toContain("Variant");
		const lastCall = onSelectionChange.mock.calls.at(-1)?.[0] as AgentSelectorSelection | undefined;
		expect(lastCall?.variant).toBeUndefined();
	});

	it("drops a seeded variant that is not valid for the selected model once models load", async () => {
		// The saved task asked for "xhigh", but this model only supports high/max.
		mockHooks([SONNET_WITH_VARIANTS]);
		const onSelectionChange = vi.fn();
		const { AgentSelector } = await import("@/components/AgentSelector");

		await act(async () =>
			root.render(
				<AgentSelector
					cli="opencode"
					onSelectionChange={onSelectionChange}
					initialCustomArgs={["--model", "anthropic/claude-sonnet-4-5", "--variant", "xhigh"]}
				/>,
			),
		);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});

		const lastCall = onSelectionChange.mock.calls.at(-1)?.[0] as AgentSelectorSelection | undefined;
		expect(lastCall?.variant).toBeUndefined();
	});
});
