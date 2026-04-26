import { useEffect, useState } from "react";
import type { Provider } from "../data/cli-models";

export function useOpenCodeProviders() {
	const [providers, setProviders] = useState<Provider[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		// Mocking the fetch from ~/.local/share/opencode/auth.json and env vars
		// as described in the prompt
		const fetchProviders = async () => {
			try {
				setIsLoading(true);
				// Simulate network delay
				await new Promise((resolve) => setTimeout(resolve, 500));

				const mockProviders: Provider[] = [
					{ id: "kimi", name: "Kimi For Coding" },
					{ id: "minimax-plan-io", name: "MiniMax Coding Plan (minimax.io)" },
					{ id: "minimax-plan-com", name: "MiniMax Coding Plan (minimaxi.com)" },
					{ id: "minimax-io", name: "MiniMax (minimax.io)" },
					{ id: "minimax-com", name: "MiniMax (minimaxi.com)" },
				];

				setProviders(mockProviders);
			} catch (_err) {
				setError("Failed to load OpenCode providers");
			} finally {
				setIsLoading(false);
			}
		};

		fetchProviders();
	}, []);

	return { providers, isLoading, error };
}
