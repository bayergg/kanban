import { useEffect, useState } from "react";
import type { Provider } from "../data/cli-models";
import { fetchOpenCodeProviders } from "../runtime/runtime-config-query";

export function useOpenCodeProviders() {
	const [providers, setProviders] = useState<Provider[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		const loadProviders = async () => {
			try {
				setIsLoading(true);
				setError(null);
				// Pass null workspaceId — opencode provider data is system-wide.
				const items = await fetchOpenCodeProviders(null);
				if (!cancelled) {
					setProviders(items);
				}
			} catch (_err) {
				if (!cancelled) {
					setError("Failed to load OpenCode providers");
					setProviders([]);
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		};

		loadProviders();

		return () => {
			cancelled = true;
		};
	}, []);

	return { providers, isLoading, error };
}
