# Website API v2 (contract for the simple website)

Lane A serves it; the website (Lane C) consumes it. Types are in `packages/shared/src/types.ts` (`TaskView`, `FileView`, `CheckpointView`, `MemoryNode`, `StreamEvent`). Changes go through a Requests note in `docs/PROGRESS.md`. Each endpoint says the build step (docs/PLAN.md §4) it lands in; until then, build against fixtures with the MOCK DATA banner.

All calls use `credentials: "include"`. Errors are `{ error: CODE, message }` with 400/401/403/404/409/502: show the message. Every status shown has a text label.

## Sign-in (step 3)
```
POST /api/auth/nonce                         → { nonce }
POST /api/auth/verify   { message, signature } → { address }   sets the session cookie (SIWE, EIP-4361; gasless)
GET  /api/auth/me                            → { address } | 401
POST /api/auth/logout                        → 204
```

## Brains (step 3; the demo brain exists from step 1)
```
GET  /api/brains                             → BrainView[]        brains you own
POST /api/brains        { name, visibility: "public" | "private" } → BrainView
POST /api/brains/:id/active                  → 204                your active brain ("continue" with no name uses it)
POST /api/brains/:id/extend                  → { expiresAt, txUrl }
POST /api/brains/:id/stop                    → { stopped: true }   freeze: every AI is refused until resume
POST /api/brains/:id/resume                  → { stopped: false }

BrainView = { id, name, ens, visibility, owner, active, stopped, createdAt, expiresAt,
              agents: AgentView[] (claude / gemini / openai, with rules + connectedClient + lastWriteAt),
              counts: { checkpoints, tasksOpen, tasksDone, files, notices } }
```

## Connect (step 3; demo brain links from step 1 via the owner)
```
POST /api/connect       { family: "claude" | "gemini" | "openai" } → { family, url, snippets: Record<Client, string>, qr, expiresAt }
```
`url` is your personal MCP link for that AI family (works in every brain you own). `snippets` has one ready-to-paste line or block per app: `claude-code`, `claude-ai` (also used by the Claude phone app), `antigravity`, `gemini-cli`, `codex`, `chatgpt`. The SSE event `connected { agent, client }` fires when an app first talks to the server.

## Work (step 1)
```
GET  /api/brains/:id/summary?focus=          → { text, pack }      exactly what "continue" gives an AI
GET  /api/brains/:id/checkpoints             → CheckpointView[]    newest first (commit history)
GET  /api/brains/:id/tasks                   → TaskView[]
POST /api/brains/:id/tasks   { title }       → TaskView            owner adds a task
GET  /api/brains/:id/files                   → FileView[]          current version of each path
GET  /api/brains/:id/files/content?path=&key= → { path, content, versions: FileView[] }   (key = an older version)
GET  /api/brains/:id/notes                   → MemoryNode[]        decisions, facts, evidence
GET  /api/brains/:id/stream?since=<seq>      (SSE) → StreamEvent   memory · confirmed · write_failed · notice · connected · stop
```
Until step 3 the demo brain is served at the v1 paths too (`/api/graph`, `/api/stream`, `/api/team`).

## Rules (step 4)
```
GET  /api/brains/:id/rules                   → { [family]: { status, scope, writeDaily, role, ens, resolver } }
POST /api/brains/:id/rules/:family  { status?, scope?, writeDaily? } → { txUrl }   written to that AI's ENS records by the server
```

## Review notices (step 4)
```
GET  /api/brains/:id/review                  → [{ key, kind, agent, reason, at, status }]   items stopped as malicious
POST /api/brains/:id/review/:key/release     → 204    owner says it was a false alarm
```

## Statuses to show (text, never color alone)
Checkpoint: SAVED · SAVING (pending) · STOPPED (quarantined, with `why`) · EXPIRED. Task: OPEN · DONE (by whom, when) · STOPPED. Brain: ACTIVE · STOPPED · EXPIRES IN … . AI: CONNECTED (app name) · ACTIVE · PAUSED · AUTHORITY UNKNOWN (ENS unreadable).
