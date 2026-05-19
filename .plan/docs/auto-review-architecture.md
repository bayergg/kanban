# Auto-Review Architecture: The Headless Gap

## Masalah

Auto-review chaining (auto-commit, auto-move-to-trash, auto-start linked task) hanya berjalan di
frontend React (`web-ui/src/hooks/use-review-auto-actions.ts`). Semua logic-nya menggunakan browser
API (`window.setTimeout`, `useEffect`, `subscribeToAnyTaskMetadata`). Akibatnya, jika web Kanban
ditutup, agent bisa selesai kerja dan task pindah ke review, tapi auto-commit, auto-move-to-trash,
dan auto-start linked task tidak pernah jalan.

---

## 1. Alur Proses: PTY vs Frontend

### Backend (Node.js process — tetap hidup tanpa browser)

```
┌──────────────────────────────────────────────────────────────┐
│  src/terminal/pty-session.ts                                 │
│  • PtySession.spawn() — spawn process via node-pty          │
│  • PtySession.stop() — kill process group (SIGTERM)         │
│  • onData / onExit callbacks                                │
│  • Pure process lifecycle — tidak ada WebSocket/HTTP        │
└──────────────────────┬───────────────────────────────────────┘
                       │ output chunk via onData
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  src/terminal/session-manager.ts                             │
│  • TerminalSessionManager — session lifecycle                │
│  • PTY output → filterTerminalProtocolOutput                 │
│  • detectOutputTransition → agent.prompt-ready event         │
│  • onExit → process.exit event                               │
│  • applySessionEvent() → reduceSessionTransition()            │
│  • emitSummary() → broadcasts ke WebSocket                   │
│  • Auto-restart logic (up to 3× dalam 5 detik)               │
└──────────────┬──────────────────────────┬────────────────────┘
               │                          │
               ▼                          ▼
┌─────────────────────────────┐  ┌──────────────────────────────┐
│ session-state-machine.ts     │  │ runtime-state-hub.ts         │
│ reduceSessionTransition():   │  │ • onSummary listener         │
│ running ──hook.to_review──►  │  │ • broadcastTaskReadyForReview│
│   awaiting_review            │  │ • workspace_state_updated    │
│ awaiting_review ──hook       │  │ • task_sessions_updated      │
│   .to_in_progress──► running │  └──────────┬───────────────────┘
│ running ──process.exit──►    │             │
│   awaiting_review/error/interrupted│       │ WebSocket
└─────────────────────────────┘              ▼
                                     Browser (React)
```

### Frontend (React/browser — berhenti total saat browser ditutup)

```
┌────────────────────────────────────────────────────────────────┐
│  web-ui/src/runtime/use-runtime-state-stream.ts                │
│  • WebSocket → reducer → board state + sessions               │
│  • workspace_state_updated messages                            │
│  • task_sessions_updated messages                              │
└──────────────────────────┬─────────────────────────────────────┘
                           │ board & session updates
                           ▼
┌────────────────────────────────────────────────────────────────┐
│  web-ui/src/hooks/use-review-auto-actions.ts                   │
│  • useEffect([board, taskGitActionLoadingByTaskId]) →          │
│    evaluateAutoReview()                                        │
│  • subscribeToAnyTaskMetadata() → evaluateAutoReview()         │
│  • window.setTimeout(500ms) — AUTO_REVIEW_ACTION_DELAY_MS     │
│  • Logic:                                                     │
│    1. Cari semua card di column "review"                      │
│    2. Jika autoReviewMode === "move_to_trash":                 │
│       → requestMoveTaskToTrash(taskId, "review")              │
│    3. Jika autoReviewMode === "commit" / "pr":                 │
│       → cek getTaskWorkspaceSnapshot().changedFiles > 0       │
│       → runAutoReviewGitAction(taskId, mode)                   │
│       → tunggu changedFiles === 0                              │
│       → requestMoveTaskToTrash(taskId, "review")              │
│  • HANYA berjalan di browser — semua state di refs            │
└──────────────────────────┬─────────────────────────────────────┘
                           │ requestMoveTaskToTrash → linked chaining
                           ▼
┌────────────────────────────────────────────────────────────────┐
│  web-ui/src/hooks/use-linked-backlog-task-actions.ts           │
│  • performMoveTaskToTrash():                                   │
│    1. trashTaskAndGetReadyLinkedTaskIds(taskId)                │
│    2. setBoard (optimistic update)                             │
│    3. Auto-start task dependency chain:                        │
│       - Cari linked tasks di backlog yang semua                │
│         prerequisites terpenuhi (readyTaskIds)                 │
│       - Masing-masing: start animation → in_progress           │
│       - Atau: kickoffTaskInProgress                            │
│    4. cleanup: stopTaskSession + cleanupTaskWorkspace          │
│  • HANYA berjalan di browser                                   │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. File-file Kunci

### Backend (selalu hidup)

| File | Peran | API Kunci |
|------|-------|-----------|
| `src/terminal/pty-session.ts` | Spawn/kill proses via `node-pty` | `pty.spawn()`, `process.kill(-pid)`, `onData`, `onExit` |
| `src/terminal/session-manager.ts` | Lifecycle PTY session, state machine, summary broadcast | `startTaskSession()`, `stopTaskSession()`, `transitionToReview()`, `applySessionEvent()`, `emitSummary()` |
| `src/terminal/session-state-machine.ts` | State transition murni (pure function) | `reduceSessionTransition()` — `running ↔ awaiting_review`, `process.exit` |
| `src/server/runtime-state-hub.ts` | WebSocket broadcast | `broadcastTaskReadyForReview()`, `workspace_state_updated`, `task_sessions_updated` |
| `src/terminal/agent-session-adapters.ts` | Deteksi output agent → trigger transisi | `detectOutputTransition()` (Claude Code, Codex, OpenCode, Droid) |

### Frontend (berhenti saat browser ditutup)

| File | Peran | API Kunci |
|------|-------|-----------|
| `web-ui/src/hooks/use-review-auto-actions.ts` | Auto-review orchestration | `window.setTimeout`, `useEffect`, `subscribeToAnyTaskMetadata`, `getTaskWorkspaceSnapshot()` |
| `web-ui/src/hooks/use-linked-backlog-task-actions.ts` | Linked task chaining saat trash | `trashTaskAndGetReadyLinkedTaskIds()`, `kickoffTaskInProgress()`, `stopTaskSession()` |
| `web-ui/src/runtime/use-runtime-state-stream.ts` | WebSocket → React state | `task_ready_for_review`, `workspace_state_updated` |

---

## 3. Diagram Kausalitas: Apa yang Tetap Jalan vs Berhenti

```
                    Browser Ditutup
                          │
                          ▼
            ┌─────────────────────────┐
            │   WebSocket disconnect   │
            └─────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
  TETAP JALAN                       BERHENTI
  ────────────                      ────────
  • PTY process (node-pty)          • useReviewAutoActions()
    → Agent masih kerja               → Tidak ada evaluateAutoReview()
    → Output masih diproses           → window.setTimeout tidak pernah
                                       dipanggil
  • TerminalSessionManager
    → Session state machine          • useLinkedBacklogTaskActions()
    → detectOutputTransition          → performMoveTaskToTrash() tidak
    → applySessionEvent()               pernah dipanggil
    → emitSummary()
                                       • Auto-commit tidak pernah jalan
  • RuntimeStateHub
    → WebSocket broadcast             • Auto-PR tidak pernah dibuat
      (tidak ada yg menerima,
       tapi tetap dikirim)            • Auto-move-to-trash tidak pernah
    → hooks-api.ts (HTTP)               terjadi
      → transitionToReview()
                                       • Linked task chain putus:
    • Cline SDK session service         auto-start task dependency
      → juga manage awaiting_review     tidak pernah di-trigger
```

### Ringkasan Gap

| Skenario | Agent kerja? | Task pindah review? | Auto-commit? | Auto-trash? | Auto-start linked? |
|----------|-------------|---------------------|-------------|-------------|-------------------|
| Browser terbuka | ✅ | ✅ | ✅ (via frontend) | ✅ (via frontend) | ✅ (via frontend) |
| Browser ditutup | ✅ | ✅ | ❌ | ❌ | ❌ |
| Browser ditutup, buka lagi | ✅ | ✅ (nostalgia state) | ✅ (setelah render ulang) | ✅ (setelah render ulang) | ✅ (setelah render ulang) |

---

## 4. Rekomendasi Solusi

Auto-review actions harus dipindahkan ke backend agar berfungsi secara headless.

### Pendekatan: Backend Auto-Review Service

Buat service baru di `src/` (misal `src/auto-review/auto-review-service.ts`) yang:

1. **Listen ke session summary changes** — sama seperti `runtime-state-hub.ts` menggunakan
   `manager.onSummary()`, service ini subscribe ke `TerminalSessionManager.onSummary()`.

2. **Deteksi transisi `→ awaiting_review`** — ketika summary berubah state jadi
   `awaiting_review` dengan `reviewReason: "hook"`, cek apakah task memiliki
   `autoReviewEnabled === true` dan `autoReviewMode` tertentu.

3. **Eksekusi git action** — jalankan `buildTaskGitActionPrompt()` dan git commit/PR
   langsung di backend (tidak perlu browser). Gunakan Node.js `child_process` atau
   library git. Pantau `changedFiles` via workspace metadata (sudah ada di backend
   melalui `WorkspaceRegistry` atau service serupa).

4. **Move-to-trash + linked chain** — panggil `trashTaskAndGetReadyLinkedTaskIds()`
   langsung di backend. Untuk auto-start linked task, panggil
   `TerminalSessionManager.startTaskSession()` langsung tanpa perlu browser.

5. **Broadcast hasil** — kirim `workspace_state_updated` via WebSocket setelah
   setiap aksi selesai, sehingga frontend tetap sinkron.

### Arsitektur yang Diusulkan

```
TerminalSessionManager.onSummary()
        │
        ▼
AutoReviewService (src/auto-review/)
  ├── onSessionStateChange(summary)
  │     └── jika state === "awaiting_review" && reviewReason === "hook"
  │           └── checkTaskAutoReviewConfig(taskId) via BoardService
  │                 ├── jika "move_to_trash"
  │                 │     └── executeMoveToTrash(taskId) → trashTaskAndGetReadyLinkedTaskIds()
  │                 │           └── autoStartLinkedTasks(readyTaskIds) → sessionManager.startTaskSession()
  │                 └── jika "commit" / "pr"
  │                       └── checkChangedFiles(taskId)
  │                             └── jika > 0 → executeGitAction(taskId, mode)
  │                                   └── jika selesai → executeMoveToTrash(taskId)
  │
  └── broadcast update via WebSocket
```

### Frontend Synchronization (No Refresh Required)

Setelah backend auto-review service selesai memproses rantai aksi, frontend tetap
ter-update secara real-time **tanpa perlu refresh halaman**. Mekanismenya sudah ada:

```
Backend auto-review service
  → trashTaskAndGetReadyLinkedTaskIds()       ← pure function, ubah board state
  → sessionManager.startTaskSession()          ← jalankan linked task
  → runtimeStateHub.broadcastWorkspaceStateUpdated(workspaceId)
       ↓ WebSocket
  → web-ui/src/runtime/use-runtime-state-stream.ts
       → reducer menerima workspace_state_updated
       → board state berubah (React setState)
       → React re-render otomatis
       → detail panel render ulang, task baru muncul di in_progress
```

Ini bekerja karena:

- **`broadcastWorkspaceStateUpdated()` sudah ada** — runtime-state-hub.ts:258-269, persis
  yang dipakai hooks API untuk broadcast setelah `to_review` / `to_in_progress`.
- **Frontend sudah handle event ini** — `use-runtime-state-stream.ts` reducer line 258-269
  memproses `workspace_state_updated` dan mengupdate board state.
- **React re-render otomatis** — karena board state di-update via `setState`, React
  akan me-render ulang komponen yang bergantung padanya (termasuk task di review column
  yang pindah ke trash, dan task baru yang muncul di in_progress).

Tidak ada perubahan di frontend yang diperlukan untuk sinkronisasi ini — backend cukup
menggunakan WebSocket broadcast yang sudah ada.

### Dependensi yang Perlu Di-resolve

| Kebutuhan | Status Saat Ini | Solusi |
|-----------|----------------|--------|
| Membaca autoReviewEnabled/Mode task | Hanya ada di `BoardCard` (frontend type) | Simpan konfigurasi di backend — field di model task atau service |
| `getTaskWorkspaceSnapshot()` | Frontend-only store (`workspace-metadata-store`) | Expose API backend atau baca langsung dari workspace state |
| `runAutoReviewGitAction()` | Frontend-only (`useGitActions`) | Implementasi ulang di backend menggunakan `child_process` + git |
| `trashTaskAndGetReadyLinkedTaskIds()` | Frontend board mutation | Panggil langsung dari backend — fungsi ini pure function tanpa React |
| `kickoffTaskInProgress()` | Frontend + TRPC | Panggil `sessionManager.startTaskSession()` langsung |
| Notifikasi user | Frontend toast (`showAppToast`) | WebSocket push → frontend menampilkan toast |

### Prioritas Implementasi

1. **Backend auto-review service** — inti logika pindah ke `src/auto-review/`
2. **Persist autoReview config** — simpan `autoReviewEnabled` + `autoReviewMode` ke backend
3. **Backend git action** — git commit/PR tanpa browser
4. **Backend linked chain** — auto-start ready tasks langsung via session manager
5. **Hapus frontend auto-review hooks** — setelah backend selesai, hapus
   `useReviewAutoActions.ts` dan bagian auto-review dari `useLinkedBacklogTaskActions.ts`
