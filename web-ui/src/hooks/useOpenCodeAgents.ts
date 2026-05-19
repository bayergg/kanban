import { useEffect, useState } from "react";
import type { Agent } from "../data/cli-models";
import { fetchOpenCodeAgents } from "../runtime/runtime-config-query";

export function useOpenCodeAgents() {
	const [agents, setAgents] = useState<Agent[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		const loadAgents = async () => {
			try {
				setIsLoading(true);
				setError(null);
				const items = await fetchOpenCodeAgents(null);
				if (!cancelled) {
					setAgents(items);
				}
			} catch (_err) {
				if (!cancelled) {
					setError("Failed to load OpenCode agents");
					setAgents([]);
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		};

		loadAgents();

		return () => {
			cancelled = true;
		};
	}, []);

	return { agents, isLoading, error };
}
