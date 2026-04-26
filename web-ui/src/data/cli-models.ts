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
	{ id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", provider: "google" },
	{ id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite", provider: "google" },
	{ id: "gemini-3.1-flash-live", name: "Gemini 3.1 Flash Live", provider: "google" },
	{ id: "gemini-3-pro", name: "Gemini 3 Pro", provider: "google" },
	{ id: "gemini-3-flash", name: "Gemini 3 Flash", provider: "google" },
	{ id: "gemini-3-deep-think", name: "Gemini 3 Deep Think", provider: "google" },
	{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google" },
	{ id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google" },
];

export const CODEX_PROVIDERS: Provider[] = [
	{ id: "openai", name: "OpenAI" },
	{ id: "ollama", name: "Ollama" },
	{ id: "lmstudio", name: "LM Studio" },
	{ id: "custom", name: "Custom" },
];

export const CODEX_MODELS: Model[] = [
	{ id: "gpt-4o", name: "GPT-4o", provider: "openai" },
	{ id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
	{ id: "o1", name: "o1", provider: "openai" },
	{ id: "o1-mini", name: "o1-mini", provider: "openai" },
	{ id: "o3-mini", name: "o3-mini", provider: "openai" },
	{ id: "gpt-4-turbo", name: "GPT-4 Turbo", provider: "openai" },
	{ id: "gpt-5.4", name: "GPT-5.4 (Experimental)", provider: "openai" },
	{ id: "gpt-5.3-codex", name: "GPT-5.3 Codex", provider: "openai" },
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
