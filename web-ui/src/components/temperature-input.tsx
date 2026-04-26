import { type ChangeEvent, useEffect, useState } from "react";
import { cn } from "@/components/ui/cn";
import { isValidTemperature, TEMPERATURE_RANGE } from "@/lib/temperature-config";

interface TemperatureInputProps {
	value: number;
	onChange: (value: number) => void;
	className?: string;
}

/**
 * A float input component for temperature configuration.
 * Accepts values between 0.0 and 1.0 with a step of 0.1.
 */
export function TemperatureInput({ value, onChange, className }: TemperatureInputProps) {
	const [inputValue, setInputValue] = useState<string>(value.toString());
	const [error, setError] = useState<string | null>(null);

	// Sync local state with prop value if it changes externally
	useEffect(() => {
		setInputValue(value.toString());
		setError(null);
	}, [value]);

	const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
		const rawValue = e.target.value;
		setInputValue(rawValue);

		const floatValue = parseFloat(rawValue);

		if (rawValue === "") {
			setError("Value is required");
			return;
		}

		if (Number.isNaN(floatValue)) {
			setError("Please enter a valid number");
			return;
		}

		if (!isValidTemperature(floatValue)) {
			setError(`Value must be between ${TEMPERATURE_RANGE.MIN.toFixed(1)} and ${TEMPERATURE_RANGE.MAX.toFixed(1)}`);
		} else {
			setError(null);
			onChange(floatValue);
		}
	};

	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			<input
				type="number"
				min={TEMPERATURE_RANGE.MIN}
				max={TEMPERATURE_RANGE.MAX}
				step={TEMPERATURE_RANGE.STEP}
				value={inputValue}
				onChange={handleChange}
				className={cn(
					"h-8 w-24 rounded-md border px-2 py-1 text-[13px] outline-none transition-colors",
					"bg-surface-2 border-border text-text-primary focus:border-border-focus",
					error && "border-status-red focus:border-status-red",
				)}
				aria-invalid={!!error}
			/>
			{error && <span className="text-[11px] text-status-red leading-none font-medium">{error}</span>}
		</div>
	);
}
