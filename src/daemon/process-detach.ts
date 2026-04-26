import { spawn } from "node:child_process";

/**
 * Cross-platform daemonization entry point.
 * Call this early in the daemon command handler.
 *
 * Returns true if we are the daemon child and should continue.
 * Returns false if we are the original parent.
 */
export function daemonizeProcess(): boolean {
	// If already detached (e.g., from a prior fork), continue
	if (process.env.KANBAN_DAEMONIZED === "1") {
		return true;
	}

	const command = process.argv[0];
	const args = process.argv.slice(1);

	// On Windows, we just spawn a detached process and the parent exits
	if (process.platform === "win32") {
		const child = spawn(command, args, {
			detached: true,
			stdio: "ignore",
			windowsHide: true,
			env: { ...process.env, KANBAN_DAEMONIZED: "1" },
		});
		child.unref();
		return false; // Parent will exit in the command handler
	}

	// Unix: re-exec ourselves detached
	const child = spawn(command, args, {
		detached: true,
		stdio: "ignore",
		env: { ...process.env, KANBAN_DAEMONIZED: "1" },
	});

	child.unref();
	return false; // Parent continues so it can wait for readiness
}

/**
 * Redirect stdio to null devices for a clean daemon.
 * Since we have setupLogging(), we only need to ensure basic FDs are not connected to a TTY.
 */
export function redirectStdio(): void {
	// Our setupLogging already intercepts process.stdout.write
	// so we don't need dup2 which can be unstable in Node.js
}
