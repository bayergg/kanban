import { Bot, Code2, Terminal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CommandFormat, CommandOptions } from "../lib/command-builder";
// import { PERMISSION_DEFAULTS, type PermissionConfig } from "../lib/permission-config";
import { CommandPreview } from "./command-preview";
// import { PermissionFlags } from "./permission-flags";
import { cn } from "./ui/cn";
import { NativeSelect } from "./ui/native-select";

// Mocking missing types and constants
export interface PermissionConfig {
	openCode: {
		dangerouslySkipPermissions: boolean;
	};
	gemini: {
		yolo: boolean;
		sandbox: boolean;
	};
	codex: {
		dangerouslyBypassApprovalsAndSandbox: boolean;
		approvalPolicy: string;
		sandboxMode: string;
	};
}
export const PERMISSION_DEFAULTS: PermissionConfig = {
	openCode: {
		dangerouslySkipPermissions: false,
	},
	gemini: {
		yolo: false,
		sandbox: true,
	},
	codex: {
		dangerouslyBypassApprovalsAndSandbox: false,
		approvalPolicy: "standard",
		sandboxMode: "isolated",
	},
};
const PermissionFlags = ({
	config,
	onChange,
}: {
	config: PermissionConfig;
	onChange: (c: PermissionConfig) => void;
}) => <div className="p-2 border rounded">Permission Flags Mock</div>;

// Placeholder types for demo/testing
export interface OpenCodeProvider {
	id: string;
	name: string;
}

export interface OpenCodeModel {
	id: string;
	name: string;
	providerId: string;
}

export interface CodexProfile {
	id: string;
	name: string;
}

export function CLIConfigSelector() {
	const [format, setFormat] = useState<CommandFormat>("opencode");
	const [provider, setProvider] = useState("");
	const [model, setModel] = useState("");
	const [agent, setAgent] = useState("");
	const [profile, setProfile] = useState("");
	const [temperature, setTemperature] = useState(0.7);
	const [permissionConfig, setPermissionConfig] = useState<PermissionConfig>(PERMISSION_DEFAULTS);

	const [providers, setProviders] = useState<OpenCodeProvider[]>([]);
	const [models, setModels] = useState<OpenCodeModel[]>([]);
	const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
	const [profiles, setProfiles] = useState<CodexProfile[]>([]);

	// Mock loading data
	useEffect(() => {
		const timer = setTimeout(() => {
			if (format === "opencode") {
				setProviders([
					{ id: "openai", name: "OpenAI" },
					{ id: "anthropic", name: "Anthropic" },
					{ id: "google", name: "Google" },
				]);
				setModels([
					{ id: "gpt-4", name: "GPT-4", providerId: "openai" },
					{ id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", providerId: "openai" },
					{ id: "claude-3-opus", name: "Claude 3 Opus", providerId: "anthropic" },
					{ id: "claude-3-sonnet", name: "Claude 3 Sonnet", providerId: "anthropic" },
					{ id: "gemini-pro", name: "Gemini Pro", providerId: "google" },
				]);
				setAgents([
					{ id: "cline", name: "Cline" },
					{ id: "claude", name: "Claude" },
					{ id: "codex", name: "Codex" },
				]);
			} else if (format === "codex") {
				setProfiles([
					{ id: "default", name: "Default Profile" },
					{ id: "work", name: "Work Profile" },
					{ id: "personal", name: "Personal Profile" },
				]);
			}
		}, 500);
		return () => clearTimeout(timer);
	}, [format]);

	// Reset model when provider changes
	useEffect(() => {
		setModel("");
	}, [provider]);

	// Reset fields when format changes
	const handleFormatChange = (newFormat: CommandFormat) => {
		setFormat(newFormat);
		setProvider("");
		setModel("");
		setAgent("");
		setProfile("");
	};

	const filteredModels = useMemo(() => {
		return models.filter((m) => m.providerId === provider);
	}, [models, provider]);

	const commandOptions: CommandOptions = useMemo(() => {
		const flags: Record<string, any> = {};

		if (format === "opencode") {
			flags["dangerously-skip-permissions"] = permissionConfig.openCode.dangerouslySkipPermissions;
		} else if (format === "gemini") {
			flags.yolo = permissionConfig.gemini.yolo;
			flags.sandbox = permissionConfig.gemini.sandbox;
			flags.temperature = temperature;
		} else if (format === "codex") {
			flags["dangerously-bypass-approvals-and-sandbox"] =
				permissionConfig.codex.dangerouslyBypassApprovalsAndSandbox;
			flags["approval-policy"] = permissionConfig.codex.approvalPolicy;
			flags["sandbox-mode"] = permissionConfig.codex.sandboxMode;
		}

		return {
			format,
			provider,
			model,
			agent,
			profile,
			flags,
		};
	}, [format, provider, model, agent, profile, permissionConfig, temperature]);

	return (
		<div className="flex flex-col gap-8 max-w-2xl mx-auto p-6">
			<div className="space-y-4">
				<h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
					<Terminal size={20} className="text-accent" />
					CLI Configuration
				</h2>
				<p className="text-sm text-text-secondary">
					Select your preferred AI CLI and configure its execution environment and safety flags.
				</p>
			</div>

			<div className="grid grid-cols-3 gap-3">
				<FormatButton
					active={format === "opencode"}
					onClick={() => handleFormatChange("opencode")}
					icon={<Code2 size={18} />}
					label="OpenCode"
				/>
				<FormatButton
					active={format === "gemini"}
					onClick={() => handleFormatChange("gemini")}
					icon={<Bot size={18} />}
					label="Gemini"
				/>
				<FormatButton
					active={format === "codex"}
					onClick={() => handleFormatChange("codex")}
					icon={<Terminal size={18} />}
					label="Codex"
				/>
			</div>

			<div className="space-y-6 animate-in fade-in duration-300">
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					{format === "opencode" && (
						<>
							<div className="space-y-2">
								<label
									htmlFor="opencode-provider"
									className="text-xs font-bold text-text-tertiary uppercase tracking-wider"
								>
									Provider
								</label>
								<NativeSelect
									id="opencode-provider"
									value={provider}
									onChange={(e) => setProvider(e.target.value)}
									fill
								>
									<option value="">Select Provider...</option>
									{providers.map((p) => (
										<option key={p.id} value={p.id}>
											{p.name}
										</option>
									))}
								</NativeSelect>
							</div>
							<div className="space-y-2">
								<label
									htmlFor="opencode-model"
									className="text-xs font-bold text-text-tertiary uppercase tracking-wider"
								>
									Model
								</label>
								<NativeSelect
									id="opencode-model"
									value={model}
									onChange={(e) => setModel(e.target.value)}
									fill
									disabled={!provider}
								>
									<option value="">Select Model...</option>
									{filteredModels.map((m) => (
										<option key={m.id} value={m.id}>
											{m.name}
										</option>
									))}
								</NativeSelect>
							</div>
							<div className="space-y-2">
								<label
									htmlFor="opencode-agent"
									className="text-xs font-bold text-text-tertiary uppercase tracking-wider"
								>
									Agent
								</label>
								<NativeSelect id="opencode-agent" value={agent} onChange={(e) => setAgent(e.target.value)} fill>
									<option value="">Select Agent (Optional)...</option>
									{agents.map((a) => (
										<option key={a.id} value={a.id}>
											{a.name}
										</option>
									))}
								</NativeSelect>
							</div>
						</>
					)}

					{format === "gemini" && (
						<>
							<div className="space-y-2">
								<label
									htmlFor="gemini-model"
									className="text-xs font-bold text-text-tertiary uppercase tracking-wider"
								>
									Model
								</label>
								<NativeSelect id="gemini-model" value={model} onChange={(e) => setModel(e.target.value)} fill>
									<option value="">Select Model...</option>
									<option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
									<option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
									<option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
								</NativeSelect>
							</div>
							<div className="space-y-2">
								<label
									htmlFor="gemini-temperature"
									className="text-xs font-bold text-text-tertiary uppercase tracking-wider"
								>
									Temperature ({temperature.toFixed(1)})
								</label>
								<input
									id="gemini-temperature"
									type="range"
									min="0"
									max="1"
									step="0.1"
									value={temperature}
									onChange={(e) => setTemperature(parseFloat(e.target.value))}
									className="w-full h-2 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-accent"
								/>
								<div className="flex justify-between text-[10px] text-text-tertiary">
									<span>Precise</span>
									<span>Creative</span>
								</div>
							</div>
						</>
					)}

					{format === "codex" && (
						<div className="space-y-2">
							<label
								htmlFor="codex-profile"
								className="text-xs font-bold text-text-tertiary uppercase tracking-wider"
							>
								Profile
							</label>
							<NativeSelect id="codex-profile" value={profile} onChange={(e) => setProfile(e.target.value)} fill>
								<option value="">Select Profile...</option>
								{profiles.map((p) => (
									<option key={p.id} value={p.id}>
										{p.name}
									</option>
								))}
							</NativeSelect>
						</div>
					)}
				</div>

				<PermissionFlags config={permissionConfig} onChange={setPermissionConfig} />

				<CommandPreview options={commandOptions} />
			</div>
		</div>
	);
}

function FormatButton({
	active,
	onClick,
	icon,
	label,
}: {
	active: boolean;
	onClick: () => void;
	icon: React.ReactNode;
	label: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all duration-200",
				active
					? "border-accent bg-accent/5 text-accent shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)]"
					: "border-border bg-surface-2 text-text-secondary hover:border-border-bright hover:bg-surface-3",
			)}
		>
			{icon}
			<span className="text-xs font-bold uppercase tracking-widest">{label}</span>
		</button>
	);
}
