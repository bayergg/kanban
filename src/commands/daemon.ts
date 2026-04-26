import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import { connectControlClient, getDaemonStatus, isDaemonRunning } from "../daemon/control-client";
import { runDaemon } from "../daemon/daemon-entry";
import { cleanStalePidFile, getDaemonLogPath } from "../daemon/pid-file";
import { daemonizeProcess } from "../daemon/process-detach";

function parsePort(value: string): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
		throw new Error(`Invalid port: ${value}`);
	}
	return parsed;
}

async function waitForDaemonReady(maxWaitMs = 10_000): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < maxWaitMs) {
		if (await isDaemonRunning()) {
			return true;
		}
		await new Promise((r) => setTimeout(r, 200));
	}
	return false;
}

export function registerDaemonCommand(program: Command): void {
	const daemon = program.command("daemon").description("Manage the Kanban background daemon.");

	daemon
		.command("start")
		.description("Start the Kanban daemon in the background.")
		.option("--foreground", "Run in foreground (do not daemonize).", false)
		.option("--port <number>", "Runtime server port.", parsePort, 3484)
		.option("--host <ip>", "Host to bind the server to (default: 127.0.0.1).", "127.0.0.1")
		.option("--https", "Enable HTTPS. Requires both --cert and --key.")
		.option("--cert <path>", "Path to a TLS certificate PEM file (implies HTTPS).")
		.option("--key <path>", "Path to a TLS private key PEM file (implies HTTPS).")

		.option(
			"--no-passcode",
			"Disable auto-generated passcode for remote access (for advanced users behind a reverse proxy).",
		)
		.option("--manual-passcode <value>", "Set a manual passcode for remote access.")
		.action(async (_options, cmd: Command) => {
			const options = cmd.optsWithGlobals() as {
				foreground: boolean;
				port: number;
				host: string;
				https: boolean;
				cert?: string;
				key?: string;
				noPasscode: boolean;
				manualPasscode?: string;
			};

			if (!options.foreground) {
				console.log("Starting Kanban daemon in background...");
				// On non-Windows, daemonize via re-exec
				if (process.platform !== "win32") {
					const isChild = daemonizeProcess();
					if (!isChild) {
						// We are the original parent — exit after spawning child
						const ready = await waitForDaemonReady();
						if (ready) {
							console.log("✅ Kanban daemon started successfully.");
							const status = await getDaemonStatus();
							if (status) {
								console.log(`   PID: ${status.pid}`);
								console.log(`   URL: http://${options.host}:${status.runtimePort}/kanban`);
							}
						} else {
							console.error("❌ Daemon failed to start within 10 seconds.");
							console.error("   Check logs for details: kanban daemon logs");
							process.exitCode = 1;
						}
						return;
					}
				}
			}

			await runDaemon({
				foreground: options.foreground,
				port: options.port,
				host: options.host,
				https: options.https,
				cert: options.cert ?? null,
				key: options.key ?? null,
				noPasscode: options.noPasscode,
				passcode: options.manualPasscode ?? null,
			});
		});

	daemon
		.command("stop")
		.description("Stop the Kanban daemon.")
		.action(async () => {
			const status = await getDaemonStatus();
			if (!status) {
				await cleanStalePidFile();
				console.log("Kanban daemon is not running.");
				return;
			}

			const client = await connectControlClient();
			if (!client) {
				console.error("Cannot connect to daemon control socket.");
				process.exitCode = 1;
				return;
			}

			try {
				await client.call("stop");
				client.close();
				console.log("Kanban daemon stopped.");
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Failed to stop daemon: ${message}`);
				process.exitCode = 1;
			}
		});

	daemon
		.command("restart")
		.description("Restart the Kanban daemon.")
		.option("--port <number>", "Runtime server port.", parsePort, 3484)
		.option("--host <ip>", "Host to bind the server to (default: 127.0.0.1).", "127.0.0.1")
		.option("--https", "Enable HTTPS. Requires both --cert and --key.")
		.option("--cert <path>", "Path to a TLS certificate PEM file (implies HTTPS).")
		.option("--key <path>", "Path to a TLS private key PEM file (implies HTTPS).")
		.option(
			"--no-passcode",
			"Disable auto-generated passcode for remote access (for advanced users behind a reverse proxy).",
		)
		.option("--manual-passcode <value>", "Set a manual passcode for remote access.")

		.action(async (_options, cmd: Command) => {
			const options = cmd.optsWithGlobals() as {
				port: number;
				host: string;
				https: boolean;
				cert?: string;
				key?: string;
				noPasscode: boolean;
				manualPasscode?: string;
			};

			const client = await connectControlClient();
			if (client) {
				try {
					await client.call("restart");
					client.close();
					console.log("Kanban daemon restarted.");
					return;
				} catch {
					// Fall through to full stop/start
				}
			}

			// If daemon not running or restart failed, do a fresh start
			await runDaemon({
				foreground: false,
				port: options.port,
				host: options.host,
				https: options.https,
				cert: options.cert ?? null,
				key: options.key ?? null,
				noPasscode: options.noPasscode,
				passcode: options.manualPasscode ?? null,
			});
		});

	daemon
		.command("status")
		.description("Show daemon status.")
		.action(async () => {
			const status = await getDaemonStatus();
			if (!status) {
				await cleanStalePidFile();
				console.log("Kanban daemon is not running.");
				return;
			}

			const uptimeMinutes = Math.floor(status.uptimeMs / 60_000);
			const uptimeSeconds = Math.floor((status.uptimeMs % 60_000) / 1000);
			const uptime = uptimeMinutes > 0 ? `${uptimeMinutes}m ${uptimeSeconds}s` : `${uptimeSeconds}s`;

			console.log("Kanban daemon is running.");
			console.log(`  PID:            ${status.pid}`);
			console.log(`  Runtime port:   ${status.runtimePort}`);
			console.log(`  Uptime:         ${uptime}`);
			console.log(`  State:          ${status.state}`);
			console.log(`  Workspaces:     ${status.workspaceCount}`);
		});

	daemon
		.command("logs")
		.description("Stream daemon logs.")
		.option("--lines <n>", "Number of lines to show.", parsePort, 50)
		.action(async (options: { lines: number }) => {
			const logPath = getDaemonLogPath();
			try {
				const content = await readFile(logPath, "utf8");
				const lines = content.split("\n").filter((l) => l.trim().length > 0);
				const tail = lines.slice(-options.lines);
				console.log(tail.join("\n"));
			} catch {
				console.log("No daemon logs available.");
			}
		});

	daemon
		.command("install")
		.description("Install Kanban daemon as an OS service.")
		.option("--systemd", "Install systemd user service.")
		.option("--launchd", "Install launchd agent.")
		.option("--windows-task", "Install Windows Task Scheduler job.")
		.action(async (options: { systemd?: boolean; launchd?: boolean; windowsTask?: boolean }) => {
			if (options.systemd) {
				await installSystemdService();
			} else if (options.launchd) {
				await installLaunchdService();
			} else if (options.windowsTask) {
				await installWindowsTask();
			} else {
				console.log("Please specify --systemd, --launchd, or --windows-task.");
				process.exitCode = 1;
			}
		});
}

async function installSystemdService(): Promise<void> {
	const { mkdir, writeFile } = await import("node:fs/promises");
	const { homedir } = await import("node:os");
	const { join } = await import("node:path");

	const serviceDir = join(homedir(), ".config", "systemd", "user");
	await mkdir(serviceDir, { recursive: true });

	const kanbanPath = process.argv[1] ?? "kanban";
	const serviceContent = `[Unit]
Description=Kanban Daemon
After=network.target

[Service]
Type=simple
ExecStart=${kanbanPath} daemon start --foreground
ExecStop=${kanbanPath} daemon stop
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;

	const servicePath = join(serviceDir, "kanban.service");
	await writeFile(servicePath, serviceContent);

	console.log(`systemd user service installed to ${servicePath}`);
	console.log("Run the following commands:");
	console.log("  systemctl --user daemon-reload");
	console.log("  systemctl --user enable kanban");
	console.log("  systemctl --user start kanban");
}

async function installLaunchdService(): Promise<void> {
	const { mkdir, writeFile } = await import("node:fs/promises");
	const { homedir } = await import("node:os");
	const { join } = await import("node:path");

	const launchAgentsDir = join(homedir(), "Library", "LaunchAgents");
	await mkdir(launchAgentsDir, { recursive: true });

	const kanbanPath = process.argv[1] ?? "/usr/local/bin/kanban";
	const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cline.kanban</string>
  <key>ProgramArguments</key>
  <array>
    <string>${kanbanPath}</string>
    <string>daemon</string>
    <string>start</string>
    <string>--foreground</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${join(homedir(), "Library", "Logs", "kanban", "daemon.log")}</string>
  <key>StandardErrorPath</key>
  <string>${join(homedir(), "Library", "Logs", "kanban", "daemon.error.log")}</string>
</dict>
</plist>
`;

	const plistPath = join(launchAgentsDir, "com.cline.kanban.plist");
	await writeFile(plistPath, plistContent);

	console.log(`launchd agent installed to ${plistPath}`);
	console.log("Run the following commands:");
	console.log("  launchctl load ~/Library/LaunchAgents/com.cline.kanban.plist");
	console.log("  launchctl start com.cline.kanban");
}

async function installWindowsTask(): Promise<void> {
	console.log("Windows Task Scheduler integration is not yet implemented.");
	console.log("Please use the Windows Task Scheduler GUI or PowerShell to create a task that runs:");
	console.log(`  ${process.argv[1] ?? "kanban"} daemon start --foreground`);
}
