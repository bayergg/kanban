import { useEffect, useState } from "react";
import type { Model } from "../data/cli-models";

export function useOpenCodeModels(providerId: string | null) {
	const [models, setModels] = useState<Model[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!providerId) {
			setModels([]);
			return;
		}

		const fetchModels = async () => {
			try {
				setIsLoading(true);
				// Simulate network delay
				await new Promise((resolve) => setTimeout(resolve, 400));

				let mockModels: Model[] = [];

				if (providerId === "kimi") {
					mockModels = [
						{ id: "kimi-v1", name: "Kimi V1", provider: "kimi" },
						{ id: "kimi-latest", name: "Kimi Latest", provider: "kimi" },
					];
				} else if (providerId.startsWith("minimax")) {
					mockModels = [
						{ id: "minimax-abab6.5", name: "abab6.5", provider: providerId },
						{ id: "minimax-abab7", name: "abab7", provider: providerId },
					];
				} else {
					mockModels = [{ id: "default-model", name: "Default Model", provider: providerId }];
				}

				setModels(mockModels);
			} catch (_err) {
				setError("Failed to load OpenCode models");
			} finally {
				setIsLoading(false);
			}
		};

		fetchModels();
	}, [providerId]);

	return { models, isLoading, error };
}
