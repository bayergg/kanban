# Implementation Plan: Per-Task Custom Args Override for Non-Cline Agents

## Context & Motivation

Currently, Kanban supports per-task **agent override** (e.g., task A uses `claude`, task B uses `codex`) but does **not** support per-task **custom CLI arguments**. All non-Cline agents run via the terminal emulator path, where Kanban spawns the agent binary with hardcoded `baseArgs` from `agent-catalog.ts` plus adapter-injected flags (autonomous mode, hooks, prompt). Users cannot add extra flags like `--verbose`, `--model`, `--settings`, etc. on a per-task basis.

This limits flexibility:
- Cannot force a specific model for one `claude` task while keeping another on default.
- Cannot pass `--verbose` to one `codex` task for debugging.
- Cannot use per-task settings overrides for CLI tools that support them.

## Goal

Allow users to specify **custom CLI arguments** per task card that get appended to the agent command when starting a non-Cline terminal session.

**Scope:** Non-Cline agents only (terminal emulator path). Cline already has structured override via `clineSettings`.

---

## Design Overview

### Data Flow

```
Task Card (customArgs: string[])
  → CLI: task create --custom-arg "--verbose" --custom-arg "--model" --custom-arg "gpt-4"
  → UI: Text input in TaskAgentModelPicker (shown for non-Cline agents)
  → Board State: saved in RuntimeBoardCard.customArgs
  → Task Start: runtime-api.ts reads body.customArgs
  → Session Manager: StartTaskSessionRequest.customArgs
  → Agent Adapter: args = [...baseArgs, ...customArgs, ...adapterFlags, prompt]
```

### Precedence

Custom args are **task-level only**. There is no workspace-level custom args default.

| Level | Source | Scope |
|-------|--------|-------|
| Task | `task.customArgs` | Per-task card |
| Agent Catalog | `baseArgs` + `autonomousArgs` | Hardcoded per agent |
| Adapter | Internal flags (hooks, resume, prompt) | Injected by session-manager.ts adapters |

Custom args are placed **after** base args but **before** adapter-injected flags and the prompt. This gives users control over tool behavior without breaking adapter logic.

---

## File Changes

### 1. Schema & Types (`src/core/api-contract.ts`)

**Add `customArgs` to `RuntimeBoardCard`:**

```typescript
// Line ~124: runtimeBoardCardSchema
export const runtimeBoardCardSchema = z
  .object({
    id: z.string(),
    title: z.string().optional(),
    prompt: z.string(),
    // ... existing fields ...
    agentId: runtimeAgentIdSchema.optional(),
    clineSettings: runtimeTaskClineSettingsSchema.optional(),
    customArgs: z.array(z.string()).optional(), // NEW
    baseRef: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
```

**Add `customArgs` to `RuntimeTaskSessionStartRequest`:**

```typescript
// Line ~942: runtimeTaskSessionStartRequestSchema
export const runtimeTaskSessionStartRequestSchema = z.object({
  taskId: z.string(),
  prompt: z.string(),
  taskTitle: z.string().optional(),
  images: z.array(runtimeTaskImageSchema).optional(),
  startInPlanMode: z.boolean().optional(),
  mode: runtimeTaskSessionModeSchema.optional(),
  resumeFromTrash: z.boolean().optional(),
  baseRef: z.string(),
  cols: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional(),
  agentId: runtimeAgentIdSchema.optional(),
  clineSettings: runtimeTaskClineSettingsSchema.optional(),
  customArgs: z.array(z.string()).optional(), // NEW
});
```

### 2. Task Mutations (`src/core/task-board-mutations.ts`)

**Add `customArgs` to create/update inputs:**

```typescript
// Line ~14: RuntimeCreateTaskInput
export interface RuntimeCreateTaskInput {
  // ... existing fields ...
  agentId?: RuntimeAgentId;
  clineSettings?: RuntimeTaskClineSettings;
  customArgs?: string[]; // NEW
  baseRef: string;
}

// Line ~27: RuntimeUpdateTaskInput
export interface RuntimeUpdateTaskInput {
  // ... existing fields ...
  agentId?: RuntimeAgentId | null;
  clineSettings?: RuntimeTaskClineSettings | null;
  customArgs?: string[] | null; // NEW
  baseRef: string;
}
```

**Update `addTaskToColumn`:**

```typescript
// Line ~302: create task object
const task: RuntimeBoardCard = {
  // ... existing fields ...
  ...(input.agentId ? { agentId: input.agentId } : {}),
  ...(input.clineSettings !== undefined ? { clineSettings: cloneTaskClineSettings(input.clineSettings) } : {}),
  ...(input.customArgs !== undefined && input.customArgs.length > 0 ? { customArgs: [...input.customArgs] } : {}),
  baseRef,
  createdAt: now,
  updatedAt: now,
};
```

**Update `updateTask`:**

```typescript
// Line ~618: update card mapping
updatedTask = {
  ...card,
  // ... existing fields ...
  agentId: input.agentId === undefined ? card.agentId : (input.agentId ?? undefined),
  clineSettings: /* existing logic */,
  customArgs:
    input.customArgs === undefined
      ? card.customArgs
      : input.customArgs === null
        ? undefined
        : input.customArgs.length > 0
          ? [...input.customArgs]
          : undefined,
  baseRef,
  updatedAt: now,
};
```

### 3. Runtime API (`src/trpc/runtime-api.ts`)

**Pass `customArgs` to terminal manager:**

```typescript
// Line ~277: startTaskSession call
const summary = await terminalManager.startTaskSession({
  taskId: body.taskId,
  agentId: resolved.agentId,
  binary: resolved.binary,
  args: resolved.args,
  autonomousModeEnabled: scopedRuntimeConfig.agentAutonomousModeEnabled,
  cwd: taskCwd,
  prompt: body.prompt,
  images: body.images,
  startInPlanMode: body.startInPlanMode,
  resumeFromTrash: body.resumeFromTrash,
  cols: body.cols,
  rows: body.rows,
  workspaceId: workspaceScope.workspaceId,
  customArgs: body.customArgs, // NEW
});
```

### 4. Terminal Session Manager (`src/terminal/session-manager.ts`)

**Add `customArgs` to `StartTaskSessionRequest`:**

```typescript
// Line ~78: StartTaskSessionRequest
export interface StartTaskSessionRequest {
  taskId: string;
  agentId: AgentAdapterLaunchInput["agentId"];
  binary: string;
  args: string[];
  autonomousModeEnabled?: boolean;
  cwd: string;
  prompt: string;
  images?: RuntimeTaskImage[];
  startInPlanMode?: boolean;
  resumeFromTrash?: boolean;
  cols?: number;
  rows?: number;
  env?: Record<string, string | undefined>;
  workspaceId?: string;
  customArgs?: string[]; // NEW
}
```

**Update `cloneStartTaskSessionRequest`:**

```typescript
// Line ~148
function cloneStartTaskSessionRequest(request: StartTaskSessionRequest): StartTaskSessionRequest {
  return {
    ...request,
    args: [...request.args],
    images: request.images ? [...request.images] : undefined,
    customArgs: request.customArgs ? [...request.customArgs] : undefined, // NEW
  };
}
```

**Merge customArgs before adapter processing:**

```typescript
// Line ~324: prepareAgentLaunch call
const launch = await prepareAgentLaunch({
  taskId: request.taskId,
  agentId: request.agentId,
  binary: request.binary,
  args: [...request.args, ...(request.customArgs ?? [])], // MERGE HERE
  autonomousModeEnabled: request.autonomousModeEnabled,
  cwd: request.cwd,
  prompt: request.prompt,
  images: request.images,
  startInPlanMode: request.startInPlanMode,
  resumeFromTrash: request.resumeFromTrash,
  env: request.env,
  workspaceId: request.workspaceId,
});
```

> **Rationale:** Merging at this point places custom args after `baseArgs` (from `agent-catalog.ts`) but before adapter-injected flags (autonomous mode, resume, hooks, prompt). This is the safest position for most CLI tools.

### 5. CLI Commands (`src/commands/task.ts`)

**Add parser for `--custom-arg`:**

```typescript
// Near line ~82
function parseCustomArgs(values: (string | undefined)[]): string[] | undefined {
  const args = values
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
  return args.length > 0 ? args : undefined;
}
```

**Update `createTask` input:**

```typescript
// Line ~472
async function createTask(input: {
  // ... existing fields ...
  agentId?: RuntimeAgentId;
  clineSettings?: RuntimeTaskClineSettings;
  customArgs?: string[]; // NEW
}): Promise<JsonRecord> {
  // ...
  const result = addTaskToColumn(
    state.board,
    "backlog",
    {
      // ... existing fields ...
      agentId: input.agentId,
      clineSettings: input.clineSettings,
      customArgs: input.customArgs, // NEW
      baseRef: resolvedBaseRef,
    },
    () => globalThis.crypto.randomUUID(),
  );
```

**Update `updateTaskCommand` input:**

```typescript
// Line ~531
async function updateTaskCommand(input: {
  // ... existing fields ...
  agentId?: RuntimeAgentId | null;
  clineProviderId?: string | null;
  clineModelId?: string | null;
  clineReasoningEffort?: ParsedTaskClineReasoningEffort;
  customArgs?: string[] | null; // NEW
}): Promise<JsonRecord> {
```

**Update CLI `task create` registration:**

```typescript
// Line ~1111
  .option("--agent-id <id>", "Agent override: cline | claude | codex | droid | gemini | opencode | default.")
  .option("--custom-arg <value>", "Custom CLI argument for the agent (can be used multiple times).")
```

**Update CLI `task update` registration:**

```typescript
// Line ~1170
  .option("--agent-id <id>", 'Agent override...')
  .option("--custom-arg <value>", 'Custom CLI argument (use multiple times). Pass "default" to clear.')
```

**Parse custom args in action handler:**

```typescript
// In task create action
kanban task create \
  --prompt "Fix bug" \
  --agent-id claude \
  --custom-arg "--verbose" \
  --custom-arg "--model" \
  --custom-arg "claude-opus-4"
```

For `task update`, passing `--custom-arg default` or no `--custom-arg` should clear existing custom args.

### 6. Frontend UI (`web-ui/src/components/task-agent-model-picker.tsx`)

**Add `customArgs` to component props:**

```typescript
export function TaskAgentModelPicker({
  agentId,
  onAgentIdChange,
  clineSettings,
  onClineSettingsChange,
  customArgs,              // NEW
  onCustomArgsChange,      // NEW
  // ... existing props ...
}): ReactElement {
```

**Add custom args input (visible when non-Cline agent selected):**

```typescript
// Inside Collapsible.Content, after agent select
{!showClineProviderPicker && effectiveAgentId ? (
  <div className="w-full sm:w-1/2 min-w-0">
    <span className="text-[11px] text-text-secondary block mb-1">Custom Arguments</span>
    <input
      type="text"
      placeholder="--verbose --model gpt-4"
      value={customArgs?.join(" ") ?? ""}
      onChange={(e) => {
        const value = e.currentTarget.value.trim();
        const args = value.length > 0 ? value.split(/\s+/) : undefined;
        onCustomArgsChange?.(args);
      }}
      className="..."
    />
    <span className="text-[10px] text-text-tertiary block mt-1">
      Space-separated extra arguments passed to the agent CLI.
    </span>
  </div>
) : null}
```

> **UI Note:** The input is a simple text field that splits on whitespace. This is pragmatic for most use cases. For arguments containing spaces, users would need quotes, but shell-style parsing is out of scope for MVP.

**Update `useTaskAgentModelPicker` hook:**

No changes needed to the hook itself unless we want to expose custom args options. The hook is focused on Cline provider/model fetching.

### 7. Frontend Create/Edit Dialogs

**Update `TaskCreateDialog` and `TaskInlineCreateCard`:**

Add state management:

```typescript
// Props
export function TaskCreateDialog({
  // ... existing props ...
  customArgs,
  onCustomArgsChange,
}: {
  // ... existing types ...
  customArgs?: string[];
  onCustomArgsChange?: (value: string[] | undefined) => void;
}) {
```

Pass to `TaskAgentModelPicker`:

```typescript
<TaskAgentModelPicker
  agentId={agentId}
  onAgentIdChange={onAgentIdChange}
  customArgs={customArgs}
  onCustomArgsChange={onCustomArgsChange}
  // ... existing props ...
/>
```

**Wire to create mutation:**

In `handleCreate` / `handleCreateAndStart`, include `customArgs` in the payload sent to the mutation.

### 8. Task Detail View (if editing override inline)

If the task detail view supports editing agent override inline (future feature), ensure `customArgs` is included in the update mutation payload alongside `agentId`.

---

## Testing Plan

### Backend Tests

1. **Schema validation:**
   - `customArgs` is optional and accepts `string[]`.
   - Empty array `[]` is treated as undefined (no override).

2. **Task mutations:**
   - `addTaskToColumn` with `customArgs: ["--verbose"]` → card has `customArgs`.
   - `updateTask` with `customArgs: null` → clears field.
   - `updateTask` with `customArgs: undefined` → preserves existing.

3. **Runtime API:**
   - `startTaskSession` with `customArgs` → passes through to `terminalManager.startTaskSession()`.
   - Non-Cline path includes custom args in spawned command.
   - Cline path ignores `customArgs` (Cline uses `clineSettings` instead).

4. **Session manager:**
   - `cloneStartTaskSessionRequest` clones `customArgs` correctly.
   - `prepareAgentLaunch` receives merged args: `[...baseArgs, ...customArgs]`.
   - Adapter-injected flags still work correctly with custom args present.

### Frontend Tests

1. **TaskAgentModelPicker:**
   - Shows custom args input only when non-Cline agent is selected.
   - Hides custom args input when Cline is selected.
   - Parses space-separated input into string array.
   - Empty input clears custom args.

2. **Create dialogs:**
   - Create task with custom args → payload includes `customArgs`.
   - Create task without custom args → payload does not include `customArgs`.

### CLI Tests

1. `kanban task create --prompt "test" --custom-arg "--verbose" --custom-arg "--model" --custom-arg "gpt-4"`
   → Task card has `customArgs: ["--verbose", "--model", "gpt-4"]`.

2. `kanban task update --task-id <id> --custom-arg "--debug"`
   → Replaces existing custom args.

3. `kanban task update --task-id <id> --custom-arg default`
   → Clears custom args.

---

## Migration & Compatibility

- **No breaking changes.** `customArgs` is optional on all schemas.
- Existing tasks without `customArgs` continue to work unchanged.
- Board state JSON without `customArgs` is forward-compatible (Zod `.optional()` handles missing field).

---

## Acceptance Criteria

- [ ] User can specify custom CLI args per task via UI (create/edit dialogs).
- [ ] User can specify custom CLI args per task via CLI (`--custom-arg`).
- [ ] Custom args are saved in the task card and persisted in board state.
- [ ] When a non-Cline task starts, custom args are appended to the agent command after base args.
- [ ] Cline tasks ignore `customArgs` (Cline override continues to use `clineSettings`).
- [ ] Clearing custom args (empty input / `default` in CLI) removes the override.
- [ ] Trash restore preserves custom args from the task card.
- [ ] All existing tests pass; new tests added for custom args flow.

---

## Appendix: Example End-to-End Flow

**1. User creates task with custom args:**
```bash
kanban task create --prompt "Refactor auth module" \
  --agent-id claude \
  --custom-arg "--verbose" \
  --custom-arg "--model" \
  --custom-arg "claude-opus-4"
```

**2. Task card stored as:**
```json
{
  "id": "task-123",
  "prompt": "Refactor auth module",
  "agentId": "claude",
  "customArgs": ["--verbose", "--model", "claude-opus-4"],
  "baseRef": "main"
}
```

**3. User starts task:**
```bash
kanban task start --task-id task-123
```

**4. Runtime resolves command:**
- Agent: `claude` (from task card)
- Base args: `[]` (from agent-catalog.ts)
- Custom args: `["--verbose", "--model", "claude-opus-4"]` (from task card)
- Adapter flags: `["--dangerously-skip-permissions"]` (autonomous mode)
- Prompt: appended by adapter

**5. Final spawned command:**
```bash
claude --verbose --model claude-opus-4 --dangerously-skip-permissions "Refactor auth module"
```

**6. Another task uses default:**
```json
{
  "id": "task-456",
  "prompt": "Fix typo",
  "agentId": "claude"
  // no customArgs
}
```
→ Spawns: `claude --dangerously-skip-permissions "Fix typo"`

---

*Plan derived from analysis of `agent-override-mechanism.md`, `src/core/api-contract.ts`, `src/trpc/runtime-api.ts`, `src/terminal/session-manager.ts`, `src/terminal/agent-session-adapters.ts`, and `src/commands/task.ts`.*
