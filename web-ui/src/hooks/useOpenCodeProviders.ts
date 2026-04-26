import { useEffect, useState } from "react";
import type { Provider } from "../data/cli-models";

export function useOpenCodeProviders() {
	const [providers, setProviders] = useState<Provider[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchProviders = async () => {
			try {
				setIsLoading(true);
				// In a real app, this would be a TRPC/API call to the backend
				// which would execute `opencode providers list`.
				// For now, we update the mock with real data from the CLI.
				await new Promise((resolve) => setTimeout(resolve, 300));

				const mockProviders: Provider[] = [
					{ id: "opencode", name: "OpenCode" },
					{ id: "CrofAI", name: "CrofAI" },
					{ id: "kimi-for-coding", name: "Kimi For Coding" },
					{ id: "minimax", name: "MiniMax" },
					{ id: "minimax-cn", name: "MiniMax (CN)" },
					{ id: "minimax-cn-coding-plan", name: "MiniMax (CN Coding Plan)" },
					{ id: "minimax-coding-plan", name: "MiniMax (Coding Plan)" },
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
