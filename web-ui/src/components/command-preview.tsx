import { AlertCircle, Check, Copy } from "lucide-react";
import { useMemo } from "react";
import { useClipboard } from "../hooks/use-clipboard";
import { buildCommand, type CommandOptions, validateCommandOptions } from "../lib/command-builder";

interface CommandPreviewProps {
	options: CommandOptions;
}

export function CommandPreview({ options }: CommandPreviewProps) {
	const { copied, copy } = useClipboard();

	const command = useMemo(() => buildCommand(options), [options]);
	const validation = useMemo(() => validateCommandOptions(options), [options]);

	return (
		<div className="bg-surface-1 border border-border rounded-lg overflow-hidden flex flex-col">
			<div className="flex items-center justify-between px-4 py-2 bg-surface-2 border-bottom border-border">
				<span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Generated Command</span>
				<button
					type="button"
					onClick={() => copy(command)}
					disabled={!validation.isValid}
					className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors
            ${
							copied
								? "text-status-green bg-status-green/10"
								: "text-accent-fg bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
						}`}
				>
					{copied ? (
						<>
							<Check size={14} />
							Copied
						</>
					) : (
						<>
							<Copy size={14} />
							Copy
						</>
					)}
				</button>
			</div>

			<div className="p-4 font-mono text-sm overflow-x-auto whitespace-pre bg-surface-1 text-text-primary min-h-[3rem] flex items-center">
				{command || <span className="text-text-tertiary italic">Configure options to generate command...</span>}
			</div>

			{!validation.isValid && (
				<div className="px-4 py-2 bg-status-red/10 border-top border-border flex items-start gap-2">
					<AlertCircle size={14} className="text-status-red mt-0.5 shrink-0" />
					<div className="flex flex-col">
						{validation.errors.map((error, index) => (
							<span key={index} className="text-xs text-status-red">
								{error}
							</span>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
