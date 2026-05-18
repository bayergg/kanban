import { useEffect, useState } from "react";
import type { Model } from "../data/cli-models";
import { fetchOpenCodeModels } from "../runtime/runtime-config-query";

export function useOpenCodeModels(providerId: string | null) {
	const [models, setModels] = useState<Model[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!providerId) {
			setModels([]);
			return;
		}

		let cancelled = false;

		const loadModels = async () => {
			try {
				setIsLoading(true);
				setError(null);
				// Pass null workspaceId — opencode model data is system-wide.
				const items = await fetchOpenCodeModels(null, providerId);
				if (!cancelled) {
					setModels(items);
				}
			} catch (_err) {
				if (!cancelled) {
					setError("Failed to load OpenCode models");
					setModels([]);
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		};

		loadModels();

		return () => {
			cancelled = true;
		};
	}, [providerId]);

	return { models, isLoading, error };
}
