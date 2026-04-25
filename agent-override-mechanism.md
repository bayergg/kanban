# Dokumentasi Mekanisme Override Agent/Model di Kanban

## 1. Overview

Kanban mendukung per-task agent dan model override, memungkinkan user memilih agent (cline, claude, codex, dll.) dan konfigurasi model Cline (provider, model, reasoning effort) yang berbeda untuk setiap task card. Override ini bersifat **task-level** dan disimpan langsung di task card. Saat task start, sistem men-resolve konfigurasi efektif dengan precedence: **previous session > task card override > workspace default**.

## 2. Data Model & Penyimpanan Override

### 2.1 Task Card Schema (`src/core/api-contract.ts`)

Task card menyimpan override di field `agentId` dan nested `clineSettings`:

```typescript
// RuntimeBoardCard (line 124-162)
{
  id: string,
  title?: string,
  prompt: string,
  agentId?: RuntimeAgentId,           // "cline" | "claude" | "codex" | ...
  clineSettings?: {
    providerId?: string,              // e.g. "anthropic", "openai"
    modelId?: string,                 // e.g. "claude-sonnet-4-20250514"
    reasoningEffort?: "low" | "medium" | "high" | "xhigh"
  },
  baseRef: string,
  createdAt: number,
  updatedAt: number
}
```

> **Legacy compatibility**: field flat `clineProviderId`, `clineModelId`, `clineReasoningEffort` masih di-parse dan ditransform ke `clineSettings` via `normalizeRuntimeTaskClineSettings` (line 99-122).

### 2.2 Task Mutations (`src/core/task-board-mutations.ts`)

Override disimpan saat create/update task:

- **Create** (`addTaskToColumn`, line 282-339): menerima `agentId` dan `clineSettings` dari input, menyalin dengan `cloneTaskClineSettings`.
- **Update** (`updateTask`, line 577-657): menerima `agentId?: RuntimeAgentId | null` dan `clineSettings?: RuntimeTaskClineSettings | null`. Jika `null`, field dihapus (clear override).

```typescript
// Line 626-632
agentId: input.agentId === undefined ? card.agentId : (input.agentId ?? undefined),
clineSettings: input.clineSettings === undefined
  ? cloneTaskClineSettings(card.clineSettings)
  : input.clineSettings === null
    ? undefined
    : cloneTaskClineSettings(input.clineSettings),
```

## 3. Resolusi Konfigurasi saat Task Start

### 3.1 Precedence Hierarchy (`src/trpc/runtime-api.ts` line 181-213)

Saat `startTaskSession` dipanggil, agent ID dan Cline settings di-resolve dengan urutan berikut:

**Agent ID Resolution:**
1. `previousTerminalAgentId` — dari session summary terminal sebelumnya (untuk trash-restore/resume agar tetap pakai agent yang sama)
2. `body.agentId` — per-task override dari task card
3. `scopedRuntimeConfig.selectedAgentId` — workspace-level default

**Cline Settings Resolution:**
- Selalu diambil dari **task card's current override object** (`body.clineSettings`).
- Tidak ada session-level persistence untuk Cline settings.
- Jika user mengubah model di card, session launch berikutnya (termasuk trash-restore) pakai value terbaru.

### 3.2 Concrete Resolution Logic (runtime-api.ts)

```typescript
// Line 195-213
const previousTerminalAgentId = body.resumeFromTrash
  ? (terminalManager.getSummary(body.taskId)?.agentId ?? null)
  : null;

const effectiveAgentId = previousTerminalAgentId ?? body.agentId ?? scopedRuntimeConfig.selectedAgentId;
```

**Branching:**
- Jika `effectiveAgentId === "cline"` → jalur native Cline SDK (`clineProviderService.resolveLaunchConfig` dengan override dari task card).
- Jika non-Cline → jalur terminal emulator (`resolveAgentCommand` dari `agent-registry.ts`).

### 3.3 Cline Launch Config Resolution (`src/cline-sdk/cline-provider-service.ts` line 696-738)

```typescript
async resolveLaunchConfig(overrides?: {
  providerIdOverride?: string;
  modelIdOverride?: string;
  reasoningEffortOverride?: RuntimeClineReasoningEffort | null;
}): Promise<ResolvedClineLaunchConfig>
```

Logic:
1. Jika `providerIdOverride` ada → ambil SDK provider settings untuk provider tersebut.
2. Jika tidak → ambil "selected provider settings" (last used / global default).
3. Resolve API key (OAuth refresh jika perlu).
4. `modelId` = `modelIdOverride` || settings.model || provider default.
5. `reasoningEffort` = `reasoningEffortOverride` (hanya di-pass jika task-level override ada) || settings.reasoning.effort.

```typescript
// Line 725-737
const modelId =
  overrides?.modelIdOverride?.trim() ||
  resolvedSettings.model?.trim() ||
  (await resolveDefaultModelIdForProvider(normalizedProviderId));

return {
  providerId: normalizedProviderId,
  modelId,
  apiKey,
  baseUrl: resolvedSettings.baseUrl?.trim() || null,
  reasoningEffort:
    overrides && "reasoningEffortOverride" in overrides
      ? (overrides.reasoningEffortOverride ?? null)
      : (toRuntimeReasoningEffort(resolvedSettings.reasoning?.effort) ?? undefined),
};
```

## 4. UI/Agent Picker (`web-ui/src/components/task-agent-model-picker.tsx`)

### 4.1 Hook: `useTaskAgentModelPicker`

Hook ini mengelola fetch state untuk provider catalog dan model lists:

```typescript
interface UseTaskAgentModelPickerInput {
  active: boolean;
  workspaceId: string | null;
  agentId: RuntimeAgentId | undefined;        // task-level override
  clineSettings?: RuntimeTaskClineSettings;   // task-level override
  defaultAgentId?: RuntimeAgentId | null;     // workspace default
  defaultProviderId?: string | null;          // workspace default
  defaultModelId?: string | null;             // workspace default
}
```

**Derive effective values:**
- `effectiveAgentId = agentId ?? defaultAgentId ?? null`
- `effectiveProviderId = clineSettings?.providerId ?? defaultProviderId ?? ""`

### 4.2 Component: `TaskAgentModelPicker`

Render flow:
1. Collapsible trigger: "Override Agent Settings"
2. Agent select dropdown (NativeSelect) — pilihan pertama adalah "Default (AgentName)"
3. Jika agent = "cline":
   - Provider picker (SearchSelectDropdown)
   - Model picker (ClineChatModelSelector)
   - Reasoning effort picker (jika model support reasoning)

**Override semantics in UI:**
- Pilih "Default" (empty string) = hapus override, pakai workspace default.
- Pilih agent/provider/model explicit = simpan ke task card.
- Saat provider diganti, model auto-default ke provider's default model.

### 4.3 State Update Pattern

```typescript
// Contoh: update provider
updateTaskClineSettings((currentSettings) => {
  const nextSettings = cloneTaskClineSettings(currentSettings) ?? {};
  if (newProviderId) {
    nextSettings.providerId = newProviderId;
    nextSettings.modelId = providerDefaultModels[newProviderId]; // auto-select default model
  } else {
    delete nextSettings.providerId;
    delete nextSettings.modelId;
  }
  // Return undefined jika semua field kosong (clear override)
  return nextSettings.providerId || nextSettings.modelId ? nextSettings : undefined;
});
```

## 5. CLI Commands (`src/commands/task.ts`)

### 5.1 Create Task dengan Override

```bash
kanban task create --prompt "Fix bug" \
  --agent-id cline \
  --cline-provider anthropic \
  --cline-model claude-sonnet-4-20250514 \
  --cline-reasoning-effort high
```

Parser:
- `--agent-id`: `parseAgentId()` — "default" → `null`, lainnya → validasi against `runtimeAgentIdSchema`.
- `--cline-provider`, `--cline-model`: `parseOptionalStringOrDefault()` — "default" → `null`.
- `--cline-reasoning-effort`: `parseTaskClineReasoningEffort()` — "inherit" → `null`, "default" → `"default"`.

### 5.2 Update Task dengan Override

```bash
kanban task update --task-id <id> \
  --agent-id claude \
  --cline-provider default \
  --cline-model default \
  --cline-reasoning-effort inherit
```

Logic update (`buildTaskClineSettingsForUpdate`, line 167-221):
- Input `null` untuk field = hapus field tersebut dari override.
- Jika semua field kosong dan tidak preserve empty override → return `null` (clear semua override).

### 5.3 Start Task (CLI)

```bash
kanban task start --task-id <id>
```

CLI `startTask` memanggil `runtime.startTaskSession.mutate()` dengan:
```typescript
{
  taskId: task.id,
  prompt: task.prompt,
  taskTitle: task.title,
  startInPlanMode: task.startInPlanMode,
  baseRef: task.baseRef,
  agentId: task.agentId,           // dari card
  clineSettings: task.clineSettings // dari card
}
```

## 6. Task-Level vs Workspace-Level Config Precedence

| Level | Source | Precedence | Scope |
|-------|--------|------------|-------|
| Session (highest) | `previousTerminalAgentId` dari summary session sebelumnya | 1 | Resume/trash restore only |
| Task | `task.agentId`, `task.clineSettings` | 2 | Per-task card |
| Workspace | `runtimeConfig.selectedAgentId`, `runtimeConfig.clineProviderSettings` | 3 | Global default untuk workspace |

**Khusus untuk Cline settings:**
- Tidak ada session-level persistence.
- Task card override selalu menang atas workspace default.
- Jika task card tidak punya override, workspace default digunakan.

## 7. Key Files & Responsibilities

| File | Responsibility |
|------|---------------|
| `src/core/api-contract.ts` | Schema `RuntimeBoardCard`, `RuntimeTaskClineSettings`, `RuntimeTaskSessionStartRequest` |
| `src/core/task-board-mutations.ts` | CRUD task card termasuk `agentId` dan `clineSettings` |
| `src/trpc/runtime-api.ts` | Resolve effective agent/Cline config dan route ke SDK atau terminal |
| `src/cline-sdk/cline-provider-service.ts` | Resolve launch config dengan override support |
| `src/terminal/agent-registry.ts` | Detect installed agents, build config response, resolve non-Cline commands |
| `src/core/agent-catalog.ts` | Catalog semua agent yang didukung |
| `web-ui/src/components/task-agent-model-picker.tsx` | UI picker untuk agent, provider, model, reasoning effort |
| `src/commands/task.ts` | CLI commands: create, update, start, list dengan override support |

## 8. Rekomendasi Implementasi Fitur Override

### 8.1 Menambah UI untuk Edit Override di Task Detail

Jika belum ada UI edit override di task detail view, rekomendasi implementasi:

1. **Tambahkan agent/model picker di task detail sidebar or toolbar.**
   - Reuse component `TaskAgentModelPicker` yang sudah ada.
   - Pass `agentId={task.agentId}`, `clineSettings={task.clineSettings}`, dan default dari workspace config.

2. **Wire ke mutation update task.**
   - Panggil `updateTask` mutation (via tRPC atau workspace state mutation) saat user mengubah pilihan.
   - Kirim `agentId` dan `clineSettings` hasil dari picker.

3. **Persist langsung ke board state.**
   - Override disimpan di `RuntimeBoardCard` dalam workspace state JSON.
   - Tidak perlu storage terpisah.

### 8.2 Menambah Shortcut "Use Default" / "Clear Override"

- Tombol "Reset to Workspace Default" yang set `agentId: null` dan `clineSettings: null` di task card.
- Di UI picker, pilihan pertama (empty value) sudah merepresentasikan default.

### 8.3 Visual Indicator untuk Task dengan Override

- Tambahkan badge/icon kecil di task card jika `agentId !== undefined` atau `clineSettings !== undefined`.
- Tooltip menampilkan effective agent dan model.

### 8.4 Bulk Override via CLI

CLI sudah mendukung per-task override via `task create` dan `task update`. Untuk bulk:

```bash
# Update semua task di backlog pakai agent claude
kanban task list --column backlog | jq -r '.tasks[].id' | \
  xargs -I {} kanban task update --task-id {} --agent-id claude
```

### 8.5 Testing Checklist

- [ ] Task create dengan override menyimpan `agentId` dan `clineSettings` ke card.
- [ ] Task update dengan `--agent-id default` menghapus override.
- [ ] Task start dengan override non-Cline menggunakan terminal agent yang benar.
- [ ] Task start dengan Cline override menggunakan provider/model dari task card.
- [ ] Trash restore mempertahankan previous session agent (precedence tertinggi).
- [ ] UI picker menampilkan "Default (NamaAgent)" sesuai workspace config.
- [ ] Perubahan provider di UI auto-default model ke provider's default.
- [ ] Reasoning effort hanya muncul jika model support reasoning.

## 9. Contoh Alur End-to-End

1. **User set workspace default**: Settings → Agent = "Cline", Provider = "anthropic", Model = "claude-sonnet-4-20250514".
2. **User create task A**: Tanpa override → card tidak punya `agentId` atau `clineSettings`.
3. **Start task A**: `effectiveAgentId` = workspace default "cline". Cline settings = workspace default.
4. **User create task B**: Override agent = "claude" → card `agentId = "claude"`.
5. **Start task B**: `effectiveAgentId` = "claude" (task override). Jalur terminal emulator dengan binary `claude`.
6. **User edit task C**: Override provider = "openai", model = "gpt-4o" → card `clineSettings = { providerId: "openai", modelId: "gpt-4o" }`.
7. **Start task C**: `effectiveAgentId` = "cline" (karena Cline settings ada, meski agentId tidak di-set eksplisit). Cline launch config pakai provider "openai", model "gpt-4o".
8. **Trash task C, lalu restore**: `previousTerminalAgentId` = "cline" → restore pakai "cline" dengan Cline settings terbaru dari card.

---

*Dokumen ini berdasarkan kode di commit workspace saat ini. Referensi arsitektur awal: Cline SDK Native Integration Plan (`cline-sdk-native-integration-plan.md`).*
