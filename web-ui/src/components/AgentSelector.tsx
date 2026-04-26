import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, Cpu, Globe, Loader2, User } from "lucide-react";
import type React from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { CODEX_MODELS, CODEX_PROVIDERS, GEMINI_MODELS, OPENCODE_AGENTS } from "../data/cli-models";
import { useOpenCodeModels } from "../hooks/useOpenCodeModels";
import { useOpenCodeProviders } from "../hooks/useOpenCodeProviders";

export type CLIId = "gemini" | "codex" | "opencode";

interface AgentSelectorProps {
	cli: CLIId;
	onSelectionChange?: (selection: { agentId?: string; providerId?: string; modelId?: string }) => void;
}

export const AgentSelector: React.FC<AgentSelectorProps> = ({ cli, onSelectionChange }) => {
	// OpenCode specific states
	const { providers: openCodeProviders, isLoading: isLoadingProviders } = useOpenCodeProviders();
	const [selectedAgent, setSelectedAgent] = useState<string>(OPENCODE_AGENTS[0]!.id);
	const [selectedOpenCodeProvider, setSelectedOpenCodeProvider] = useState<string | null>(null);
	const { models: openCodeModels, isLoading: isLoadingModels } = useOpenCodeModels(selectedOpenCodeProvider);
	const [selectedOpenCodeModel, setSelectedOpenCodeModel] = useState<string | null>(null);

	// Codex specific states
	const [selectedCodexProvider, setSelectedCodexProvider] = useState<string>(CODEX_PROVIDERS[0]!.id);
	const [selectedCodexModel, setSelectedCodexModel] = useState<string>(
		CODEX_MODELS.find((m) => m.provider === CODEX_PROVIDERS[0]!.id)?.id || "",
	);

	// Gemini specific states
	const [selectedGeminiModel, setSelectedGeminiModel] = useState<string>(GEMINI_MODELS[0]!.id);

	// Reset states when CLI changes
	useEffect(() => {
		if (cli === "opencode" && openCodeProviders.length > 0 && !selectedOpenCodeProvider) {
			setSelectedOpenCodeProvider(openCodeProviders[0]!.id);
		}
	}, [cli, openCodeProviders, selectedOpenCodeProvider]);

	// Handle provider change resets
	const handleOpenCodeProviderChange = (value: string) => {
		setSelectedOpenCodeProvider(value);
		setSelectedOpenCodeModel(null); // Reset model when provider changes
	};

	const handleCodexProviderChange = (value: string) => {
		setSelectedCodexProvider(value);
		const firstModel = CODEX_MODELS.find((m) => m.provider === value);
		if (firstModel) {
			setSelectedCodexModel(firstModel.id);
		}
	};

	// Notify parent of changes
	useEffect(() => {
		if (cli === "gemini") {
			onSelectionChange?.({
				modelId: selectedGeminiModel,
			});
		} else if (cli === "codex") {
			onSelectionChange?.({
				providerId: selectedCodexProvider,
				modelId: selectedCodexModel,
			});
		} else if (cli === "opencode") {
			onSelectionChange?.({
				agentId: selectedAgent,
				providerId: selectedOpenCodeProvider || undefined,
				modelId: selectedOpenCodeModel || undefined,
			});
		}
	}, [
		cli,
		selectedGeminiModel,
		selectedCodexProvider,
		selectedCodexModel,
		selectedAgent,
		selectedOpenCodeProvider,
		selectedOpenCodeModel,
		onSelectionChange,
	]);

	const filteredCodexModels = useMemo(() => {
		return CODEX_MODELS.filter((m) => m.provider === selectedCodexProvider);
	}, [selectedCodexProvider]);

	return (
		<div className="flex flex-col gap-4 p-4 rounded-lg bg-surface-1 border border-border shadow-sm max-w-md">
			<div className="flex items-center gap-2 mb-1">
				<Cpu size={16} className="text-accent" />
				<span className="text-xs font-bold uppercase tracking-wider text-text-secondary">{cli} Configuration</span>
			</div>

			<div className="grid grid-cols-1 gap-3">
				{/* --- OPENCODE UI --- */}
				{cli === "opencode" && (
					<>
						<SelectorField
							label="Agent"
							value={selectedAgent}
							onValueChange={setSelectedAgent}
							options={OPENCODE_AGENTS.map((a) => ({ id: a.id, name: `${a.name} (${a.type})` }))}
							icon={<User size={14} />}
						/>

						<SelectorField
							label="Provider"
							value={selectedOpenCodeProvider || ""}
							onValueChange={handleOpenCodeProviderChange}
							options={openCodeProviders}
							isLoading={isLoadingProviders}
							icon={<Globe size={14} />}
						/>

						<SelectorField
							label="Model"
							value={selectedOpenCodeModel || ""}
							onValueChange={setSelectedOpenCodeModel}
							options={openCodeModels}
							isLoading={isLoadingModels}
							disabled={!selectedOpenCodeProvider}
							placeholder="Select a model..."
							icon={<Cpu size={14} />}
						/>
					</>
				)}

				{/* --- GEMINI UI --- */}
				{cli === "gemini" && (
					<>
						<SelectorField
							label="Model"
							value={selectedGeminiModel}
							onValueChange={setSelectedGeminiModel}
							options={GEMINI_MODELS}
							icon={<Cpu size={14} />}
						/>
					</>
				)}

				{/* --- CODEX UI --- */}
				{cli === "codex" && (
					<>
						<SelectorField
							label="Provider"
							value={selectedCodexProvider}
							onValueChange={handleCodexProviderChange}
							options={CODEX_PROVIDERS}
							icon={<Globe size={14} />}
						/>

						<SelectorField
							label="Model"
							value={selectedCodexModel}
							onValueChange={setSelectedCodexModel}
							options={filteredCodexModels}
							icon={<Cpu size={14} />}
						/>
					</>
				)}
			</div>
		</div>
	);
};

interface SelectorFieldProps {
	label: string;
	value: string;
	onValueChange: (value: string) => void;
	options: { id: string; name: string }[];
	isLoading?: boolean;
	disabled?: boolean;
	placeholder?: string;
	icon?: React.ReactNode;
}

const SelectorField: React.FC<SelectorFieldProps> = ({
	label,
	value,
	onValueChange,
	options,
	isLoading,
	disabled,
	placeholder = "Select...",
	icon,
}) => {
	const id = useId();
	return (
		<div className="flex flex-col gap-1.5">
			<label htmlFor={id} className="text-xs font-medium text-text-secondary px-1">
				{label}
			</label>

			<Select.Root value={value} onValueChange={onValueChange} disabled={disabled || isLoading}>
				<Select.Trigger
					id={id}
					className="flex items-center justify-between h-9 px-3 rounded-md bg-surface-2 border border-border hover:border-border-bright focus:outline-none focus:ring-1 focus:ring-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm text-text-primary"
				>
					<div className="flex items-center gap-2 truncate">
						{icon && <span className="text-text-tertiary">{icon}</span>}
						<Select.Value placeholder={placeholder}>{options.find((opt) => opt.id === value)?.name}</Select.Value>
					</div>
					<Select.Icon>
						{isLoading ? (
							<Loader2 size={14} className="animate-spin text-text-tertiary" />
						) : (
							<ChevronDown size={14} className="text-text-tertiary" />
						)}
					</Select.Icon>
				</Select.Trigger>

				<Select.Portal>
					<Select.Content
						className="z-50 min-w-[200px] overflow-hidden rounded-md border border-border-bright bg-surface-3 shadow-xl animate-in fade-in zoom-in-95 duration-100"
						position="popper"
						side="bottom"
						sideOffset={4}
					>
						<Select.Viewport className="p-1">
							{options.length === 0 && !isLoading && (
								<div className="py-2 px-3 text-xs text-text-tertiary italic">No options available</div>
							)}
							{options.map((option) => (
								<Select.Item
									key={option.id}
									value={option.id}
									className="relative flex items-center h-8 px-8 rounded-sm text-sm text-text-primary select-none hover:bg-accent hover:text-accent-fg outline-none data-[state=checked]:bg-surface-4 data-[state=checked]:text-accent focus:bg-accent focus:text-accent-fg cursor-pointer transition-colors"
								>
									<Select.ItemText>{option.name}</Select.ItemText>
									<Select.ItemIndicator className="absolute left-2 inline-flex items-center justify-center">
										<Check size={14} />
									</Select.ItemIndicator>
								</Select.Item>
							))}
						</Select.Viewport>
					</Select.Content>
				</Select.Portal>
			</Select.Root>
		</div>
	);
};
