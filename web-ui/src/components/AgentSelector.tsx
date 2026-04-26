import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, Loader2 } from "lucide-react";
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

	// Auto-select first model when OpenCode models are loaded
	useEffect(() => {
		if (cli === "opencode" && openCodeModels.length > 0 && !selectedOpenCodeModel) {
			setSelectedOpenCodeModel(openCodeModels[0]!.id);
		}
	}, [cli, openCodeModels, selectedOpenCodeModel]);

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
		<div className="flex flex-col gap-2 w-full mt-2">
			{/* --- OPENCODE UI --- */}
			{cli === "opencode" && (
				<>
					<div className="w-full sm:w-1/2 min-w-0">
						<SelectorField
							label="Agent"
							value={selectedAgent}
							onValueChange={setSelectedAgent}
							options={OPENCODE_AGENTS.map((a) => ({ id: a.id, name: `${a.name} (${a.type})` }))}
						/>
					</div>

					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						<SelectorField
							label="Provider"
							value={selectedOpenCodeProvider || ""}
							onValueChange={handleOpenCodeProviderChange}
							options={openCodeProviders}
							isLoading={isLoadingProviders}
						/>

						<SelectorField
							label="Model"
							value={selectedOpenCodeModel || ""}
							onValueChange={setSelectedOpenCodeModel}
							options={openCodeModels}
							isLoading={isLoadingModels}
							disabled={!selectedOpenCodeProvider}
							placeholder="Select model..."
						/>
					</div>
				</>
			)}

			{/* --- GEMINI UI --- */}
			{cli === "gemini" && (
				<div className="w-full sm:w-1/2 min-w-0">
					<SelectorField
						label="Model"
						value={selectedGeminiModel}
						onValueChange={setSelectedGeminiModel}
						options={GEMINI_MODELS}
					/>
				</div>
			)}

			{/* --- CODEX UI --- */}
			{cli === "codex" && (
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					<SelectorField
						label="Provider"
						value={selectedCodexProvider}
						onValueChange={handleCodexProviderChange}
						options={CODEX_PROVIDERS}
					/>

					<SelectorField
						label="Model"
						value={selectedCodexModel}
						onValueChange={setSelectedCodexModel}
						options={filteredCodexModels}
					/>
				</div>
			)}
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
}

const SelectorField: React.FC<SelectorFieldProps> = ({
	label,
	value,
	onValueChange,
	options,
	isLoading,
	disabled,
	placeholder = "Select...",
}) => {
	const id = useId();
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="text-[11px] text-text-secondary block">
				{label}
			</label>

			<Select.Root value={value} onValueChange={onValueChange} disabled={disabled || isLoading}>
				<Select.Trigger
					id={id}
					className="flex items-center justify-between h-8 px-2 rounded-md bg-surface-2 border border-border-bright hover:border-border-focus focus:outline-none focus:ring-1 focus:ring-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed text-[12px] text-text-primary w-full"
				>
					<div className="flex items-center gap-2 truncate">
						<Select.Value placeholder={placeholder}>
							{options.find((opt) => opt.id === value)?.name || placeholder}
						</Select.Value>
					</div>
					<Select.Icon>
						{isLoading ? (
							<Loader2 size={12} className="animate-spin text-text-tertiary" />
						) : (
							<ChevronDown size={12} className="text-text-tertiary" />
						)}
					</Select.Icon>
				</Select.Trigger>

				<Select.Portal>
					<Select.Content
						className="z-[100] min-w-[200px] overflow-hidden rounded-md border border-border-bright bg-surface-3 shadow-xl animate-in fade-in zoom-in-95 duration-100"
						position="popper"
						side="bottom"
						sideOffset={4}
					>
						<Select.Viewport className="p-1">
							{options.length === 0 && !isLoading && (
								<div className="py-2 px-3 text-[11px] text-text-tertiary italic">No options available</div>
							)}
							{options.map((option) => (
								<Select.Item
									key={option.id}
									value={option.id}
									className="relative flex items-center h-8 px-8 rounded-sm text-[12px] text-text-primary select-none hover:bg-accent hover:text-white outline-none data-[state=checked]:bg-surface-4 data-[state=checked]:text-accent focus:bg-accent focus:text-white cursor-pointer transition-colors"
								>
									<Select.ItemText>{option.name}</Select.ItemText>
									<Select.ItemIndicator className="absolute left-2 inline-flex items-center justify-center text-accent">
										<Check size={12} />
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
