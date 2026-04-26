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
				await new Promise((resolve) => setTimeout(resolve, 300));

				let mockModels: Model[] = [];

				if (providerId === "opencode") {
					mockModels = [
						{ id: "opencode/big-pickle", name: "Big Pickle", provider: "opencode" },
						{ id: "opencode/gpt-5-nano", name: "GPT-5 Nano", provider: "opencode" },
						{ id: "opencode/hy3-preview-free", name: "HY3 Preview (Free)", provider: "opencode" },
						{ id: "opencode/ling-2.6-flash-free", name: "Ling 2.6 Flash (Free)", provider: "opencode" },
						{ id: "opencode/minimax-m2.5-free", name: "MiniMax M2.5 (Free)", provider: "opencode" },
						{ id: "opencode/nemotron-3-super-free", name: "Nemotron 3 Super (Free)", provider: "opencode" },
					];
				} else if (providerId === "CrofAI") {
					mockModels = [
						{ id: "CrofAI/deepseek-v4-pro", name: "DeepSeek V4 Pro", provider: "CrofAI" },
						{ id: "CrofAI/glm-5.1-precision", name: "GLM 5.1 Precision", provider: "CrofAI" },
						{ id: "CrofAI/kimi-k2.6", name: "Kimi K2.6", provider: "CrofAI" },
						{ id: "CrofAI/kimi-k2.6-precision", name: "Kimi K2.6 Precision", provider: "CrofAI" },
						{ id: "CrofAI/qwen3.5-397b-a17b", name: "Qwen 3.5 397B", provider: "CrofAI" },
					];
				} else if (providerId === "kimi-for-coding") {
					mockModels = [
						{ id: "kimi-for-coding/k2p5", name: "K2P5", provider: "kimi-for-coding" },
						{ id: "kimi-for-coding/k2p6", name: "K2P6", provider: "kimi-for-coding" },
						{ id: "kimi-for-coding/kimi-k2-thinking", name: "Kimi K2 Thinking", provider: "kimi-for-coding" },
					];
				} else if (providerId.startsWith("minimax")) {
					mockModels = [
						{ id: `${providerId}/MiniMax-M2`, name: "M2", provider: providerId },
						{ id: `${providerId}/MiniMax-M2.1`, name: "M2.1", provider: providerId },
						{ id: `${providerId}/MiniMax-M2.5`, name: "M2.5", provider: providerId },
						{ id: `${providerId}/MiniMax-M2.5-highspeed`, name: "M2.5 High-speed", provider: providerId },
						{ id: `${providerId}/MiniMax-M2.7`, name: "M2.7", provider: providerId },
						{ id: `${providerId}/MiniMax-M2.7-highspeed`, name: "M2.7 High-speed", provider: providerId },
					];
				} else {
					mockModels = [{ id: `${providerId}/default`, name: "Default Model", provider: providerId }];
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
