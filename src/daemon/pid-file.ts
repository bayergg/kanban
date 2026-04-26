import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface PidFileInfo {
	pid: number;
	writtenAt: number;
	runtimePort: number;
}

function getPlatformRuntimeDir(): string {
	if (process.platform === "win32") {
		const localAppData = process.env.LOCALAPPDATA;
		if (localAppData) {
			return join(localAppData, "kanban");
		}
		const userProfile = process.env.USERPROFILE;
		if (userProfile) {
			return join(userProfile, "AppData", "Local", "kanban");
		}
		throw new Error("Could not determine Windows LOCALAPPDATA.");
	}

	if (process.platform === "darwin") {
		const home = process.env.HOME;
		if (!home) {
			throw new Error("HOME environment variable is not set.");
		}
		return join(home, "Library", "Caches", "kanban");
	}

	// Linux and other Unix-like systems
	const xdgRuntimeDir = process.env.XDG_RUNTIME_DIR;
	if (xdgRuntimeDir) {
		return join(xdgRuntimeDir, "kanban");
	}

	const xdgStateHome = process.env.XDG_STATE_HOME;
	if (xdgStateHome) {
		return join(xdgStateHome, "kanban");
	}

	const home = process.env.HOME;
	if (!home) {
		throw new Error("HOME environment variable is not set.");
	}
	return join(home, ".local", "state", "kanban");
}

export function getPidFilePath(): string {
	return join(getPlatformRuntimeDir(), "daemon.pid");
}

export function getControlSocketPath(): string {
	if (process.platform === "win32") {
		return "\\\\.\\pipe\\kanban-control";
	}
	return join(getPlatformRuntimeDir(), "control.sock");
}

export function getDaemonLogPath(): string {
	if (process.platform === "win32") {
		const localAppData = process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? "", "AppData", "Local");
		return join(localAppData, "kanban", "daemon.log");
	}
	if (process.platform === "darwin") {
		const home = process.env.HOME ?? "";
		return join(home, "Library", "Logs", "kanban", "daemon.log");
	}
	const xdgStateHome = process.env.XDG_STATE_HOME;
	if (xdgStateHome) {
		return join(xdgStateHome, "kanban", "daemon.log");
	}
	return join(process.env.HOME ?? "", ".local", "state", "kanban", "daemon.log");
}

export async function ensureRuntimeDir(): Promise<void> {
	const dir = getPlatformRuntimeDir();
	await mkdir(dir, { recursive: true });
}

export async function writePidFile(info: PidFileInfo): Promise<void> {
	const path = getPidFilePath();
	await ensureRuntimeDir();
	await writeFile(path, JSON.stringify(info, null, 2), { mode: 0o600 });
}

export async function readPidFile(): Promise<PidFileInfo | null> {
	try {
		const path = getPidFilePath();
		const content = await readFile(path, "utf8");
		const parsed = JSON.parse(content) as unknown;
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"pid" in parsed &&
			typeof (parsed as Record<string, unknown>).pid === "number" &&
			"writtenAt" in parsed &&
			typeof (parsed as Record<string, unknown>).writtenAt === "number" &&
			"runtimePort" in parsed &&
			typeof (parsed as Record<string, unknown>).runtimePort === "number"
		) {
			return parsed as PidFileInfo;
		}
		return null;
	} catch {
		return null;
	}
}

export async function removePidFile(): Promise<void> {
	try {
		await unlink(getPidFilePath());
	} catch {
		// Ignore missing PID file
	}
}

export async function processIsRunning(pid: number): Promise<boolean> {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export async function isPidFileStale(): Promise<boolean> {
	const info = await readPidFile();
	if (!info) {
		return true;
	}
	const running = await processIsRunning(info.pid);
	return !running;
}

export async function cleanStalePidFile(): Promise<void> {
	if (await isPidFileStale()) {
		await removePidFile();
	}
}
