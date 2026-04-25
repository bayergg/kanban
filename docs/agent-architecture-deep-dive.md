# Dokumentasi Arsitektur Kanban: Dari CLI sampai Agent Berjalan

Dokumen ini menjelaskan secara komprehensif bagaimana mekanisme agent bekerja di codebase Kanban, dari command line interface (CLI) sampai agent berjalan di worktree.

## Daftar Isi

1. [Alur Lengkap dari CLI sampai Agent Berjalan](#1-alur-lengkap-dari-cli-sampai-agent-berjalan)
2. [Dua Jalur Agent: Cline Native vs Terminal/PTY](#2-dua-jalur-agent-cline-native-vs-terminalpty)
3. [Worktree: Pembuatan dan Penggunaan](#3-worktree-pembuatan-dan-penggunaan)
4. [Proses Spawn Agent (node-pty, binary, args, env)](#4-proses-spawn-agent-node-pty-binary-args-env)
5. [Adapter Pattern per Agent](#5-adapter-pattern-per-agent)
6. [Hook System dan State Transitions](#6-hook-system-dan-state-transitions)
7. [Task Agent vs Sidebar Agent](#7-task-agent-vs-sidebar-agent)
8. [File-File Kunci](#8-file-file-kunci)

---

## 1. Alur Lengkap dari CLI sampai Agent Berjalan

### 1.1 Entry Point CLI

File utama: `src/cli.ts:1`

Ketika user menjalankan `kanban` atau `kanban --agent codex`, proses berikut terjadi:

```
┌─────────────────────────────────────────────────────────────────┐
│  User menjalankan: kanban [options]                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  cli.ts: parseCliPortValue()                                    │
│  cli.ts: applyRuntimePortOption()                               │
│  cli.ts: resolveRuntimeTls()                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  cli.ts: tryOpenExistingServer()                                │
│  → Cek apakah server sudah berjalan di port tersebut            │
│  → Jika ya, buka browser tab ke server yang sudah ada           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (jika belum ada server)
┌─────────────────────────────────────────────────────────────────┐
│  cli.ts: startServer()                                          │
│  → Lazy import modul server-only                                │
│  → createWorkspaceRegistry()                                    │
│  → createRuntimeStateHub()                                      │
│  → createRuntimeServer()                                        │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Server Startup

File: `src/cli.ts:376-478`

Fungsi `startServer()` menginisialisasi:

1. **WorkspaceRegistry** (`src/server/workspace-registry.ts:186`) - Mengelola workspace yang terbuka, konfigurasi runtime, dan terminal manager per workspace
2. **RuntimeStateHub** (`src/server/runtime-state-hub.ts:63`) - Central fanout point untuk live updates ke browser via websocket
3. **RuntimeServer** (`src/server/runtime-server.ts:95`) - HTTP/HTTPS server dengan TRPC API dan websocket upgrade handler

### 1.3 Routing Request dari Browser

File: `src/trpc/app-router.ts:1`, `src/trpc/runtime-api.ts:90`

```
Browser UI
    │
    ▼
TRPC Client (web-ui/src/runtime/trpc-client.ts)
    │
    ▼
app-router.ts - Typed contract browser ↔ runtime
    │
    ▼
runtime-api.ts - Coordinator/validator
    │
    ├──► TerminalSessionManager (untuk PTY agents)
    │
    └──► ClineTaskSessionService (untuk native Cline)
```

### 1.4 Flow Task Session Start

File: `src/trpc/runtime-api.ts:164-200`

Ketika user memulai task:

1. `runtime-api.ts:startTaskSession()` menerima request dari browser
2. Menentukan apakah menggunakan **Cline native path** atau **PTY path** berdasarkan `effectiveAgentId`
3. Untuk PTY path: memanggil `TerminalSessionManager.startTaskSession()`
4. Untuk Cline path: memanggil `ClineTaskSessionService.startTaskSession()`
5. RuntimeStateHub mengirim update ke browser via websocket

---

## 2. Dua Jalur Agent: Cline Native vs Terminal/PTY

Kanban mendukung dua jalur eksekusi agent yang fundamental berbeda:

### 2.1 PTY-Backed Agents (Process-Oriented)

Jalur untuk: Claude, Codex, Gemini, OpenCode, Droid, Kiro

File kunci: `src/terminal/session-manager.ts:1`, `src/terminal/pty-session.ts:1`

```
┌─────────────────────────────────────────────────────────────────┐
│  PTY Runtime                                                     │
│  src/terminal/                                                   │
│                                                                  │
│  agent-registry.ts         → Menentukan binary & args           │
│  agent-session-adapters.ts → Menyiapkan launch per agent        │
│  session-manager.ts        → Owns process lifecycle             │
│  pty-session.ts            → node-pty spawn wrapper             │
│  session-state-machine.ts  → State transitions                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  node-pty.spawn(binary, args, { cwd, env, cols, rows })         │
│                                                                  │
│  → Process berjalan di worktree                                 │
│  → Output difilter (ANSI protocol)                              │
│  → Summary updates diteruskan ke state hub                      │
└─────────────────────────────────────────────────────────────────┘
```

Karakteristik PTY path:
- Agent adalah **binary CLI** yang di-spawn sebagai subprocess
- Output terminal (stdout/stderr) di-stream ke browser
- State transitions ditentukan oleh hook events dan output parsing
- Session summary mencakup: `state`, `pid`, `exitCode`, `reviewReason`

### 2.2 Native Cline (Session-Oriented)

Jalur untuk: Cline only

File kunci: `src/cline-sdk/cline-task-session-service.ts:1`

```
┌─────────────────────────────────────────────────────────────────┐
│  Native Cline Integration                                        │
│  src/cline-sdk/                                                  │
│                                                                  │
│  cline-provider-service.ts       → Provider settings, OAuth     │
│  cline-task-session-service.ts   → Task-oriented facade         │
│  cline-session-runtime.ts        → SDK session host ownership   │
│  cline-message-repository.ts     → Chat state & hydration       │
│  cline-event-adapter.ts          → SDK event translation        │
│  sdk-provider-boundary.ts        → Only SDK import for auth     │
│  sdk-runtime-boundary.ts         → Only SDK import for runtime  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  @clinebot/core and @clinebot/llms                              │
│                                                                  │
│  → Provider store & catalog                                     │
│  → Session host & persisted records                             │
│  → OAuth helpers & refresh                                      │
│  → Chat history persistence                                     │
└─────────────────────────────────────────────────────────────────┘
```

Karakteristik native Cline path:
- Menggunakan **published SDK packages** (`@clinebot/core`, `@clinebot/llms`)
- Session **di-host oleh SDK**, bukan oleh Kanban
- Chat history **dipersist oleh SDK**, Kanban hanya menghidrasi
- Provider settings dan OAuth **dimiliki SDK**, Kanban tidak menyimpan secrets
- Event-driven: SDK mengirim events (chunk, hook, status, ended) yang diterjemahkan oleh `cline-event-adapter.ts`

### 2.3 Perbandingan

| Aspek | PTY Agents | Native Cline |
|-------|-----------|--------------|
| Execution model | Process spawn | SDK session host |
| Output | Terminal stdout/stderr | Structured chat messages |
| State persistence | Runtime memory only | SDK persisted artifacts |
| Auth/Secrets | CLI handles its own | SDK provider store |
| History | None (fresh each run) | Full session history |
| Hook mechanism | External hook scripts | Internal SDK hooks |
| Restart behavior | Auto-restart available | Resume from persistence |

---

## 3. Worktree: Pembuatan dan Penggunaan

### 3.1 Konsep Worktree

File: `src/workspace/task-worktree.ts:1`

Kanban menggunakan **git worktree** untuk setiap task. Setiap task card memiliki direktori kerja terpisah yang:
- Berbasis pada base ref (branch atau commit)
- Terpisah dari working tree utama
- Dapat dihapus dan dibuat ulang tanpa mengganggu repo utama

### 3.2 Alur Pembuatan Worktree

```
User memindahkan card ke "In Progress"
    │
    ▼
runtime-api.ts:startTaskSession()
    │
    ▼
resolveTaskCwd() → task-worktree.ts:124
    │
    ├──► Cek apakah worktree sudah ada
    │
    └──► Jika belum:
         │
         ▼
    ┌─────────────────────────────────────┐
    │  ensureTaskWorktree()                │
    │  → git worktree add <path> <baseRef> │
    │  → Setup symlink untuk ignored paths │
    │  → Lock dengan lockedFileSystem      │
    └─────────────────────────────────────┘
```

### 3.3 Struktur Worktree

```
~/.cline/worktrees/
└── <normalized-task-id>/
    └── <workspace-label>/          ← Git worktree untuk task ini
        ├── .git                    ← File (bukan symlink) yang menunjuk ke main repo
        ├── [file sources...]       ← Checkout dari base ref
        └── node_modules/           ← Symlink ke original (jika di-ignore)
```

### 3.4 Mirror Ignored Paths

File: `src/workspace/task-worktree.ts:33-46`

Kanban secara cerdas membuat **symlink** untuk path yang di-ignore oleh git (seperti `node_modules`, `.env`, dll) agar task worktree tetap fungsional tanpa duplikasi:

```typescript
// Mirror ignored paths sebagai symlink
async function mirrorIgnoredPath(options: {
  sourcePath: string;
  targetPath: string;
  isDirectory: boolean;
}): Promise<"mirrored" | "skipped">
```

### 3.5 Cleanup dan Trash

File: `src/workspace/task-worktree.ts:190-200`

Ketika task dihapus (move to trash):
1. Changes di-capture sebagai patch file
2. Worktree dihapus via `git worktree remove`
3. Patch disimpan di `~/.cline/trashed-task-patches/`
4. Saat restore dari trash, patch di-apply kembali

---

## 4. Proses Spawn Agent (node-pty, binary, args, env)

### 4.1 PTY Spawn

File: `src/terminal/pty-session.ts:86-104`

```typescript
static spawn({ binary, args = [], cwd, env, cols, rows, onData, onExit }: SpawnPtySessionRequest): PtySession {
  const normalizedArgs = typeof args === "string" ? [args] : args;
  const terminalName = env?.TERM?.trim() || process.env.TERM?.trim() || "xterm-256color";
  const launchEnv: NodeJS.ProcessEnv = env ? { ...process.env, ...env } : process.env;
  
  // Windows-specific handling
  const useWindowsShellLaunch = shouldUseWindowsCmdLaunch(binary, process.platform, launchEnv);
  const spawnBinary = useWindowsShellLaunch ? resolveWindowsComSpec(launchEnv) : binary;
  const spawnArgs = useWindowsShellLaunch ? buildWindowsCmdArgsCommandLine(binary, normalizedArgs) : normalizedArgs;
  
  const ptyOptions: pty.IPtyForkOptions = {
    name: terminalName,
    cwd,
    env,
    cols,
    rows,
    encoding: null,  // Buffer output, bukan string
  };

  const ptyProcess = pty.spawn(spawnBinary, spawnArgs, ptyOptions);
  return new PtySession(ptyProcess, onData, onExit);
}
```

### 4.2 Environment Variables

File: `src/terminal/session-manager.ts:183-193`

```typescript
function buildTerminalEnvironment(
  ...sources: Array<Record<string, string | undefined> | undefined>
): Record<string, string | undefined> {
  return {
    ...process.env,
    ...Object.assign({}, ...sources),
    COLORTERM: "truecolor",
    TERM: "xterm-256color",
    TERM_PROGRAM: "kanban",
  };
}
```

### 4.3 Session Manager Spawn Flow

File: `src/terminal/session-manager.ts:295-481`

```
startTaskSession(request)
    │
    ├──► 1. Validate/clone request
    │
    ├──► 2. Stop existing active session (if any)
    │
    ├──► 3. Create TerminalStateMirror (cols x rows)
    │
    ├──► 4. prepareAgentLaunch(request)  ← Adapter pattern
    │      → Returns: binary, args, env, cleanup, deferredStartupInput,
    │                 detectOutputTransition, shouldInspectOutputForTransition
    │
    ├──► 5. Build terminal environment
    │      → merge process.env + request.env + launch.env
    │
    ├──► 6. PtySession.spawn({ binary, args, cwd, env, cols, rows, onData, onExit })
    │
    └──► 7. Update summary state → "running"
```

### 4.4 Windows-Specific Launch

File: `src/core/windows-cmd-launch.ts`

Di Windows, beberapa agent tidak bisa di-spawn langsung. Kanban menggunakan CMD sebagai launcher:

```
Binary: cmd.exe
Args: ["/c", "claude", "--dangerously-skip-permissions", "task prompt here"]
```

---

## 5. Adapter Pattern per Agent

File: `src/terminal/agent-session-adapters.ts:1`

Setiap agent memiliki **adapter** yang menyiapkan binary, arguments, environment variables, dan hook scripts sesuai kebutuhan agent tersebut.

### 5.1 Interface Adapter

```typescript
interface AgentSessionAdapter {
  prepare(input: AgentAdapterLaunchInput): Promise<PreparedAgentLaunch>;
}

interface PreparedAgentLaunch {
  binary?: string;           // Bisa override binary (e.g., wrapper script)
  args: string[];            // CLI arguments
  env: Record<string, string | undefined>;
  cleanup?: () => Promise<void>;
  deferredStartupInput?: string;  // Input yang ditunda (e.g., Codex plan mode)
  detectOutputTransition?: AgentOutputTransitionDetector;
  shouldInspectOutputForTransition?: AgentOutputTransitionInspectionPredicate;
}
```

### 5.2 Claude Adapter

File: `src/terminal/agent-session-adapters.ts:623-728`

```typescript
const claudeAdapter: AgentSessionAdapter = {
  async prepare(input) {
    // 1. Autonomous mode: tambah --dangerously-skip-permissions
    if (input.autonomousModeEnabled && !hasCliOption(args, "--dangerously-skip-permissions")) {
      args.push("--dangerously-skip-permissions");
    }
    
    // 2. Resume: tambah --continue
    if (input.resumeFromTrash && !hasCliOption(args, "--continue")) {
      args.push("--continue");
    }
    
    // 3. Plan mode: --permission-mode plan
    if (input.startInPlanMode) {
      args.push("--permission-mode", "plan");
    }
    
    // 4. Setup hooks: tulis settings.json dengan hook commands
    //    Hook events: Stop, SubagentStop, PreToolUse, PermissionRequest, 
    //                 PostToolUse, PostToolUseFailure, Notification, UserPromptSubmit
    
    // 5. System prompt: --append-system-prompt
    
    // 6. Prompt: append ke args
    return { args, env };
  }
};
```

**Claude hooks** (`src/terminal/agent-session-adapters.ts:651-709`):
- `Stop` → `to_review`
- `SubagentStop` → `activity`
- `PreToolUse` → `activity`
- `PermissionRequest` → `to_review`
- `PostToolUse` → `to_in_progress`
- `Notification` → `to_review` (permission_prompt) atau `activity`
- `UserPromptSubmit` → `to_in_progress`

### 5.3 Codex Adapter

File: `src/terminal/agent-session-adapters.ts:751-828`

```typescript
const codexAdapter: AgentSessionAdapter = {
  async prepare(input) {
    // 1. Disable update check: -c check_for_update_on_startup=false
    
    // 2. Autonomous mode: --dangerously-bypass-approvals-and-sandbox
    
    // 3. Resume: codex resume --last
    
    // 4. Developer instructions dari appended system prompt
    
    // 5. Plan mode: deferred startup input /plan <prompt>
    
    // 6. Hooks via codex-wrapper script
    //    Wrapper menonton Codex session logs untuk hook events
    
    return { binary, args, env, deferredStartupInput, 
             detectOutputTransition: codexPromptDetector,
             shouldInspectOutputForTransition };
  }
};
```

**Codex output transition detector** (`src/terminal/agent-session-adapters.ts:730-742`):
- Mendeteksi prompt marker `›` di output
- Ketika terdeteksi, trigger `agent.prompt-ready` event
- Ini memungkinkan state transition dari `awaiting_review` → `running`

### 5.4 Gemini Adapter

File: `src/terminal/agent-session-adapters.ts:830-913`

```typescript
const geminiAdapter: AgentSessionAdapter = {
  async prepare(input) {
    // 1. Autonomous mode: --yolo
    
    // 2. Resume: --resume latest
    
    // 3. Plan mode: --approval-mode=plan
    
    // 4. Hooks via GEMINI_CLI_SYSTEM_SETTINGS_PATH
    //    Hook events: BeforeTool, AfterTool, AfterAgent, BeforeAgent, Notification
    
    // 5. System prompt via GEMINI_SYSTEM_MD
    
    // 6. Prompt: -i <prompt>
    return { args, env };
  }
};
```

### 5.5 OpenCode Adapter

File: `src/terminal/agent-session-adapters.ts:1142-1211`

```typescript
const opencodeAdapter: AgentSessionAdapter = {
  async prepare(input) {
    // 1. Resume: --continue
    
    // 2. Plan mode: OPENCODE_EXPERIMENTAL_PLAN_MODE=true, --agent plan
    
    // 3. Hooks via JavaScript plugin (kanban.js)
    //    Plugin mendengarkan OpenCode events dan memanggil kanban hooks
    //    Events: session.status, message.updated, message.part.updated,
    //            tool.execute.before, tool.execute.after, permission.ask
    
    // 4. Model resolution dari config
    
    // 5. Prompt: --prompt <full_prompt>
    return { args, env };
  }
};
```

**OpenCode Plugin** (`src/terminal/agent-session-adapters.ts:285-580`):
- Plugin JavaScript yang di-inject ke OpenCode
- Menangani events: `session.status`, `message.updated`, `tool.execute.before/after`, `permission.ask`
- Mengirim hooks: `to_review`, `to_in_progress`, `activity`
- Track root session vs child sessions (hanya root yang kirim hooks)

### 5.6 Droid Adapter

File: `src/terminal/agent-session-adapters.ts:1213-1293`

```typescript
const droidAdapter: AgentSessionAdapter = {
  async prepare(input) {
    // 1. Resume: --resume
    
    // 2. Autonomy mode: spec (plan), auto-high (autonomous), atau normal
    
    // 3. Hooks via settings.json
    //    Hook events: Stop, Notification, PreToolUse, PostToolUse, 
    //                 PostToolUseFailure, UserPromptSubmit
    
    // 4. System prompt: --append-system-prompt
    return { args, env };
  }
};
```

### 5.7 Kiro Adapter

File: `src/terminal/agent-session-adapters.ts:1295-1407`

```typescript
const kiroAdapter: AgentSessionAdapter = {
  async prepare(input) {
    // 1. Autonomous mode: --trust-all-tools
    
    // 2. Resume: --resume
    
    // 3. Agent config: ~/.kiro/agents/kanban.json
    //    Hook events: agentSpawn, userPromptSubmit, preToolUse, postToolUse, stop
    
    // 4. Plan mode: modify prompt (bukan flag)
    return { args, env };
  }
};
```

### 5.8 Cline Adapter

File: `src/terminal/agent-session-adapters.ts:1409-1464`

```typescript
const clineAdapter: AgentSessionAdapter = {
  async prepare(input) {
    // 1. Autonomous mode: --auto-approve-all
    
    // 2. Resume: --continue
    
    // 3. Plan mode: --plan
    
    // 4. Hooks via --hooks-dir dengan shell scripts
    //    Hook scripts: Notification, TaskComplete, UserPromptSubmit,
    //                  PreToolUse, PostToolUse
    //    Scripts menerima JSON via stdin dan memanggil kanban hooks notify
    return { args, env };
  }
};
```

### 5.9 Registry Adapter

File: `src/terminal/agent-session-adapters.ts:1466-1485`

```typescript
const ADAPTERS: Record<RuntimeAgentId, AgentSessionAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  gemini: geminiAdapter,
  opencode: opencodeAdapter,
  droid: droidAdapter,
  kiro: kiroAdapter,
  cline: clineAdapter,
};

export async function prepareAgentLaunch(input: AgentAdapterLaunchInput): Promise<PreparedAgentLaunch> {
  const preparedPrompt = await prepareTaskPromptWithImages({ prompt: input.prompt, images: input.images });
  return await ADAPTERS[input.agentId].prepare({ ...input, prompt: preparedPrompt });
}
```

---

## 6. Hook System dan State Transitions

### 6.1 Hook Events

File: `src/core/api-contract.ts` (types), `src/commands/hooks.ts:1`

Tiga event hook utama:
- **`to_review`** - Agent menunggu review/user input
- **`to_in_progress`** - Agent mulai/resume bekerja
- **`activity`** - Agent sedang melakukan aktivitas (tool use, dll)

### 6.2 Hook Ingestion

File: `src/commands/hooks.ts:1-200`

Hook di-ingest melalui CLI subcommand:
```bash
kanban hooks ingest --event to_review --source claude --task-id <id> --workspace-id <id>
```

Atau via TRPC API:
```typescript
trpc.hooks.ingest.mutate({ event: "to_review", taskId, workspaceId, metadata })
```

### 6.3 Hook Processing

File: `src/commands/hooks.ts:200-801`

```
kanban hooks ingest
    │
    ├──► Parse metadata dari CLI args atau base64 payload
    │
    ├──► Enrich metadata (tool name, file path, final message, dll)
    │      → extractToolInput() - ekstrak parameter tool
    │      → describeToolOperation() - format deskripsi aktivitas
    │      → inferActivityText() - teks yang ditampilkan di UI
    │
    ├──► Call TRPC runtime.hookIngest
    │      → runtime-api.ts meneruskan ke TerminalSessionManager
    │
    └──► Session manager apply hook event ke state machine
```

### 6.4 Agent-Specific Hook Events

**Codex** (`src/commands/hook-events/codex-hook-events.ts:1`):
- Watcher membaca Codex session logs (rollout-*.jsonl files)
- Event types: task_complete, agent_message, approval, exec_call
- Mapping ke kanban hooks: to_review, to_in_progress, activity

**Droid** (`src/commands/hook-events/droid-hook-events.ts`):
- Enrich review metadata dengan final message dan tool info

**Kiro** (`src/commands/hook-events/kiro-hook-events.ts`):
- Normalize hook metadata format

### 6.5 State Machine

File: `src/terminal/session-state-machine.ts:1`

```
States: idle → running → awaiting_review → (idle/running/interrupted)
                          ↓
                    interrupted
```

**Transitions**:

| Event | From State | To State | Review Reason |
|-------|-----------|----------|---------------|
| `hook.to_review` | running | awaiting_review | hook |
| `hook.to_in_progress` | awaiting_review | running | null |
| `agent.prompt-ready` | awaiting_review | running | null |
| `process.exit` (exitCode=0) | running | awaiting_review | exit |
| `process.exit` (exitCode≠0) | running | awaiting_review | error |
| `process.exit` (interrupted) | running | interrupted | interrupted |

**Can return to running** (`src/terminal/session-state-machine.ts:15-17`):
```typescript
function canReturnToRunning(reason: RuntimeTaskSessionReviewReason): boolean {
  return reason === "attention" || reason === "hook" || reason === "error";
}
```

Hanya state `awaiting_review` dengan reason `attention`, `hook`, atau `error` yang bisa kembali ke `running`.

### 6.6 Workspace Trust Auto-Confirm

File: `src/terminal/session-manager.ts:377-405`

Saat pertama kali menjalankan agent, muncul prompt workspace trust ("Do you trust the authors of the files in this folder?"). Kanban secara otomatis menangani ini:

```
Agent output → Cek trust prompt text
    │
    ├──► Claude trust prompt detected
    │    → Timer 500ms → Kirim "\r" (Enter) untuk confirm
    │
    └──► Codex trust prompt detected
         → Sama, auto-confirm dengan delay
```

---

## 7. Task Agent vs Sidebar Agent

### 7.1 Task Agent

Task agent adalah agent yang terikat pada **task card** di board:
- Memiliki prompt, base ref, dan review settings
- Berjalan di dalam **task worktree** (git worktree per task)
- Lifecycle: start → run → stop/review → (trash/complete)
- Task ID menggunakan UUID atau ID dari card

File: `web-ui/src/hooks/use-task-sessions.ts:1`

```typescript
export interface UseTaskSessionsResult {
  startTaskSession: (task: BoardCard, options?: StartTaskSessionOptions) => Promise<StartTaskSessionResult>;
  stopTaskSession: (taskId: string) => Promise<void>;
  sendTaskSessionInput: (taskId: string, text: string, options?: SendTerminalInputOptions) => Promise<SendTaskSessionInputResult>;
  sendTaskChatMessage: (taskId: string, text: string, options?: { mode?: RuntimeTaskSessionMode }) => Promise<ClineChatActionResult>;
  // ...
}
```

### 7.2 Sidebar Agent (Home Agent)

Sidebar agent adalah agent yang berjalan di **sidebar** tanpa task card:
- Bukan task card, tidak punya prompt/base ref/worktree
- Project-scoped (berjalan di root workspace, bukan worktree)
- Digunakan untuk chat bebas atau assistant general
- Session ID sintetis: `__home_agent__:<workspaceId>:<agentId>`

File: `src/core/home-agent-session.ts:1`, `web-ui/src/hooks/use-home-agent-session.ts:1`

```typescript
// src/core/home-agent-session.ts:8-14
const HOME_AGENT_SESSION_NAMESPACE = "__home_agent__";
export const HOME_AGENT_SESSION_PREFIX = `${HOME_AGENT_SESSION_NAMESPACE}:`;

export function createHomeAgentSessionId(workspaceId: string, agentId: RuntimeAgentId): string {
  return `${HOME_AGENT_SESSION_PREFIX}${workspaceId}:${agentId}`;
}
```

### 7.3 Perbedaan Kunci

| Aspek | Task Agent | Sidebar Agent |
|-------|-----------|---------------|
| Task ID | Card ID (UUID) | Synthetic: `__home_agent__:workspaceId:agentId` |
| Working Directory | Task worktree | Root workspace |
| Prompt | Dari card + images | User input langsung |
| Board presence | Ya, visible di board | Tidak, hanya di sidebar |
| Lifecycle | Tied to card state | Tied to workspace + agent config |
| Base ref | Card's baseRef | Current branch / HEAD |
| Cline path | `startTaskSession()` dengan taskId biasa | `startTaskSession()` dengan home agent id |

### 7.4 Home Agent Session Lifecycle

File: `web-ui/src/hooks/use-home-agent-session.ts:110-377`

```
App mount / Project switch
    │
    ├──► Build descriptor key dari config
    │      → Cline: { agentId, providerId, modelId, baseUrl, reasoningEffort }
    │      → Terminal: { agentId, command }
    │
    ├──► Cek apakah descriptor berubah dari sebelumnya
    │      → Jika ya, buat taskId baru
    │      → Jika tidak, gunakan taskId yang sama (stable session)
    │
    ├──► Prune old home sessions untuk workspace ini
    │
    └──► Start session (jika belum running)
           → Cline: Chat panel
           → Terminal: Terminal panel
```

**Stability rule**: Session tidak di-rotate ketika:
- Switching antara "Projects" dan "Agent" tab di sidebar
- Refresh browser

**Rotation trigger**: Session di-rotate ketika:
- Selected agent berubah
- Provider/model berubah (untuk Cline)
- Project/workspace berubah

### 7.5 Home Agent Panel Mode

File: `web-ui/src/hooks/use-home-agent-session.ts:16-23`

```typescript
type HomeAgentPanelMode = "chat" | "terminal";

interface HomeAgentDescriptor {
  panelMode: HomeAgentPanelMode;
  descriptorKey: string;  // Untuk menentukan apakah config berubah
  taskId: string;
}
```

- **chat** - Untuk Cline native (render chat interface)
- **terminal** - Untuk PTY agents (render terminal interface)

---

## 8. File-File Kunci

### 8.1 CLI dan Server

| File | Fungsi | Line |
|------|--------|------|
| `src/cli.ts` | Entry point, argument parsing, server startup | 1-718 |
| `src/server/runtime-server.ts` | HTTP/HTTPS server, TRPC router, WebSocket upgrade | 95-501 |
| `src/server/runtime-state-hub.ts` | Central fanout untuk live state updates via WebSocket | 63-604 |
| `src/server/workspace-registry.ts` | Workspace management, config loading, terminal manager lookup | 186-475 |

### 8.2 TRPC API

| File | Fungsi | Line |
|------|--------|------|
| `src/trpc/app-router.ts` | Typed TRPC contract, schema definitions | 1-730 |
| `src/trpc/runtime-api.ts` | Main API coordinator, routes ke services | 90-733 |

### 8.3 PTY Runtime

| File | Fungsi | Line |
|------|--------|------|
| `src/terminal/session-manager.ts` | PTY session lifecycle, summary updates, auto-restart | 1-1040 |
| `src/terminal/pty-session.ts` | node-pty spawn wrapper, resize, write, stop | 1-161 |
| `src/terminal/agent-session-adapters.ts` | Adapter pattern untuk setiap agent | 1-1485 |
| `src/terminal/agent-registry.ts` | Agent catalog, command resolution, binary detection | 1-132 |
| `src/terminal/session-state-machine.ts` | State transitions (idle→running→review→exit) | 1-78 |
| `src/terminal/terminal-protocol-filter.ts` | ANSI protocol filtering, OSC query handling | 1-460 |

### 8.4 Native Cline

| File | Fungsi | Line |
|------|--------|------|
| `src/cline-sdk/cline-task-session-service.ts` | Task facade untuk Cline sessions | 1-904 |
| `src/cline-sdk/cline-session-runtime.ts` | SDK session host ownership, task↔session binding | 1-557 |
| `src/cline-sdk/cline-event-adapter.ts` | Translate SDK events ke Kanban mutations | 1-561 |
| `src/cline-sdk/cline-message-repository.ts` | Chat state storage & hydration | 1-1130 |
| `src/cline-sdk/cline-session-state.ts` | Pure state helpers, summary mutations | 1-1230 |
| `src/cline-sdk/cline-provider-service.ts` | Provider settings, OAuth, model catalog | 1-378 |
| `src/cline-sdk/sdk-provider-boundary.ts` | Only file yang import SDK provider APIs | 1-191 |
| `src/cline-sdk/sdk-runtime-boundary.ts` | Only file yang import SDK session APIs | 1-65 |

### 8.5 Worktree

| File | Fungsi | Line |
|------|--------|------|
| `src/workspace/task-worktree.ts` | Worktree creation, symlink ignored paths, trash patches | 1-688 |
| `src/workspace/task-worktree-path.ts` | Path normalization untuk worktree | 1-140 |
| `src/workspace/turn-checkpoints.ts` | Turn checkpoint capture/restore | 1-300 |

### 8.6 Hook System

| File | Fungsi | Line |
|------|--------|------|
| `src/commands/hooks.ts` | CLI hooks command, ingest processing | 1-801 |
| `src/commands/hook-events/codex-hook-events.ts` | Codex log watcher & event mapping | 1-1015 |
| `src/commands/hook-events/droid-hook-events.ts` | Droid metadata enrichment | 1-150 |
| `src/commands/hook-events/kiro-hook-events.ts` | Kiro metadata normalization | 1-100 |
| `src/terminal/hook-runtime-context.ts` | Hook environment variables builder | 1-50 |

### 8.7 Frontend

| File | Fungsi | Line |
|------|--------|------|
| `web-ui/src/hooks/use-task-sessions.ts` | Frontend facade untuk task sessions | 1-299 |
| `web-ui/src/hooks/use-home-agent-session.ts` | Sidebar agent session lifecycle | 1-377 |
| `web-ui/src/hooks/use-cline-chat-runtime-actions.ts` | Cline chat send/cancel/load actions | 1-420 |
| `web-ui/src/hooks/use-terminal-panels.ts` | Terminal panel management | 1-1750 |

### 8.8 Configuration & Types

| File | Fungsi | Line |
|------|--------|------|
| `src/core/agent-catalog.ts` | Agent definitions: id, label, binary, args | 1-95 |
| `src/core/api-contract.ts` | TypeScript types untuk semua API contracts | 1-2500 |
| `src/core/home-agent-session.ts` | Synthetic session ID untuk sidebar | 1-22 |
| `src/config/runtime-config.ts` | Kanban preferences & config persistence | 1-800 |

---

## Diagram Alur Lengkap

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BROWSER (React App)                           │
│  web-ui/src/                                                         │
│  ├── App.tsx              → Composition root                         │
│  ├── hooks/               → Domain logic (start, stop, chat)        │
│  ├── components/          → Rendering & UI                          │
│  └── runtime/             → TRPC client & query helpers             │
└─────────────────────────────────────────────────────────────────────┘
                              │ TRPC + WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     LOCAL RUNTIME (Node.js)                          │
│  src/                                                                │
│  ├── cli.ts               → Entry point                             │
│  ├── server/              → HTTP server, WebSocket hub              │
│  ├── trpc/                → API routing                             │
│  ├── workspace/           → Worktree management                     │
│  ├── config/              → Runtime config                          │
│  └── core/                → Types, utilities                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────────┐      ┌──────────────────────────────┐
│    PTY RUNTIME           │      │   NATIVE CLINE               │
│    src/terminal/         │      │   src/cline-sdk/             │
│                          │      │                              │
│  ┌──────────────────┐   │      │  ┌──────────────────────┐   │
│  │ agent-registry   │   │      │  │ provider-service     │   │
│  │ session-manager  │   │      │  │ task-session-service │   │
│  │ pty-session      │   │      │  │ session-runtime      │   │
│  │ state-machine    │   │      │  │ event-adapter        │   │
│  └──────────────────┘   │      │  │ message-repository   │   │
│                          │      │  └──────────────────────┘   │
│  node-pty.spawn()       │      │                              │
│  → binary, args, env    │      │  @clinebot/core + llms      │
│  → worktree cwd         │      │  → Session host             │
└─────────────────────────┘      │  → Provider store           │
                                 │  → OAuth & persistence      │
                                 └──────────────────────────────┘
```

---

## Kesimpulan

Arsitektur Kanban memisahkan dengan jelas antara:

1. **Presentation layer** (Browser) - React app yang merupakan control surface
2. **Control layer** (Runtime) - Koordinasi worktree, session, dan state streaming
3. **Execution layer** (Agents) - Dua jalur: PTY-backed CLI processes dan native SDK sessions

Pemisahan ini memungkinkan:
- Semua agents (kecuali Cline) berjalan via PTY dengan adapter pattern
- Cline mendapat native integration dengan chat history persistence
- Worktree per-task memberikan isolasi yang bersih
- Hook system menyediakan observability tanpa mengubah agent code
- State streaming via WebSocket membuat UI reactive tanpa polling
