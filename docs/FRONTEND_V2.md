# Supabrain v2 frontend brief (for the UI Claude)

**As of 2026-11-06 21:30 IST, `main`.** Written after the backend upgrades so a fresh Claude session can build the website and merge cleanly. Read this file, then `docs/PLAN.md` (the product), `docs/API_V2.md` (the contract) and `packages/shared/src/types.ts` (import the types; never redefine them). The visual reference is `docs/design/supabrain-night.html` (Srijit's "Supabrain · Night"): open it in a browser first.

---

## 1. What the website must make obvious to a judge in 10 seconds
1. **Several AIs from different companies work on one project** and hand off with "continue". The website shows who did what, live.
2. **Every commit is on Arkiv, signed by that AI's own wallet.** Every node links to its Arkiv transaction and shows the signer.
3. **Each AI is an ENS name with rules** (`claude.otter.supabrain.eth`): on/paused, which paths it may write, writes per day. The rules are public records; changing them is a Sepolia transaction the server pays for.
4. **A prompt injection relayed from one AI to another is STOPPED,** and a write that breaks an AI's ENS rule is **BLOCKED with the rule named**. The other AI never receives it.
5. **Refs on ENS, objects on Arkiv** (git for AI memory): each AI's ENS name points at its newest commit on Arkiv (`sb.memory.head`), and the website shows ✓ when ENS and Arkiv agree.

Web3 isn't decoration here; each piece answers "why should I trust what another AI left me?":
- **Arkiv:** who wrote it, and nobody can quietly change it.
- **ENS:** what that AI is allowed to do, readable by anyone.
- **The server:** enforces both on every call.

## 2. Ground rules (non-negotiable)
- **Own only `apps/web` and `docs/DEMO_SCRIPT.md`.** Don't edit `apps/server` or `packages/*`. If you need an API change, write it under **Requests** in `docs/PROGRESS.md` (`- [ ] C → A: …`); Srijit's Claude owns the backend now.
- **Nothing hard-coded.**
  - The server URL comes from `NEXT_PUBLIC_SERVER_URL` (public, not secret).
  - Every name, address, link, count and rule comes from the API: `proofUrl`, `txUrl`, `arkivUrl`, ENS names, wallets, explorer links.
  - `pnpm lint:hardcode` must pass (fixtures under `apps/web/fixtures/**` are exempt).
- **No secrets in the browser.**
  - The owner signs in with a passphrase form → `POST /api/admin/login` sets an httpOnly cookie.
  - Never put the passphrase, tokens or keys in code or `NEXT_PUBLIC_*`.
  - Run `pnpm check:secrets` before every push; it also scans `apps/web/.next`.
- **Real data by default.** Fixtures only behind `?mock=1`, with a visible **MOCK DATA** banner.
- **Every status has a text label, never colour alone** (list in §7).
- **Git:** small commits (`feat(web): …`), `git pull --rebase` before push, never force-push.

## 3. Stack
- `apps/web` is a bare Next.js 16 App Router shell: React 19, port 3000, `transpilePackages` includes `@supabrain/shared`.
- **Styling:** plain CSS with the tokens below (CSS modules or one global sheet). No Tailwind needed.
- **Graph:** hand-written SVG, like the reference, for full control of the "scientific" look. Optionally `@xyflow/react` + `@dagrejs/dagre` for layout only.
- **Live data:** `EventSource` on `/api/stream` with `withCredentials: true`.
- **QR codes:** `qrcode.react`.
- Add no other dependency without a reason.

## 4. Design system (from `docs/design/supabrain-night.html`)
**Tokens:**
```css
--sans: 'Inter', system-ui, sans-serif;  --mono: 'JetBrains Mono', ui-monospace, monospace;
--bg:#050806; --fg:#E8EDE9; --muted:#8E9B92; --dim:#55625A; --line:#14201A; --line2:#2A4333; --panel:#080E0A; --panel2:#0C140F;
--flow:#5CFF8F;  /* healthy flow, verified */   --lie:#FF5C5C; --lie-text:#FFB4B4; --lie-on:#1A0505;  /* stopped / blocked */
--amber:#FFC247; --amber-on:#1A1200;            /* primary action, owner, pending */
--vc:#F59E6B (claude)  --vg:#6CB2FF (gemini)  --vo:#F28CC4 (openai)  --vh:#E8EDE9 (owner / human)
```
Dark-first. A light theme is optional; if you add one, define every token for both.

**Motifs to reuse:**
- the hero canvas "field" of drifting nodes, where one turns red and the redness spreads to its neighbours;
- the scroll-pinned story: step list left, lineage tree centre, live log right;
- **swimlanes per AI** with a name pill at the top of each lane;
- commits as dots on the lane, and parent edges as curves between lanes;
- particles flowing along live edges;
- revoked nodes turn into hollow red rings with an ✕ and struck-through labels;
- a ripple from the source when something is stopped;
- dot-matrix tiles for "grows / blast radius / forgets";
- pill buttons (`.btn.p` amber primary, `.btn.g` ghost, `.btn.r` red destructive);
- `.eyebrow` labels with a glowing dot, and a mono font for every hash, address and number.

**Type and space:** 500-weight headings with tight letter-spacing (`-.04em`), muted body text at 15–18 px, mono at 11–13 px for data, panels with 14–16 px radius and 1 px `--line2` borders.

**Motion:** subtle by default, dramatic only on STOP / BLOCK / revoke. Honour `prefers-reduced-motion`.

## 5. What the backend serves (all live on `main`)
Base: `NEXT_PUBLIC_SERVER_URL`. Always `fetch(url, { credentials: "include" })`. Errors are `{ error: CODE, message }`; show `message`.

### 5.1 Modes
`GET /healthz` → `{ ok, app, team, mode: "brain" | "team", ens, payments: "enabled" | "disabled" }`.
- **Brain mode** (`mode: "brain"`): the server serves one pre-made brain, e.g. `team = "otter"`, `ens = "otter.supabrain.eth"`.
  - The AIs are `claude`, `gemini` and `openai` (ENS `claude.otter.supabrain.eth`, …).
  - Rules are editable from the website. Payments are off.
- **Team mode** (`mode: "team"`): the v1 demo team (`lead-claude`, `gem-research`, `gpt-writer` under `supabrain.eth`) with payments (BrainVault, World approvals). Rules are read-only (owner key).
- Build for both. Read `mode` and `ens` from `/healthz`; never assume.

### 5.2 Brains and the registry
| Route | Returns |
|---|---|
| `GET /api/registry` | `{ teamRegistry, updatedAt, served, brains: [{ label, ens, index, registry, expiry, served, txUrls[], agents: { claude\|gemini\|openai: { ens, wallet, resolver, expiry, records, fundingUrl?, fundedGlm? } } }] }`: the **10 pre-made brains on ENSv2 Sepolia** (otter … tundra), each with its own subname registry and three AI names. Public |
| `GET /api/brains` | `[{ id, name, ens, visibility, active, stopped, agents: AgentView[] (+ authority, lastWriteAt, connectedClient), counts: { checkpoints, tasksOpen, tasksDone, files, notices } }]`: the brain this server serves |
| `GET /api/brains/:id/summary?focus=` | `{ text, pack }`: exactly what `continue` gives an AI (show it as "what the next AI will read") |
| `GET /api/brains/:id/checkpoints` | `CheckpointView[]`, newest first (the commit history) |
| `GET /api/brains/:id/tasks` / `POST` `{ title }` (owner) | `TaskView[]` / the new task |
| `GET /api/brains/:id/files` | `FileView[]` (current version per path) |
| `GET /api/brains/:id/files/content?path=&key=` | `{ path, key, content, status, agent, versions: [{ key, agent, vendor, at, size, status, deleted, proofUrl }] }`: blame per version |
| `GET /api/brains/:id/notes` | `MemoryNode[]` (decisions, facts, evidence) |

**`AgentView` fields that matter:**
- `label`, `ens`, `vendor`, `role`, `scope`, `wallet`;
- `status`: `active` · `paused` · `quarantined` · `unregistered` · `expired`, or `unknown` with `authority: "unavailable"` when ENS can't be read;
- `writeDaily` (string, present when the ENS record exists), `leaseExpiresAt`, `lastWriteAt`, `connectedClient` (e.g. `"claude-code 2.1.294"`).

### 5.3 Rules, safety and refs (new in this upgrade)
| Route | Returns |
|---|---|
| `GET /api/brains/:id/rules` | `{ editable, agents: [{ agent, vendor, ens, resolver, status, scope, writeDaily, role }] }`, read **live from ENS** |
| `POST /api/brains/:id/rules` `{ agent, status?, scope?, writeDaily?, role? }` (owner), or `POST /api/brains/:id/rules/:family` | `{ agent, ens, txHash, txUrl, changed: { status?: { from, to }, … } }`. One multicall on that AI's own resolver, signed by the server's team key (the user pays no gas). `txHash: null` means nothing changed. Errors: 400 INVALID (bad value), 409 NOT_EDITABLE (team mode), 409 NO_RESOLVER, 502 ENS_WRITE_FAILED. Takes ~10–20 s: show "writing to ENS…" |
| `GET /api/brains/:id/blocked` | `BlockedEntry[]`, newest first: `{ at, agent, ens?, tool: continue\|checkpoint\|checkout\|pay, code, rule?, message, key?, excerpt?, arkivUrl? }` |
| `GET /api/brains/:id/review` | stopped items for the owner: `[{ key, agent, ens, reason, excerpt, at, status: "stopped", arkivUrl }]` |
| `GET /api/brains/:id/heads` | `[{ agent, ens, serverHead, ensHead, match, txUrl?, error? }]`. ENS head = the text record `sb.memory.head` on the AI's ENS name; `match` = ENS points at the same Arkiv key the server has |

**`code` values and how to show them:**

| code | rule | Label | Meaning |
|---|---|---|---|
| `STOPPED` | `instruction-override`, `remote-code`, `payment-redirect`, `secret-exfiltration`, `rule-tampering`, `agent-to-agent-command` | **STOPPED · INJECTION** | Content that tries to steer another AI. It's saved (signed by the AI that relayed it), revoked on Arkiv at once (`arkivUrl`), and no AI receives it |
| `SCOPE` | `sb.scope` | **BLOCKED BY ENS · sb.scope** | A file write outside the AI's path scope |
| `RATE_LIMIT` | `sb.write.daily` | **BLOCKED BY ENS · sb.write.daily** | Over the writes-per-day record |
| `NOT_AUTHORIZED` | `sb.status` / `ens-owner` / `ens-records` / `revoked` | **BLOCKED BY ENS · PAUSED** (etc.) | The AI is paused, unregistered, its records are invalid, or it was revoked |
| `KEY_MISMATCH` | `ens-addr` | **BLOCKED · KEY ≠ ENS** | The server's key doesn't match the ENS address |
| `AUTHORITY_UNKNOWN` | `ens-unreadable` | **AUTHORITY UNKNOWN** | ENS couldn't be read; the server fails closed |

### 5.4 The graph (the hero)
- `GET /api/graph?since=<seq>` → `{ nodes: MemoryNode[] (+ dispute?), edges: Edge[], seq }`. This is **every entity rebuilt from Arkiv**.
- Kinds: `checkpoint` (commit), `task`, `file` (a version; its `text` is empty in the graph), `fact`, `decision`, `plan`, `evidence`, `ref`, `payment` (team mode).
- **Node fields:**
  - identity: `key` (Arkiv entity key), `agent`, `vendor`, `creator` (the **signer wallet** = Arkiv `$creator`);
  - lineage: `parents`, `roots`, `trust` (1 evidence, 2 agent, 3 human);
  - state: `status` (`active` · `quarantined` · `stale` · `expired`), `pending` (still being written), `proofUrl` (Arkiv tx or entity page), `createdAt`, `expiresAt`;
  - payloads: `checkpoint: { next, done[], client }` and `file: { path, size, sha256, deleted? }`.
- `GET /api/memory/:key` → node + `lineage: string[][]` (every path back to a root), `readers` (AIs that read it), `why` (when quarantined), `dispute`.

### 5.5 Live stream
`GET /api/stream?since=<seq>` (SSE; `id:` = seq; it replays on reconnect via `since` or `Last-Event-ID`).

| Event | Do |
|---|---|
| `memory {node, edges}` | Add the node. If `pending`, draw it dashed with "writing to Arkiv…" |
| `confirmed {key, proofUrl}` | Make it solid and attach the Arkiv link; a particle runs along its edges |
| `write_failed {key, error}` | Remove it; toast the error |
| `blocked {block}` | **New.** Red pulse on that AI's lane and an entry in the security feed (see §6.3) |
| `head {head: {agent, ens, key, txUrl, at}}` | **New.** The AI's ENS name now points at `key`; draw a "HEAD" tag on that commit with the Sepolia link |
| `revocation {target, affected, arkivUrl}` | Run the red cascade over `affected`, then refetch `/api/graph` (statuses are computed server-side) |
| `notice {toAgent, count}` | Badge on that AI |
| `connected {agent, client}` | Mark the AI connected (finishes `/connect`) |
| `kept`, `expired`, `agent`, `payment`, `approval` | As in `docs/PROJECT_REFERENCE.md` §9 (team mode) |

### 5.6 Connect (MCP)
- `POST /api/pair { label, client? }` (owner) → `{ agent, ens, client?, token, snippets: Record<Client,string>, prompt, code, qrPayload, expiresAt }`.
  - In brain mode, `label` is `claude`, `gemini` or `openai`.
  - `qrPayload` points at `<web>/connect?code=XXXXXXXX` (the code lasts 10 minutes).
- The `/connect?code=` page calls the public `GET /api/pair/:code` → `{ agent, ens, token, snippets, prompt, expiresAt }`, shows the snippet for each client with a copy button, then waits for SSE `connected`.
- **Clients:** `claude-code` (one `claude mcp add` command), `claude-ai` (also the Claude phone app), `antigravity` (a JSON block), `gemini-cli`, `chatgpt` (developer mode).
- Codex isn't in the snippets yet; the command is `codex mcp add <name> --url <mcp url>`. Show it as text built from the same URL the snippets use.
- **Identity first:** before the snippet, show the AI's ENS name, wallet, live rules (from `/api/brains/:id/rules`) and the Arkiv write-funding link (from `/api/registry`).

### 5.7 Owner session
`POST /api/admin/login { passphrase }` sets an httpOnly cookie. `GET /api/admin/me` → `{ admin }`. `POST /api/admin/logout`. Show owner controls (rules, tasks, pair, review) only when `admin` is true.

## 6. Screens
### 6.1 `/`: landing
- Use the reference's structure: hero field, a scroll-pinned story, how it works, inside the brain, try it. Rewrite the story for v2:
  1. Claude Code builds a to-do app; commits appear on Claude's lane.
  2. Switch to Antigravity and say "continue"; Gemini picks up the same task.
  3. Gemini reads a poisoned README; its relayed instruction is **STOPPED**.
  4. The write it asked for is **BLOCKED BY ENS · sb.scope**.
  5. Proof: the commit on Arkiv (signed by the AI) and the AI's ENS name pointing at it.
- The story may use the fixture (it's a story), but label it "example". Every CTA goes to real data: open the live brain, connect your AI.

### 6.2 `/b/[id]`: the brain (the main screen)
Layout from the reference's `.pin` grid: left rail, centre graph, right live log.
- **Left rail, the AIs.** One card per AI:
  - ENS name, vendor colour dot with a letter, role, status label;
  - scope, writes today vs `writeDaily` (count today's checkpoints by that agent from the graph);
  - the connected client;
  - HEAD ✓/✗ from `/heads`, with the Sepolia link;
  - the owner sees Pause/Resume and Edit rules (→ §6.4).
- **Centre, the commit graph.** "Scientific", precise and calm:
  - **Swimlanes:** one per AI (claude, gemini, openai, owner), each with a name pill and a commit count.
  - **Time axis:** vertical, newest at the bottom (or a toggle), with mono time ticks.
  - **Nodes:** a checkpoint is a dot on its lane; tasks and files are small glyphs attached to their checkpoint (expand on click).
  - **Edges:** `parents`. Same lane = trunk; across lanes = a bezier. An edge from Claude's commit to Gemini's commit is the hand-off; label the first one "continue".
  - **Encodings:**
    - fill = vendor;
    - dashed = pending;
    - hollow red ring + ✕ + struck label = STOPPED / quarantined;
    - amber ring = HEAD on ENS;
    - grey ghost = expired;
    - trust as a small mono `T1/T2/T3`.
  - **Hover card:** summary, ENS name, `creator` wallet (shortened, full on copy), Arkiv tx (`proofUrl`), parents, `client`.
  - **Click:** a drawer with full lineage paths (`/api/memory/:key`), files changed (with content viewer and blame), tasks ticked, and readers.
  - **Live:** particles on edges when a commit confirms; a ripple and red cascade on STOPPED or a revocation.
- **Right, the live log** (SSE). Memory, confirmed, head and blocked entries in the reference's `.it` style. Meters on top: Commits · Tasks done/open · Files · **Stopped** · **Blocked by ENS**.

### 6.3 The attack lab (a tab on `/b/[id]`, built for the judge demo)
Two consoles side by side, **Claude Code** and **Antigravity (Gemini)**:
- Each console shows that AI's MCP calls as they happen: `continue`, `checkpoint`, refusals.
- Reconstruct them from SSE (`memory` with `node.agent`, `blocked` with `block.agent`) plus `/blocked`.
- In between, a **rules strip** shows each AI's live ENS records (`sb.status`, `sb.scope`, `sb.write.daily`) with the resolver address.
- **When `blocked` arrives:**
  - STOPPED: show the excerpt in a red callout, the matched rule, "saved for review · revoked on Arkiv" with `arkivUrl`, and "Claude did not receive this".
  - SCOPE: show "gemini tried `.github/workflows/deploy.yml` · ENS says `sb.scope = docs/`" with a link to the AI's ENS name. Build the URL from `ens`, e.g. the ENS app domain page; the base URL comes from config, so ask the backend under Requests if it's needed.
- **Owner controls here:** narrow Gemini's scope to `docs/` (POST rules, shows the tx), Pause Gemini, Resume.
- **Don't run attacks from the browser.** The presenter drives the real AIs, or runs `pnpm demo:injection` in a terminal; the page just shows what's live. A fixture-backed replay is fine behind `?mock=1`.

### 6.4 `/b/[id]/rules`
- A table of AIs × rules: status (active/paused), scope (`*` or a path prefix ending in `/`), writes per day (integer), role.
- Owner edits go through `POST /api/brains/:id/rules`, then show "writing to ENS…", then the Sepolia link and read the values back (`GET /rules`).
- A note: "Rules are ENS text records on each AI's own resolver. Anyone can read them; the server enforces them on every call."
- Team mode: read-only, with a note.

### 6.5 `/b/[id]/history`, `/files`, `/tasks`
- **History:** `git log` style. `CheckpointView` rows: AI chip, summary, next, tasks ticked, files, time, Arkiv link, HEAD tags. A filter by AI.
- **Files:** a tree; the viewer shows the content and the version list with who wrote each (`versions`).
- **Tasks:** Open / Done (by whom, in which commit) / Stopped. The owner can add a task.

### 6.6 `/brains`: the registry
- The 10 pre-made brains from `/api/registry`: ENS name, registry address, lease, the three AI names with wallets, funding links, and which brain is served live.
- This proves "subname registry per project": every brain is its own ENSv2 registry, and every AI has its own resolver.

### 6.7 `/connect`
- The pairing flow from §5.6. The owner picks the AI family and the app; a QR appears; the phone opens `/connect?code=`.
- "Waiting for your AI…" until `connected`.

### 6.8 `/verify`
How to check everything without us:
- `pnpm verify:memory <key>` (Arkiv + ENS only);
- resolve `claude.<brain>.supabrain.eth` → text `sb.memory.head` → open that Arkiv entity;
- explorer links.

Show the current heads table from `/heads`.

### 6.9 `/b/[id]/review`
Stopped items (`/review`): the excerpt, the AI that relayed it, the rule, the Arkiv revocation link. Release isn't implemented; label it "release: coming soon", disabled.

## 7. Status labels (text, always)
- **Commit:** SAVED · SAVING · STOPPED · EXPIRED · HEAD.
- **Task:** OPEN · DONE · STOPPED.
- **AI:** ACTIVE · PAUSED · CONNECTED (app) · AUTHORITY UNKNOWN · UNREGISTERED · EXPIRED.
- **Security:** STOPPED · INJECTION · BLOCKED BY ENS · sb.scope / sb.write.daily / PAUSED · KEY ≠ ENS.
- **Brain:** LIVE (served) · LEASE UNTIL ….

## 8. The judge demo (4 minutes) and what the UI shows
1. **Hook** (landing): "Every builder here hands work between AIs with a HANDOFF.md. We made the hand-off accountable."
2. **Claude Code builds** (laptop): commits appear on Claude's lane and turn solid when Arkiv confirms; the HEAD tag appears with a Sepolia link.
3. **Switch to Antigravity, say "continue"** (laptop): a hand-off edge from Claude to Gemini; the task ticks.
4. **Attack lab:** Gemini reads a poisoned README. **STOPPED · INJECTION** in red, with the revocation link. Claude's next `continue` (left console) doesn't contain it.
5. **ENS rule:** the owner narrows Gemini to `docs/` on the Rules strip (a Sepolia tx appears). Gemini tries `.github/workflows` → **BLOCKED BY ENS · sb.scope**.
6. **Proof:** click a commit → signer wallet = the AI's ENS address, the Arkiv tx, lineage; `/verify` shows ENS head = Arkiv key ✓.
7. **Close:** "Supermemory makes AIs remember. Supabrain makes what they remember accountable: signed by the AI that wrote it, ruled by ENS, checkable on Arkiv."

Payments (team mode) are for the booth: BLOCKED by ENS mismatch, World approve/deny. See `docs/PROJECT_REFERENCE.md`.

## 9. Running it locally
```bash
pnpm i
SUPABRAIN_BRAIN=maple pnpm --filter @supabrain/server start      # brain mode on :3001 (needs the root .env.local)
pnpm --filter @supabrain/web dev                                  # :3000, with apps/web/.env.local NEXT_PUBLIC_SERVER_URL=http://localhost:3001
SUPABRAIN_BRAIN=maple pnpm demo:injection                         # the live judge scene against the running server
```
- **Only one server may write to Arkiv with the shared team wallet at a time.**
- `maple` is the brain kept for tests; demo on `otter`.
- CORS allows `http://localhost:3000` and the production UI origin (`config/app.json` `server.allowedOrigins`).
- `SUPABRAIN_BRAIN=<brain> pnpm mcp:token <claude|gemini|openai> --client claude-code` prints a ready MCP command for a real AI.

## 10. Fixtures
Create `apps/web/fixtures/v2-demo.json` with the same shapes as §5. Use them only behind `?mock=1` with the MOCK DATA banner:
- `/healthz`, `/api/registry`, `/api/brains`, `/api/graph`, `/checkpoints`, `/tasks`, `/files`, `/rules`, `/blocked`, `/heads`;
- an SSE timeline of the demo in §8.

## 11. Done means
- Every screen works on live data from a brain-mode server, and on the fixture with the banner.
- `pnpm lint:hardcode` and `pnpm check:secrets` pass, `pnpm --filter @supabrain/web build` succeeds, and `pnpm test` is still green.
- The steps you did are logged under "Log: Lane C" in `docs/PROGRESS.md`, and `docs/DEMO_SCRIPT.md` is written from §8.
