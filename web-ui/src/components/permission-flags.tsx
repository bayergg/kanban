import * as RadixSwitch from "@radix-ui/react-switch";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogBody,
	AlertDialogCancel,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import {
	CODEX_APPROVAL_POLICIES,
	CODEX_SANDBOX_MODES,
	type CodexApprovalPolicy,
	type CodexSandboxMode,
	type PermissionConfig,
} from "@/lib/permission-config";

interface PermissionFlagsProps {
	config: PermissionConfig;
	onChange: (config: PermissionConfig) => void;
	disabled?: boolean;
}

/**
 * Component for managing CLI permission and safety flags.
 * Includes YOLO mode toggles for each CLI with confirmation dialogs.
 */
export function PermissionFlags({ config, onChange, disabled }: PermissionFlagsProps) {
	const [pendingYoloCLI, setPendingYoloCLI] = useState<keyof PermissionConfig | null>(null);

	const handleYoloToggle = (cli: keyof PermissionConfig, enabled: boolean) => {
		if (enabled) {
			setPendingYoloCLI(cli);
		} else {
			updateYolo(cli, false);
		}
	};

	const updateYolo = (cli: keyof PermissionConfig, enabled: boolean) => {
		const nextConfig = { ...config };
		if (cli === "openCode") {
			nextConfig.openCode = { ...config.openCode, dangerouslySkipPermissions: enabled };
		} else if (cli === "gemini") {
			nextConfig.gemini = { ...config.gemini, yolo: enabled };
		} else if (cli === "codex") {
			nextConfig.codex = { ...config.codex, dangerouslyBypassApprovalsAndSandbox: enabled };
		}
		onChange(nextConfig);
		setPendingYoloCLI(null);
	};

	const getYoloFlag = (cli: keyof PermissionConfig) => {
		switch (cli) {
			case "openCode":
				return "--dangerously-skip-permissions";
			case "gemini":
				return "--yolo / --approval-mode=yolo";
			case "codex":
				return "--dangerously-bypass-approvals-and-sandbox";
		}
	};

	return (
		<div className="space-y-6">
			{/* OpenCode Section */}
			<section className="space-y-3">
				<h3 className="text-[11px] font-bold text-text-secondary uppercase tracking-[0.1em]">
					OpenCode Permissions
				</h3>
				<YoloRow
					label="Dangerously Skip Permissions"
					description="Disables all permission prompts. OpenCode will execute all tools without asking."
					flag="--dangerously-skip-permissions"
					checked={config.openCode.dangerouslySkipPermissions}
					onCheckedChange={(checked) => handleYoloToggle("openCode", checked)}
					disabled={disabled}
				/>
			</section>

			{/* Gemini Section */}
			<section className="space-y-3">
				<h3 className="text-[11px] font-bold text-text-secondary uppercase tracking-[0.1em]">Gemini Permissions</h3>
				<YoloRow
					label="YOLO Mode"
					description="Skips all tool use confirmations. (Equivalent to --yolo or --approval-mode=yolo)"
					flag="--yolo"
					checked={config.gemini.yolo}
					onCheckedChange={(checked) => handleYoloToggle("gemini", checked)}
					disabled={disabled}
				/>
				<ToggleRow
					label="Sandbox Mode"
					description="Enables a secure sandbox environment for code execution."
					checked={config.gemini.sandbox}
					onCheckedChange={(checked) => onChange({ ...config, gemini: { ...config.gemini, sandbox: checked } })}
					disabled={disabled}
				/>
			</section>

			{/* Codex Section */}
			<section className="space-y-3">
				<h3 className="text-[11px] font-bold text-text-secondary uppercase tracking-[0.1em]">Codex Permissions</h3>
				<YoloRow
					label="Bypass Approvals & Sandbox"
					description="Dangerously disables both tool approvals and the security sandbox."
					flag="--dangerously-bypass-approvals-and-sandbox"
					checked={config.codex.dangerouslyBypassApprovalsAndSandbox}
					onCheckedChange={(checked) => handleYoloToggle("codex", checked)}
					disabled={disabled}
				/>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
					<SelectRow
						label="Approval Policy"
						value={config.codex.approvalPolicy}
						options={CODEX_APPROVAL_POLICIES}
						onChange={(val) =>
							onChange({
								...config,
								codex: { ...config.codex, approvalPolicy: val as CodexApprovalPolicy },
							})
						}
						disabled={disabled}
					/>
					<SelectRow
						label="Sandbox Mode"
						value={config.codex.sandboxMode}
						options={CODEX_SANDBOX_MODES}
						onChange={(val) =>
							onChange({
								...config,
								codex: { ...config.codex, sandboxMode: val as CodexSandboxMode },
							})
						}
						disabled={disabled}
					/>
				</div>
			</section>

			<AlertDialog open={pendingYoloCLI !== null} onOpenChange={(open) => !open && setPendingYoloCLI(null)}>
				<AlertDialogHeader>
					<AlertDialogTitle className="flex items-center gap-2 text-status-red">
						<ShieldAlert size={18} />
						Security Warning: YOLO Mode
					</AlertDialogTitle>
				</AlertDialogHeader>
				<AlertDialogBody>
					<AlertDialogDescription>
						Enabling YOLO mode ({pendingYoloCLI && getYoloFlag(pendingYoloCLI)}) allows the CLI to execute
						potentially destructive commands without your explicit consent.
						<br />
						<br />
						This bypasses all safety checks and human-in-the-loop approvals. Are you absolutely sure you want to
						enable this?
					</AlertDialogDescription>
				</AlertDialogBody>
				<AlertDialogFooter>
					<AlertDialogCancel asChild>
						<Button variant="ghost">Cancel</Button>
					</AlertDialogCancel>
					<AlertDialogAction asChild>
						<Button
							className="bg-status-red hover:bg-status-red/90 text-white border-none"
							onClick={() => pendingYoloCLI && updateYolo(pendingYoloCLI, true)}
						>
							Enable YOLO Mode
						</Button>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialog>
		</div>
	);
}

function YoloRow({
	label,
	description,
	flag,
	checked,
	onCheckedChange,
	disabled,
}: {
	label: string;
	description: string;
	flag: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	disabled?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex items-start justify-between gap-4 p-3 rounded-lg border transition-all duration-200",
				checked
					? "bg-status-red/5 border-status-red/40 shadow-[0_0_12px_rgba(248,81,73,0.05)]"
					: "bg-surface-2 border-border hover:border-border-bright",
			)}
		>
			<div className="space-y-1">
				<div className="flex items-center gap-2">
					<span className={cn("text-[13px] font-semibold", checked ? "text-status-red" : "text-text-primary")}>
						{label}
					</span>
					{checked && (
						<span className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-status-red text-white text-[9px] font-black uppercase tracking-wider">
							<AlertTriangle size={10} strokeWidth={3} />
							Danger
						</span>
					)}
				</div>
				<p className="text-[12px] text-text-secondary leading-normal max-w-[400px]">{description}</p>
				<code
					className={cn(
						"inline-block px-1.5 py-0.5 rounded text-[10px] font-mono mt-1",
						checked ? "bg-status-red/10 text-status-red/80" : "bg-surface-3 text-text-tertiary",
					)}
				>
					{flag}
				</code>
			</div>
			<RadixSwitch.Root
				checked={checked}
				onCheckedChange={onCheckedChange}
				disabled={disabled}
				className={cn(
					"relative h-5 w-9 shrink-0 rounded-full transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed",
					checked ? "bg-status-red" : "bg-surface-4",
				)}
			>
				<RadixSwitch.Thumb
					className={cn(
						"block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 translate-x-0.5",
						checked && "translate-x-[18px]",
					)}
				/>
			</RadixSwitch.Root>
		</div>
	);
}

function ToggleRow({
	label,
	description,
	checked,
	onCheckedChange,
	disabled,
}: {
	label: string;
	description: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	disabled?: boolean;
}) {
	return (
		<div className="flex items-start justify-between gap-4 p-3 rounded-lg border border-border bg-surface-2 hover:border-border-bright transition-colors">
			<div className="space-y-1">
				<span className="text-[13px] font-semibold text-text-primary">{label}</span>
				<p className="text-[12px] text-text-secondary leading-normal max-w-[400px]">{description}</p>
			</div>
			<RadixSwitch.Root
				checked={checked}
				onCheckedChange={onCheckedChange}
				disabled={disabled}
				className={cn(
					"relative h-5 w-9 shrink-0 rounded-full transition-colors cursor-pointer disabled:opacity-30 data-[state=checked]:bg-status-green bg-surface-4",
				)}
			>
				<RadixSwitch.Thumb
					className={cn(
						"block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 translate-x-0.5 data-[state=checked]:translate-x-[18px]",
					)}
				/>
			</RadixSwitch.Root>
		</div>
	);
}

function SelectRow({
	label,
	value,
	options,
	onChange,
	disabled,
}: {
	label: string;
	value: string;
	options: Array<{ value: string; label: string }>;
	onChange: (value: string) => void;
	disabled?: boolean;
}) {
	return (
		<div className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-surface-2 hover:border-border-bright transition-colors">
			<span className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider">{label}</span>
			<NativeSelect
				value={value}
				onChange={(e) => onChange(e.target.value)}
				disabled={disabled}
				fill
				size="sm"
				className="text-[12px]"
			>
				{options.map((opt) => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
			</NativeSelect>
		</div>
	);
}
