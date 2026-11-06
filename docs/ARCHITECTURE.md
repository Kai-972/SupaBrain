# Architecture

Source of truth for the plan: [CLAUDE.md](../CLAUDE.md). This page describes how the pieces fit at runtime. Items marked ⏳ are designed but not built yet; everything else is running code with proof in `docs/PROGRESS.md`.

## Components

```
 AI clients: Claude Code · Claude.ai · Antigravity (Gemini) · Gemini CLI · ChatGPT
        │  one URL per agent:  POST /mcp  (Authorization: Bearer <token>)
        │                      POST /mcp/t/<token>  (clients that cannot send headers)
        ▼
 ┌──────────────── apps/server (one Node process, exactly one instance) ────────────────┐
 │ express                                                                              │
 │  /healthz            liveness (uptime pinger, host health check)                      │
 │  /mcp, /mcp/t/:token stateless MCP: a new McpServer + transport per POST              │
 │  /api/*              dashboard API (CLAUDE.md §6.4) incl. owner actions (cookie)      │
 │  /api/stream         SSE to the dashboard (replay with ?since / Last-Event-ID)        │
 │                                                                                      │
 │  auth/tokens.ts      HMAC agent tokens → req.auth → tool handlers (extra.authInfo)    │
 │  Engine              graph · read-sets · read log · trust · quarantine · undo        │
 │   ├─ EnsAuthority   packages/ens       live getOwner + sb.* records, 10 s cache,     │
 │   │                                    fail closed                                   │
 │   ├─ Arkiv          packages/arkiv     one guarded writer per wallet, watcher,        │
 │   │                                    startup rebuild from Arkiv                     │
 │   └─ Payments       packages/payments  policy → World approval → BrainVault (Lane B) │
 └────────┬──────────────────────────────┬──────────────────────────────┬───────────────┘
          ▼                              ▼                              ▼
   Ethereum Sepolia                 Arkiv Rabdi                     World ID
   ENSv2 names + BrainVault + USDC  the shared memory (entities)     human approval

 Dashboard (apps/web, Lane C) → calls the server's /api and /api/stream ⏳
```

**Arkiv is the source of truth; the server's memory is a cache.** On start the server starts the Arkiv watcher, then queries every entity for `app + team` from known creator wallets and rebuilds the graph. A restart, a host that sleeps, or a redeploy loses nothing but read-sets (30-minute lifetime anyway).

## MCP: how a client connects
- **Stateless Streamable HTTP** (MCP SDK 1.32.2): every POST builds a fresh `McpServer` and `StreamableHTTPServerTransport({ sessionIdGenerator: undefined })`. GET and DELETE answer 405. Nothing is kept per session, so read-sets are keyed by the agent the token names.
- **Agent tokens** (`apps/server/src/auth/tokens.ts`): `base64url("<label>|<exp>|<HMAC-SHA256>")` signed with `TOKEN_SIGNING_SECRET`; 7-day default (`config/app.json` `mcp.tokenTtlDays`). Checked in constant time; unknown agent, wrong signature, malformed or expired → **401 + `WWW-Authenticate: Bearer error="invalid_token"`**. Path tokens are redacted in logs (`/mcp/t/***`).
- **A token is not a permission.** It only says which agent is calling. What that agent may do is read live from ENS on every call (`whoami`, `remember`, `pay`): if its name is unregistered or its status is not active, it is refused even with a valid token. If ENS cannot be read, the answer is "authority unknown", never a guess.
- **Host allowlist**: only `localhost` and the `PUBLIC_BASE_URL` host are accepted (DNS-rebinding protection from the SDK).
- `pnpm mcp:token <agent>` issues a token and prints the snippet per client (the same builder backs `/api/pair` and the `/connect` page in S4 ⏳).

| Client | How it connects | Verified |
|---|---|---|
| Claude Code | `claude mcp add --transport http <name> <base>/mcp --header "Authorization: Bearer <t>"` | ✅ S1 |
| Claude.ai | Settings → Connectors → custom connector, URL `<base>/mcp/t/<t>` (no headers) | ✅ S1 |
| Antigravity | `~/.gemini/config/mcp_config.json` `serverUrl` + `headers` (or `agy mcp add --type http --header …`) | ✅ S1 |
| Gemini CLI | `httpUrl` + `headers` | ⏳ |
| ChatGPT (developer mode) | path-token URL, auth none | ⏳ stretch |

## Hosting
- **Now**: the server runs on a laptop behind an **ngrok static domain** (`PUBLIC_BASE_URL`), started with `pnpm dev:public` (ngrok traffic inspection off, because it records full URLs including path tokens). Good for development and as a demo-day spare.
- **Planned**: **Render free web service** deployed from `main`, secrets in Render's env, a free uptime pinger on `/healthz` so it does not sleep before a demo. Exactly one instance (the per-wallet write queue and in-memory graph require it). The owner key never goes on the host.
- **Domain**: `supabrain.blackslate.me` (UI, Vercel, Lane C) and `api.supabrain.blackslate.me` (server). Same site, so the owner session is an httpOnly `SameSite=Lax` cookie (`sb_admin`), signed with a key derived only for admin sessions; CORS allows the configured dashboard origins with credentials.

## Data flow: remember / recall (built, S2)
Code: `apps/server/src/memory/service.ts`, `engine/*`, `arkiv/store.ts`, `memory/sync.ts`. Every tool first re-checks the agent on ENS (registered to its wallet, status active, records complete; unreadable ENS → "authority unknown"). `recall` ranks by shared words + recency within an optional folder, returns quarantined items flagged with a reason (never as facts), adds only active ones to the agent's read-set and logs every reader. `remember` checks ENS (registered, active, folder within `sb.scope`), takes `cites` or the read-set as parents, computes trust = min(parents) and roots = union, then the agent's own wallet writes one Arkiv batch: memory + edges + taint rows + `changeOwnership` to the team wallet (one transaction, `$creator` agent ≠ `$owner` team). The tool answers as soon as the key is known (`pending`); the dashboard gets `memory` at once and `confirmed` with the proof link when the receipt lands (~5 s), or `write_failed`. On startup the server starts the watcher, then loads every memory for `app + team` from the known wallets (rejecting any whose `$creator` is not the agent it names) and rebuilds the graph; memories written by another process arrive through the watcher.

## Data flow: revoke (built, S3)
Code: `apps/server/src/memory/undo.ts`. Dry run (live memories whose roots include the target, or by its author, plus all descendants; authors, vendors, readers from the read log, pending payments, the vault root hash `keccak256(id)`) → the team wallet writes `sb.revocation` (max lifetime) and nothing else happens unless that lands → quarantine → `payments.onRevoke` (vault `revokeRoot` / `pauseAgent`, cancel intents; a failure is reported, the revoke stands) → purge read-sets → notices for authors and readers (in memory at once, `sb.notice` on Arkiv) → SSE `revocation` + `notice`. Each agent's next tool result starts with the retraction. Keep = one owner batch extending the memory and its edge + taint rows; refused when quarantined, so lies fade. On Arkiv, every memory derived from a source is one query away: `sb.taint where root = X`.

## Data flow: pay
Lane B's `createPayments`: policy over the whole team graph (ENS mismatch hard block, outside-content payee, caps) → intent → World approval when needed → attestation → BrainVault on Sepolia, which itself checks `getOwner(labelhash) == agent wallet` on chain. Mounted in the server in S5 ⏳.

## Keys and custody
| Key | Where | Used for |
|---|---|---|
| Owner | dev machines only (Kai, Srijit) | ENS registration, unregister (kill switch), records |
| Team | server | owns every Arkiv entity, extends (Keep), writes revocations |
| Agent ×3 | server | sign their own Arkiv writes; pay through the vault |
| Policy signer, guardian | server (Lane B) | payment attestations; vault revoke/pause |
| `TOKEN_SIGNING_SECRET` | server | agent bearer tokens |
| `ARKIV_ACCESS_KEY` | server | Rabdi RPC (in the URL path, redacted everywhere) |

## Failure modes (fail closed)
- Wrong `eth_chainId` on Sepolia or Rabdi at startup → the server does not start.
- ENS unreadable → `whoami` says authority unknown; writes and payments pause.
- MCP without `TOKEN_SIGNING_SECRET` or ENS → 503, never an open endpoint.
- Arkiv write: estimate first; a revert stops before signing; no automatic retry (an unknown outcome is reconciled by reading the chain).
- Vault step of a revoke fails → shown as "retry", the revoke itself stands.
