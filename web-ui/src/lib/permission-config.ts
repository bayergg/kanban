/**
 * Configuration for CLI permission and safety flags.
 */

export type CodexApprovalPolicy = "always" | "never" | "ask";
export type CodexSandboxMode = "enabled" | "disabled" | "restricted";

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
		approvalPolicy: CodexApprovalPolicy;
		sandboxMode: CodexSandboxMode;
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
		approvalPolicy: "ask",
		sandboxMode: "restricted",
	},
};

export const CODEX_APPROVAL_POLICIES: Array<{ value: CodexApprovalPolicy; label: string }> = [
	{ value: "always", label: "Always Approve" },
	{ value: "never", label: "Never Approve" },
	{ value: "ask", label: "Ask for Approval" },
];

export const CODEX_SANDBOX_MODES: Array<{ value: CodexSandboxMode; label: string }> = [
	{ value: "enabled", label: "Full Sandbox" },
	{ value: "disabled", label: "No Sandbox" },
	{ value: "restricted", label: "Restricted" },
];
