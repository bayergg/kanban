import { connect } from "node:net";
import type { ControlRequest, ControlResponse, DaemonStatus } from "./control-server";
import { getControlSocketPath } from "./pid-file";

export interface ControlClient {
	call: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>;
	close: () => void;
}

export async function connectControlClient(): Promise<ControlClient | null> {
	const socketPath = getControlSocketPath();

	return await new Promise<ControlClient | null>((resolve) => {
		const socket = connect(socketPath);
		let buffer = "";
		const pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();

		const handleData = (data: Buffer) => {
			buffer += data.toString("utf8");
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) {
					continue;
				}
				try {
					const response = JSON.parse(trimmed) as ControlResponse;
					const handler = pending.get(response.id);
					if (handler) {
						pending.delete(response.id);
						if (response.error) {
							handler.reject(new Error(`${response.error.code}: ${response.error.message}`));
						} else {
							handler.resolve(response.result);
						}
					}
				} catch {
					// Ignore malformed responses
				}
			}
		};

		socket.on("connect", () => {
			socket.on("data", handleData);

			let requestId = 0;
			const client: ControlClient = {
				call: <T = unknown>(method: string, params?: Record<string, unknown>) => {
					return new Promise<T>((res, rej) => {
						requestId += 1;
						const id = String(requestId);
						pending.set(id, { resolve: res as (value: unknown) => void, reject: rej });

						const request: ControlRequest = { id, method, params };
						socket.write(`${JSON.stringify(request)}\n`);

						// Timeout after 10s
						setTimeout(() => {
							if (pending.has(id)) {
								pending.delete(id);
								rej(new Error("Control request timed out"));
							}
						}, 10_000);
					});
				},
				close: () => {
					socket.destroy();
				},
			};

			resolve(client);
		});

		socket.on("error", () => {
			resolve(null);
		});
	});
}

export async function getDaemonStatus(): Promise<DaemonStatus | null> {
	const client = await connectControlClient();
	if (!client) {
		return null;
	}
	try {
		return await client.call<DaemonStatus>("status");
	} catch {
		return null;
	} finally {
		client.close();
	}
}

export async function isDaemonRunning(): Promise<boolean> {
	const status = await getDaemonStatus();
	return status !== null;
}
