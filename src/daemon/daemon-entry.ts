import { createWriteStream, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { installGracefulShutdownHandlers } from "../core/graceful-shutdown";
import {
	buildKanbanRuntimeUrl,
	clearKanbanRuntimeTls,
	getKanbanRuntimeOrigin,
	getKanbanRuntimePort,
	isKanbanRemoteHost,
	setKanbanRuntimeHost,
	setKanbanRuntimePort,
	setKanbanRuntimeTls,
} from "../core/runtime-endpoint";
import { disablePasscode, generateInternalToken, generatePasscode, setPasscode } from "../security/passcode-manager";
import type { RuntimeStateHub } from "../server/runtime-state-hub";
import type { WorkspaceRegistry } from "../server/workspace-registry";
import { createControlServer } from "./control-server";
import { getDaemonLogPath, removePidFile, writePidFile } from "./pid-file";
import { redirectStdio } from "./process-detach";

export interface StartDaemonOptions {
	foreground: boolean;
	port: number;
	host: string;
	https: boolean;
	cert: string | null;
	key: string | null;
	noPasscode: boolean;
	passcode: string | null;
	logPath?: string;
}

interface DaemonRuntime {
	workspaceRegistry: WorkspaceRegistry;
	runtimeStateHub: RuntimeStateHub;
	close: () => Promise<void>;
	shutdown: (options?: { skipSessionCleanup?: boolean }) => Promise<void>;
	url: string;
}

let daemonRuntime: DaemonRuntime | null = null;
let daemonStartTime = Date.now();

export function getDaemonStartTime(): number {
	return daemonStartTime;
}

export function getWorkspaceCount(): number {
	if (!daemonRuntime) {
		return 0;
	}
	return daemonRuntime.workspaceRegistry.listManagedWorkspaces().length;
}

export function getRuntimePort(): number {
	if (!daemonRuntime) {
		return getKanbanRuntimePort();
	}
	try {
		return parseInt(new URL(daemonRuntime.url).port, 10);
	} catch {
		return getKanbanRuntimePort();
	}
}

async function setupLogging(logPath: string): Promise<void> {
	await mkdir(dirname(logPath), { recursive: true });
	const logStream = createWriteStream(logPath, { flags: "a" });

	const originalStdoutWrite = process.stdout.write.bind(process.stdout);
	const originalStderrWrite = process.stderr.write.bind(process.stderr);

	process.stdout.write = (
		chunk: string | Uint8Array,
		encoding?: BufferEncoding | ((err?: Error | null) => void),
		cb?: (err?: Error | null) => void,
	) => {
		const data = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
		logStream.write(`[${new Date().toISOString()}] OUT ${data}`);
		if (typeof encoding === "function") {
			return originalStdoutWrite(chunk, undefined, encoding);
		}
		return originalStdoutWrite(chunk, encoding, cb);
	};

	process.stderr.write = (
		chunk: string | Uint8Array,
		encoding?: BufferEncoding | ((err?: Error | null) => void),
		cb?: (err?: Error | null) => void,
	) => {
		const data = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
		logStream.write(`[${new Date().toISOString()}] ERR ${data}`);
		if (typeof encoding === "function") {
			return originalStderrWrite(chunk, undefined, encoding);
		}
		return originalStderrWrite(chunk, encoding, cb);
	};
}

async function startRuntimeServer(options: StartDaemonOptions): Promise<DaemonRuntime> {
	console.log(`Starting runtime server on ${options.host}:${options.port}...`);
	setKanbanRuntimePort(options.port);
	setKanbanRuntimeHost(options.host);

	// ── TLS ──────────────────────────────────────────────────────────────
	const wantsHttps = options.https || options.cert !== null || options.key !== null;
	if (wantsHttps) {
		if (!options.cert || !options.key) {
			throw new Error("HTTPS requires both --cert and --key. Use plain HTTP if you do not have a TLS certificate.");
		}
		const cert = readFileSync(resolve(options.cert), "utf8");
		const key = readFileSync(resolve(options.key), "utf8");
		setKanbanRuntimeTls({ cert, key, ca: cert });
	} else {
		clearKanbanRuntimeTls();
	}

	// ── Passcode ─────────────────────────────────────────────────────────
	if (isKanbanRemoteHost()) {
		if (options.noPasscode) {
			disablePasscode();
			console.log("Passcode authentication disabled (--no-passcode). Ensure you have your own auth layer.");
		} else if (options.passcode) {
			setPasscode(options.passcode);
			generateInternalToken();
			console.log(`\n🔐 Remote access passcode set to: ${options.passcode}\n`);
		} else {
			const passcode = generatePasscode();
			generateInternalToken();
			console.log(`\n🔐 Remote access passcode: ${passcode}\n\nShare this with users who need access.\n`);
		}
	}

	const [
		{ createRuntimeServer },
		{ createRuntimeStateHub },
		{ resolveInteractiveShellCommand },
		{ shutdownRuntimeServer },
		{ collectProjectWorktreeTaskIdsForRemoval, createWorkspaceRegistry },
	] = await Promise.all([
		import("../server/runtime-server.js"),
		import("../server/runtime-state-hub.js"),
		import("../server/shell.js"),
		import("../server/shutdown-coordinator.js"),
		import("../server/workspace-registry.js"),
	]);

	const { loadGlobalRuntimeConfig, loadRuntimeConfig } = await import("../config/runtime-config.js");
	const { resolveProjectInputPath } = await import("../projects/project-path.js");
	const { pickDirectoryPathFromSystemDialog } = await import("../server/directory-picker.js");
	const { hasGitRepository } = await import("../cli.js");
	const { assertPathIsDirectory, pathIsDirectory, runScopedCommand } = await import("../cli.js");

	let runtimeStateHub: RuntimeStateHub | undefined;
	const workspaceRegistry = await createWorkspaceRegistry({
		cwd: process.cwd(),
		loadGlobalRuntimeConfig,
		loadRuntimeConfig,
		hasGitRepository,
		pathIsDirectory,
		onTerminalManagerReady: (workspaceId, manager) => {
			runtimeStateHub?.trackTerminalManager(workspaceId, manager);
		},
	});

	runtimeStateHub = createRuntimeStateHub({ workspaceRegistry });
	const runtimeHub = runtimeStateHub;

	for (const { workspaceId, terminalManager } of workspaceRegistry.listManagedWorkspaces()) {
		runtimeHub.trackTerminalManager(workspaceId, terminalManager);
	}

	const disposeTrackedWorkspace = (workspaceId: string, options?: { stopTerminalSessions?: boolean }) => {
		const disposed = workspaceRegistry.disposeWorkspace(workspaceId, {
			stopTerminalSessions: options?.stopTerminalSessions,
		});
		runtimeHub.disposeWorkspace(workspaceId);
		return disposed;
	};

	const runtimeServer = await createRuntimeServer({
		workspaceRegistry,
		runtimeStateHub: runtimeHub,
		warn: (message) => {
			console.warn(`[kanban] ${message}`);
		},
		ensureTerminalManagerForWorkspace: workspaceRegistry.ensureTerminalManagerForWorkspace,
		resolveInteractiveShellCommand,
		runCommand: runScopedCommand,
		resolveProjectInputPath,
		assertPathIsDirectory,
		hasGitRepository,
		disposeWorkspace: disposeTrackedWorkspace,
		collectProjectWorktreeTaskIdsForRemoval,
		pickDirectoryPathFromSystemDialog,
	});

	const close = async () => {
		await runtimeServer.close();
	};

	const shutdown = async (options?: { skipSessionCleanup?: boolean }) => {
		await shutdownRuntimeServer({
			workspaceRegistry,
			warn: (message) => {
				console.warn(`[kanban] ${message}`);
			},
			closeRuntimeServer: close,
			skipSessionCleanup: options?.skipSessionCleanup ?? false,
		});
	};

	const activeWorkspaceId = workspaceRegistry.getActiveWorkspaceId();
	const url = activeWorkspaceId
		? buildKanbanRuntimeUrl(`/${encodeURIComponent(activeWorkspaceId)}`)
		: getKanbanRuntimeOrigin();

	return {
		workspaceRegistry,
		runtimeStateHub: runtimeHub,
		close,
		shutdown,
		url,
	};
}

export async function runDaemon(options: StartDaemonOptions): Promise<void> {
	try {
		daemonStartTime = Date.now();

		if (!options.foreground) {
			redirectStdio();
		}

		const logPath = options.logPath ?? getDaemonLogPath();
		await setupLogging(logPath);

		console.log(`Kanban daemon starting (PID: ${process.pid})...`);
		console.log(`Options: host=${options.host}, port=${options.port}, foreground=${options.foreground}`);

		// Write PID file before starting server so status queries work immediately
		await writePidFile({ pid: process.pid, writtenAt: Date.now(), runtimePort: options.port });

		// Start control socket
		console.log("Initializing control server...");
		const controlServer = createControlServer({
			getRuntimePort: () => getRuntimePort(),
			getWorkspaceCount: () => getWorkspaceCount(),
			getDaemonStartTime: () => getDaemonStartTime(),
			onStartRuntime: async () => {
				if (!daemonRuntime) {
					daemonRuntime = await startRuntimeServer(options);
					await writePidFile({
						pid: process.pid,
						writtenAt: Date.now(),
						runtimePort: parseInt(new URL(daemonRuntime.url).port, 10),
					});
					console.log(`Runtime server started at ${daemonRuntime.url}`);
				}
			},
			onStopRuntime: async () => {
				if (daemonRuntime) {
					await daemonRuntime.shutdown();
					daemonRuntime = null;
					console.log("Runtime server stopped.");
				}
			},
			onRestartRuntime: async () => {
				if (daemonRuntime) {
					await daemonRuntime.shutdown();
					daemonRuntime = null;
				}
				daemonRuntime = await startRuntimeServer(options);
				console.log(`Runtime server restarted at ${daemonRuntime.url}`);
			},
		});

		await controlServer.start();
		console.log(`Control socket listening at ${options.foreground ? "foreground" : "background"}`);

		// Start runtime server immediately
		console.log("Starting runtime server...");
		daemonRuntime = await startRuntimeServer(options);
		const actualPort = parseInt(new URL(daemonRuntime.url).port, 10);
		await writePidFile({ pid: process.pid, writtenAt: Date.now(), runtimePort: actualPort });
		console.log(`Runtime server started at ${daemonRuntime.url}`);

		// Graceful shutdown
		let isShuttingDown = false;
		installGracefulShutdownHandlers({
			process,
			delayMs: 15000,
			exit: (code) => {
				process.exit(code);
			},
			onShutdown: async () => {
				if (isShuttingDown) {
					return;
				}
				isShuttingDown = true;
				console.log("Daemon shutting down...");
				await controlServer.stop();
				if (daemonRuntime) {
					await daemonRuntime.shutdown();
					daemonRuntime = null;
				}
				await removePidFile();
				console.log("Daemon stopped.");
			},
			onTimeout: (delayMs) => {
				console.error(`Daemon forced exit after shutdown timeout (${delayMs}ms).`);
			},
			onSecondSignal: (signal) => {
				console.error(`Daemon forced exit on second signal: ${signal}`);
			},
		});

		// Keep process alive
		if (options.foreground) {
			console.log("Daemon running in foreground mode. Press Ctrl+C to stop.");
		}

		// Wait forever (until process is killed or shutdown handler is triggered)
		await new Promise(() => {
			/* wait forever */
		});
	} catch (error) {
		const message = error instanceof Error ? error.stack || error.message : String(error);
		console.error(`FATAL: Failed to start Kanban daemon: ${message}`);
		await removePidFile();
		process.exit(1);
	}
}
