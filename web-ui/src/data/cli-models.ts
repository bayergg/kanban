export interface Model {
	id: string;
	name: string;
	provider: string;
}

export interface Provider {
	id: string;
	name: string;
}

export const GEMINI_MODELS: Model[] = [
	{ id: "gemini-3-pro", name: "Gemini 3 Pro", provider: "google" },
	{ id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google" },
	{ id: "gemini-2.0-pro-exp", name: "Gemini 2.0 Pro Experimental", provider: "google" },
];

export const CODEX_PROVIDERS: Provider[] = [
	{ id: "openai", name: "OpenAI" },
	{ id: "ollama", name: "Ollama" },
	{ id: "custom", name: "Custom" },
];

export const CODEX_MODELS: Model[] = [
	{ id: "gpt-5.4", name: "GPT-5.4", provider: "openai" },
	{ id: "gpt-5.3-codex", name: "GPT-5.3 Codex", provider: "openai" },
	{ id: "o4-mini", name: "o4-mini", provider: "openai" },
	{ id: "llama3.3", name: "Llama 3.3", provider: "ollama" },
	{ id: "codestral", name: "Codestral", provider: "ollama" },
	{ id: "custom-model", name: "Custom Model", provider: "custom" },
];

export const OPENCODE_AGENTS = [
	{ id: "build", name: "Build", type: "primary" },
	{ id: "compaction", name: "Compaction", type: "primary" },
	{ id: "explore", name: "Explore", type: "subagent" },
	{ id: "general", name: "General", type: "subagent" },
	{ id: "plan", name: "Plan", type: "primary" },
	{ id: "summary", name: "Summary", type: "primary" },
	{ id: "title", name: "Title", type: "primary" },
];
