# Kanban Daemon/Service Architecture Design

## Executive Summary

Kanban is already architected as a hybrid CLI/server application. The conversion to a long-running daemon requires **process management and discovery layers**, not a server rewrite. The existing HTTP/WebSocket runtime server, tRPC API surface, and CLI client patterns are reusable with minimal changes.

**Estimated effort: 2-3 weeks for MVP; 4-6 weeks for production-ready service integration.**

---

## 1. Current Architecture Analysis

### 1.1 How Kanban Works Today

```
┌─────────────────────────────────────────────────────────────┐
│  CLI Process (foreground)                                   │
│  ┌─────────────────┐    ┌──────────────────────────────┐   │
│  │  Commander CLI  │────│  Lazy-loaded Runtime Server  │   │
│  │  (cli.ts)       │    │  (runtime-server.ts)         │   │
│  └─────────────────┘    │  - HTTP + WebSocket          │   │
│         │               │  - tRPC API                  │   │
│         │               │  - Web UI assets             │   │
│         │               └──────────────────────────────┘   │
│         │                              │                   │
│    Subcommands                        Browser             │
│  (task, hooks)                        Clients             │
│         │                              │                   │
│         └──────── tRPC over HTTP ──────┘                   │
└─────────────────────────────────────────────────────────────┘
```

**Key observations:**

- `kanban` (no subcommand) starts a server bound to `127.0.0.1:3484` by default
- `kanban task create`, `kanban hooks ingest`, etc. are **already client commands** — they detect/connect to the running server and call tRPC mutations
- `tryOpenExistingServer()` checks if a server is already running and reuses it
- The server lifecycle is tied to the foreground process (Ctrl+C shuts everything down)
- Graceful shutdown handlers manage cleanup of terminal sessions, Cline SDK services, and workspaces

### 1.2 Existing Server Stack

| Component | Technology | Daemon Reuse |
|-----------|-----------|--------------|
| HTTP API | Node.js `http`/`https` | Yes — unchanged |
| WebSocket | `ws` library | Yes — unchanged |
| API Router | tRPC standalone adapter | Yes — unchanged |
| Terminal PTY | `node-pty` | Yes — unchanged |
| Cline SDK | `@clinebot/core` | Yes — unchanged |
| State Storage | JSON files on disk | Yes — unchanged |
| Auth | Passcode + session cookies | Yes — enhanced for daemon |

### 1.3 Existing Client Stack

| Component | Purpose |
|-----------|---------|
| `createRuntimeTrpcClient()` | tRPC proxy client over HTTP |
| `getRuntimeFetch()` | `fetch()` with internal bearer token auth |
| `buildKanbanRuntimeUrl()` | URL construction from env vars |

---

## 2. Proposed Service Architecture

### 2.1 High-Level Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Kanban Daemon                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Control Server (Unix socket / named pipe)                  │   │
│  │  - start, stop, status, restart, logs, config               │   │
│  │  - PID file management                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Runtime Server (existing, unchanged)                       │   │
│  │  - HTTP on configurable port (default 3484)                 │   │
│  │  - WebSocket for terminal + state streaming                 │   │
│  │  - tRPC API for browser and CLI clients                     │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
         ▲                                    ▲
         │                                    │
    ┌────┴────┐                         ┌────┴────┐
    │   CLI   │                         │ Browser │
    │ Client  │                         │  Client │
    └─────────┘                         └─────────┘
```

### 2.2 Design Principles

1. **Minimal server changes** — The runtime server (`runtime-server.ts`) is already daemon-ready. We add a control plane around it.
2. **Backward-compatible CLI** — `kanban task create` continues to work exactly as before. When a daemon is running, CLI auto-discovers it.
3. **Opt-in daemonization** — Users can still run `kanban` in foreground mode. The daemon is an explicit choice.
4. **OS-native integration** — Provide service manager configs for systemd, launchd, and Windows Service.

---

## 3. IPC and Discovery

### 3.1 Two-Channel Architecture

| Channel | Transport | Purpose |
|---------|-----------|---------|
| **Control Plane** | Unix domain socket (nix) / Named pipe (Win) | Daemon lifecycle management (start, stop, status, logs) |
| **Data Plane** | TCP HTTP/WebSocket | Runtime API (tRPC), terminal I/O, web UI |

### 3.2 Control Plane Protocol

The control plane uses a simple line-delimited JSON protocol over the Unix socket.

**Request format:**
```json
{"id":"req-1","method":"status","params":{}}
```

**Response format:**
```json
{"id":"req-1","result":{"pid":12345,"runtimePort":3484,"uptimeMs":3600000,"state":"running"}}
```

**Methods:**

| Method | Description |
|--------|-------------|
| `start` | Start the runtime server (if not running) |
| `stop` | Graceful shutdown of runtime server |
| `restart` | Stop then start runtime server |
| `status` | Daemon health, runtime port, uptime, active workspaces |
| `logs` | Stream recent log lines |
| `config get` | Read daemon configuration |
| `config set` | Update daemon configuration |

### 3.3 Discovery Mechanism

```typescript
// Pseudocode for CLI client discovery
async function discoverDaemon(): Promise<DaemonInfo | null> {
  // 1. Check Unix socket / named pipe
  const socketPath = getControlSocketPath();
  if (await canConnect(socketPath)) {
    return await queryStatus(socketPath);
  }

  // 2. Fallback: check PID file
  const pidFile = getPidFilePath();
  if (await pidFileExists(pidFile)) {
    const pid = await readPidFile(pidFile);
    if (await processIsRunning(pid)) {
      // Daemon may be starting up; retry socket with backoff
      return await retryConnect(socketPath, { maxAttempts: 5 });
    }
    // Stale PID file — remove it
    await removePidFile(pidFile);
  }

  // 3. Fallback: check legacy TCP port (pre-daemon behavior)
  if (await canReachRuntimeServer(DEFAULT_PORT)) {
    return { mode: 'foreground', port: DEFAULT_PORT };
  }

  return null;
}
```

### 3.4 Socket / Pipe Paths

| Platform | Control Socket | PID File | Log File |
|----------|---------------|----------|----------|
| Linux | `$XDG_RUNTIME_DIR/kanban/control.sock` or `/run/user/$(id - u)/kanban/control.sock` | `$XDG_RUNTIME_DIR/kanban/daemon.pid` | `$XDG_STATE_HOME/kanban/daemon.log` |
| macOS | `$HOME/Library/Caches/kanban/control.sock` | `$HOME/Library/Caches/kanban/daemon.pid` | `$HOME/Library/Logs/kanban/daemon.log` |
| Windows | `\\.\pipe\kanban-control` | `%LOCALAPPDATA%\kanban\daemon.pid` | `%LOCALAPPDATA%\kanban\daemon.log` |

---

## 4. Daemon Lifecycle

### 4.1 States

```
┌─────────┐    start     ┌──────────┐    runtime    ┌─────────┐
│ stopped │─────────────▶│ starting │──────────────▶│ running │
└─────────┘              └──────────┘    ready      └─────────┘
                             │                          │
                             │ error                    │ stop / restart
                             ▼                          ▼
                        ┌─────────┐                ┌──────────┐
                        │  failed │                │ stopping │
                        └─────────┘                └──────────┘
                                                          │
                                                          ▼
                                                     ┌─────────┐
                                                     │ stopped │
                                                     └─────────┘
```

### 4.2 Startup Sequence

1. **Daemonize** (double-fork on Unix, service context on Windows)
2. **Write PID file**
3. **Bind control socket**
4. **Start runtime server** (lazy-load heavy modules)
5. **Write ready file** (signals to systemd/launchd that we're up)
6. **Enter event loop**

### 4.3 Shutdown Sequence

1. **Stop accepting new control connections**
2. **Graceful runtime server shutdown** (existing `shutdownRuntimeServer` logic)
3. **Close control socket**
4. **Remove PID file**
5. **Exit process**

---

## 5. Command Mapping

### 5.1 New Daemon Commands

```
kanban daemon start     # Start daemon in background
kanban daemon stop      # Stop daemon
kanban daemon restart   # Restart daemon
kanban daemon status    # Show daemon status
kanban daemon logs      # Stream daemon logs
kanban daemon config    # Manage daemon configuration
```

### 5.2 Existing Commands (unchanged behavior)

```
kanban                  # If daemon running → open browser. If not → start foreground server
kanban task create      # If daemon running → use daemon. If not → spawn foreground server
kanban task list        # Same as above
kanban task start       # Same as above
kanban task trash       # Same as above
kanban task delete      # Same as above
kanban task update      # Same as above
kanban task link        # Same as above
kanban task unlink      # Same as above
kanban hooks ingest     # Same as above
kanban hooks notify     # Same as above
kanban hooks codex-wrapper  # Same as above
kanban update           # Update Kanban binary (stops daemon if running)
```

### 5.3 Implicit Daemon Mode

When the daemon is installed as an OS service, the CLI can be configured to **always prefer the daemon**:

```bash
# ~/.config/kanban/config.json
{
  "daemon": {
    "preferred": true,      // Always use daemon if running
    "autoStart": true,      // Start daemon on first CLI invocation if not running
    "foregroundFallback": true  // Fall back to foreground if daemon fails
  }
}
```

---

## 6. OS Service Manager Support

### 6.1 systemd (Linux)

**User service** (recommended — no root required):

```ini
# ~/.config/systemd/user/kanban.service
[Unit]
Description=Kanban Daemon
After=network.target

[Service]
Type=notify
ExecStart=%h/.local/bin/kanban daemon start --foreground
ExecStop=%h/.local/bin/kanban daemon stop
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

**Commands:**
```bash
systemctl --user enable kanban
systemctl --user start kanban
systemctl --user status kanban
```

### 6.2 launchd (macOS)

```xml
<!-- ~/Library/LaunchAgents/com.cline.kanban.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cline.kanban</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/kanban</string>
    <string>daemon</string>
    <string>start</string>
    <string>--foreground</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/%USER/Library/Logs/kanban/daemon.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/%USER/Library/Logs/kanban/daemon.error.log</string>
</dict>
</plist>
```

**Commands:**
```bash
launchctl load ~/Library/LaunchAgents/com.cline.kanban.plist
launchctl start com.cline.kanban
launchctl list com.cline.kanban
```

### 6.3 Windows Service

Using `node-windows` or a lightweight native wrapper:

```powershell
# Install as Windows Service (requires admin)
kanban daemon install --windows-service

# Or use sc.exe
sc.exe create Kanban binPath= "C:\Program Files\kanban\kanban.exe daemon start --foreground"
sc.exe start Kanban
```

**Alternative: Use Windows Task Scheduler** (no admin required):
```powershell
# Run at logon, keep alive
$action = New-ScheduledTaskAction -Execute "kanban" -Argument "daemon start --foreground"
$trigger = New-ScheduledTaskTrigger -AtLogon
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "KanbanDaemon" -Action $action -Trigger $trigger -Settings $settings
```

### 6.4 Service Manager Integration Matrix

| Manager | Install Method | Auto-Start | Log Rotation | Privileges |
|---------|---------------|------------|--------------|------------|
| systemd --user | `kanban daemon install --systemd` | User login | journald | None |
| systemd system | `sudo kanban daemon install --systemd --system` | Boot | journald | root |
| launchd | `kanban daemon install --launchd` | User login | file | None |
| Windows Service | `kanban daemon install --windows-service` | Boot/System | file | Admin |
| Windows Task Scheduler | `kanban daemon install --windows-task` | User login | file | None |

---

## 7. Implementation Plan

### Phase 1: Core Daemon (Week 1)

- [ ] Create `src/daemon/` module
- [ ] Implement control socket server (Unix + Windows)
- [ ] Implement daemon process (double-fork on Unix)
- [ ] PID file management
- [ ] Log file redirection
- [ ] `kanban daemon start/stop/status` commands
- [ ] CLI auto-discovery of daemon

### Phase 2: Service Manager Integration (Week 2)

- [ ] `kanban daemon install/uninstall` command
- [ ] systemd unit file generation
- [ ] launchd plist generation
- [ ] Windows service wrapper (or Task Scheduler)
- [ ] Log rotation configuration

### Phase 3: Production Hardening (Week 3-4)

- [ ] Daemon health checks / heartbeat
- [ ] Automatic restart on crash
- [ ] Runtime server port conflict resolution (already partially implemented)
- [ ] Graceful zero-downtime restart (socket passing)
- [ ] Configuration hot-reload
- [ ] Telemetry for daemon mode

---

## 8. Pros and Cons

### Pros of Daemon Mode

| Benefit | Description |
|---------|-------------|
| **Persistent sessions** | Task agents continue running even if terminal closes |
| **Faster CLI** | No server startup time on each subcommand invocation |
| **Remote access** | HTTP server always available for browser/IDE integration |
| **System integration** | Proper logging, monitoring, auto-restart via systemd/launchd |
| **Resource efficiency** | Single Node.js process instead of one per invocation |
| **Upgrade without disruption** | Hot-reload or graceful restart strategies |

### Cons / Risks

| Risk | Mitigation |
|------|-----------|
| **Process orphaning** | PID files + control socket ensure cleanup detection |
| **Port conflicts** | Auto-port retry already exists; daemon can reserve a range |
| **Security surface** | Control socket is user-only (0600 permissions); no network exposure |
| **Complexity** | Daemon is optional; foreground mode remains default |
| **Log management** | OS service managers (journald, launchd) handle rotation |
| **Debugging** | `kanban daemon logs` streams logs; `--foreground` flag for dev |

### Comparison Table

| Aspect | Current CLI | Daemon Mode |
|--------|------------|-------------|
| Startup time | 2-5s (server load) | ~50ms (tRPC call) |
| Session persistence | No (dies with Ctrl+C) | Yes |
| Background tasks | No | Yes |
| Auto-restart | No | Yes (via OS manager) |
| Log access | stdout/stderr | Structured log file |
| Multiple users | Each has own process | One per user |
| Resource use | Multiple Node processes | Single Node process |

---

## 9. File Structure

```
src/
├── cli.ts                          # Entry point (minimal change)
├── daemon/
│   ├── daemon-entry.ts             # Daemon main process
│   ├── control-server.ts           # Unix socket / named pipe control plane
│   ├── control-client.ts           # CLI client for control plane
│   ├── pid-file.ts                 # PID file read/write/cleanup
│   ├── process-detach.ts           # Unix double-fork, Windows service context
│   ├── log-sink.ts                 # File-based logging for daemon mode
│   └── install/
│       ├── systemd.ts              # systemd unit generation
│       ├── launchd.ts              # launchd plist generation
│       └── windows.ts              # Windows service/Task Scheduler
├── commands/
│   ├── daemon.ts                   # New: kanban daemon <subcommand>
│   ├── task.ts                     # Unchanged (already uses tRPC client)
│   └── hooks.ts                    # Unchanged
├── server/
│   ├── runtime-server.ts           # Unchanged
│   └── ...                         # Unchanged
└── core/
    ├── runtime-endpoint.ts         # Minor: add daemon discovery
    └── graceful-shutdown.ts        # Minor: daemon-aware signals
```

---

## 10. Open Questions

1. **Should the daemon run per-user or per-system?**  
   → Recommend per-user (safer, no root, aligns with current CLI permissions)

2. **How to handle daemon updates?**  
   → `kanban update` should detect daemon mode, stop daemon, replace binary, restart daemon

3. **Should we support socket activation (systemd)?**  
   → Nice-to-have for Phase 3; not required for MVP

4. **What about the web UI build?**  
   → Unchanged; served from `dist/web-ui` as before

5. **Should control plane use gRPC or HTTP/2 instead of JSON-over-socket?**  
   → JSON-over-Unix-socket is simpler, zero dependencies, and sufficient for local control

---

## 11. Appendix: PoC Code

Proof-of-concept implementations have been created in `src/daemon/` and `src/commands/daemon.ts`:

| File | Purpose |
|------|---------|
| `src/daemon/pid-file.ts` | Cross-platform PID file and socket path management |
| `src/daemon/control-server.ts` | Unix socket / named pipe control plane server |
| `src/daemon/control-client.ts` | CLI client for control plane queries |
| `src/daemon/process-detach.ts` | Unix double-fork and Windows detached process spawn |
| `src/daemon/daemon-entry.ts` | Daemon main process — wraps existing runtime server |
| `src/commands/daemon.ts` | `kanban daemon <start|stop|restart|status|logs|install>` command |

The PoC integrates with the existing codebase with minimal changes:
- Exported `assertPathIsDirectory`, `pathIsDirectory`, `hasGitRepository`, `runScopedCommand` from `src/cli.ts`
- Registered `registerDaemonCommand` in the Commander program
- Type-checks cleanly and passes all existing tests

### Quick test

```bash
# Start daemon in foreground for testing
npx tsx src/cli.ts daemon start --foreground

# In another terminal
npx tsx src/cli.ts daemon status
npx tsx src/cli.ts daemon stop
```

### Build and Install

To use the `kanban` command globally (including `kanban daemon`):

```bash
# Build and link globally
npm run link

# Or manually:
npm run build
npm link

# Verify
kanban --version
kanban daemon --help
```

**Uninstall:**
```bash
npm run unlink
# or: npm unlink -g kanban
```

### Usage Examples

```bash
# Start daemon in background
kanban daemon start

# Start with custom host and passcode (for remote access)
kanban daemon start --host 0.0.0.0 --manual-passcode secret123

# Start with HTTPS
kanban daemon start --host 0.0.0.0 --https --cert ./cert.pem --key ./key.pem

# Check status
kanban daemon status

# View logs
kanban daemon logs

# Stop daemon
kanban daemon stop

# Restart daemon
kanban daemon restart

# Install as systemd service (Linux)
kanban daemon install --systemd
systemctl --user daemon-reload
systemctl --user enable kanban
systemctl --user start kanban

# Install as launchd agent (macOS)
kanban daemon install --launchd
launchctl load ~/Library/LaunchAgents/com.cline.kanban.plist
```
