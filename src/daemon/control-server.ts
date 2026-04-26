import { existsSync, unlinkSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { getControlSocketPath } from "./pid-file";

export interface ControlRequest {
	id: string;
	method: string;
	params?: Record<string, unknown>;
}

export interface ControlResponse {
	id: string;
	result?: unknown;
	error?: { code: string; message: string };
}

export interface DaemonStatus {
	pid: number;
	runtimePort: number;
	uptimeMs: number;
	state: "starting" | "running" | "stopping" | "failed";
	workspaceCount: number;
}

type ControlMethodHandler = (params: Record<string, unknown> | undefined) => Promise<unknown>;

export interface CreateControlServerDependencies {
	getRuntimePort: () => number;
	getWorkspaceCount: () => number;
	getDaemonStartTime: () => number;
	onStartRuntime: () => Promise<void>;
	onStopRuntime: () => Promise<void>;
	onRestartRuntime: () => Promise<void>;
}

export interface ControlServer {
	server: Server;
	start: () => Promise<void>;
	stop: () => Promise<void>;
	broadcastStatus: () => void;
}

function parseControlRequest(line: string): ControlRequest | null {
	try {
		const parsed = JSON.parse(line) as unknown;
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"id" in parsed &&
			typeof (parsed as Record<string, unknown>).id === "string" &&
			"method" in parsed &&
			typeof (parsed as Record<string, unknown>).method === "string"
		) {
			return parsed as ControlRequest;
		}
		return null;
	} catch {
		return null;
	}
}

function buildResponse(id: string, result: unknown): ControlResponse {
	return { id, result };
}

function buildErrorResponse(id: string, code: string, message: string): ControlResponse {
	return { id, error: { code, message } };
}

export function createControlServer(deps: CreateControlServerDependencies): ControlServer {
	const handlers = new Map<string, ControlMethodHandler>();

	handlers.set("status", async () => {
		const now = Date.now();
		const status: DaemonStatus = {
			pid: process.pid,
			runtimePort: deps.getRuntimePort(),
			uptimeMs: now - deps.getDaemonStartTime(),
			state: "running",
			workspaceCount: deps.getWorkspaceCount(),
		};
		return status;
	});

	handlers.set("start", async () => {
		await deps.onStartRuntime();
		return { ok: true };
	});

	handlers.set("stop", async () => {
		await deps.onStopRuntime();
		return { ok: true };
	});

	handlers.set("restart", async () => {
		await deps.onRestartRuntime();
		return { ok: true };
	});

	const sockets = new Set<Socket>();
	let server: Server | null = null;

	const handleConnection = (socket: Socket) => {
		sockets.add(socket);
		let buffer = "";

		socket.on("data", (data: Buffer) => {
			buffer += data.toString("utf8");
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) {
					continue;
				}

				const request = parseControlRequest(trimmed);
				if (!request) {
					socket.write(`${JSON.stringify(buildErrorResponse("", "PARSE_ERROR", "Invalid JSON request"))}\n`);
					continue;
				}

				const handler = handlers.get(request.method);
				if (!handler) {
					socket.write(
						`${JSON.stringify(buildErrorResponse(request.id, "METHOD_NOT_FOUND", `Unknown method: ${request.method}`))}\n`,
					);
					continue;
				}

				handler(request.params)
					.then((result) => {
						socket.write(`${JSON.stringify(buildResponse(request.id, result))}\n`);
					})
					.catch((error: unknown) => {
						const message = error instanceof Error ? error.message : String(error);
						socket.write(`${JSON.stringify(buildErrorResponse(request.id, "INTERNAL_ERROR", message))}\n`);
					});
			}
		});

		socket.on("close", () => {
			sockets.delete(socket);
		});

		socket.on("error", () => {
			sockets.delete(socket);
		});
	};

	const start = async (): Promise<void> => {
		const socketPath = getControlSocketPath();

		server = createServer(handleConnection);

		await new Promise<void>((resolve, reject) => {
			server?.once("error", reject);

			if (process.platform === "win32") {
				server?.listen(socketPath, () => {
					server?.off("error", reject);
					resolve();
				});
			} else {
				// Unix: unlink stale socket before binding
				try {
					if (existsSync(socketPath)) {
						unlinkSync(socketPath);
					}
				} catch {
					// Socket may not exist or permission denied
				}
				server?.listen(socketPath, () => {
					server?.off("error", reject);
					resolve();
				});
			}
		});
	};

	const stop = async (): Promise<void> => {
		for (const socket of sockets) {
			socket.destroy();
		}
		sockets.clear();

		if (server) {
			await new Promise<void>((resolve) => {
				server?.close(() => {
					resolve();
				});
			});
			server = null;
		}

		if (process.platform !== "win32") {
			try {
				const socketPath = getControlSocketPath();
				if (existsSync(socketPath)) {
					unlinkSync(socketPath);
				}
			} catch {
				// Ignore
			}
		}
	};

	const broadcastStatus = (): void => {
		const statusHandler = handlers.get("status");
		if (!statusHandler) {
			return;
		}
		statusHandler(undefined)
			.then((status) => {
				const payload = JSON.stringify({ type: "status", status });
				for (const socket of sockets) {
					socket.write(`${payload}\n`);
				}
			})
			.catch(() => {
				// Ignore broadcast errors
			});
	};

	return {
		get server() {
			if (!server) {
				throw new Error("Control server has not been started.");
			}
			return server;
		},
		start,
		stop,
		broadcastStatus,
	};
}
