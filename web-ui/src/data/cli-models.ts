export interface Model {
	id: string;
	name: string;
	provider: string;
}

export interface Provider {
	id: string;
	name: string;
}

export interface Agent {
	id: string;
	name: string;
	type: string;
}

export const GEMINI_MODELS: Model[] = [
	{ id: "auto", name: "Auto (Default)", provider: "google" },
	{ id: "pro", name: "Pro", provider: "google" },
	{ id: "flash", name: "Flash", provider: "google" },
	{ id: "flash-lite", name: "Flash-Lite", provider: "google" },
	{ id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", provider: "google" },
	{ id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview", provider: "google" },
	{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google" },
	{ id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google" },
	{ id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", provider: "google" },
	{ id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "google" },
	{ id: "gemini-2.0-pro-exp-02-05", name: "Gemini 2.0 Pro (Experimental)", provider: "google" },
];

export const CODEX_PROVIDERS: Provider[] = [
	{ id: "openai", name: "OpenAI" },
	{ id: "ollama", name: "Ollama" },
	{ id: "lmstudio", name: "LM Studio" },
	{ id: "custom", name: "Custom" },
];

export const CODEX_MODELS: Model[] = [
	{ id: "gpt-5.5", name: "gpt-5.5", provider: "openai" },
	{ id: "gpt-5.4", name: "gpt-5.4", provider: "openai" },
	{ id: "gpt-5.4-mini", name: "gpt-5.4-mini", provider: "openai" },
	{ id: "gpt-5.3-codex", name: "gpt-5.3-codex", provider: "openai" },
	{ id: "gpt-5.2", name: "gpt-5.2", provider: "openai" },
	{ id: "gpt-4o", name: "GPT-4o", provider: "openai" },
	{ id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
	{ id: "o1", name: "o1", provider: "openai" },
	{ id: "o1-mini", name: "o1-mini", provider: "openai" },
	{ id: "o3-mini", name: "o3-mini", provider: "openai" },
	{ id: "gpt-4-turbo", name: "GPT-4 Turbo", provider: "openai" },
	{ id: "gpt-4", name: "GPT-4", provider: "openai" },
	{ id: "llama3.3", name: "Llama 3.3", provider: "ollama" },
	{ id: "codestral", name: "Codestral", provider: "ollama" },
	{ id: "custom-model", name: "Custom Model", provider: "custom" },
];
