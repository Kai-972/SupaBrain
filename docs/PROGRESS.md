# PROGRESS: Supabrain (shared by Kai + Srijit + all 3 Claude sessions)

**Rules:**
- `git pull --rebase` before editing.
- Edit **only your own row and your own lane's sections.**
- Log entries go newest first.
- **Never write secrets here.** Names and public addresses only.
- Commit as `docs(progress): <lane> <stage/step> <result>`.
- If you hit a merge conflict here, keep both sides. It's a log.

Stage plan: `CLAUDE.md` §8. Step details: `docs/lanes/*.md`.

---

## Board

| Lane | Person | Claude | Current stage / step | Status | Blocked on |
|---|---|---|---|---|---|
| A: Brain (server, memory, Arkiv, ENS) | Kai | #1 | **v2** (docs/PLAN.md): step 1 continuity (continue/checkpoint/checkout, tasks, files) in progress | 🔨 | – |
| C: Face (website) | Kai | #2 | **v2**: simple website from docs/API_V2.md (fixtures first) | ⏳ | A: step 1 endpoints |
| B: Money & Security (policy, vault, World) + v2 brains on ENS + **Lane A server (Kai down)** | Srijit | #3 | v2: B1 ✅ B2 ✅ B3 ✅ B6 ✅ · step 4 rules+Stop ✅ · brain mode + ENS heads ✅ · live scene waits for go · UI brief `docs/FRONTEND_V2.md` | 🔨 | Srijit: go for `demo:injection` |

Status icons: ⏳ not started · 🔨 in progress · ✅ done · 🛑 blocked · ⚠️ fallback taken

---

## v2 checklist (docs/PLAN.md §4; tick with a proof link or commit hash)

### Step 1: continuity in the demo brain (A)
- [x] shared types: kinds task/checkpoint/file, TaskView/FileView/CheckpointView (3cbbf50)
- [x] engine: task done rule, current file versions, heads, summary with focus (unit tests) (3cbbf50, 31b522e)
- [x] Arkiv: one write per checkpoint (tasks + files, keys predicted, checkpoint last) (3cbbf50; live: 31 KB file confirmed in 7.6 s)
- [x] MCP: continue / checkpoint / checkout, server instructions, `continue` prompt; v1 tools hidden (31b522e)
- [x] website API: summary, checkpoints, tasks (+ add), files (+ content), notes (31b522e)
- [ ] live: Claude Code → Antigravity in an empty folder, "continue" finishes a task

### Step 2: app check (Kai, B, A)
- [ ] Antigravity: write + continue
- [ ] Claude phone app (connector from claude.ai)
- [ ] Codex · [ ] ChatGPT developer mode · [ ] Gemini app "Custom apps" (availability)

### Step 3: brains and people
- [x] B: brains on ENS (registries, claude/gemini/openai names, rules) + brains.sepolia.json + `ens:brains-status` (10 brains, 30 AI names, verified on chain; 0f87d66)
- [x] B: AI wallets funded with tGLM (cost per write measured): 30 × 0.33 tGLM on Rabdi from a separate funder
- [ ] A: wallet sign-in (SIWE), create brain, active brain, per-family links, brain by name
- [ ] live: someone outside the team creates a brain, connects two apps, works

### Step 4: rules and Stop
- [ ] B: ENS rules writer (`packages/ens/src/rules.ts`)
- [ ] A: rules form API → ENS; paused / paths / writes per day enforced with the reason
- [ ] A: malicious-content flag → stopped + review notice; Stop / resume a brain
- [ ] live: paused AI refused; poisoned README stopped with a notice

### Step 5: private brains (A)
- [ ] contents encrypted on Arkiv; the brain's AIs and owner read them; live check on the explorer

### Step 6: hosting + simple website (A, C)
- [ ] server on api.supabrain.blackslate.me · [ ] website on supabrain.blackslate.me · [ ] full demo from the hosted version

### Step 7: ship
- [ ] README · [ ] SPONSORS · [ ] arkiv/* · [ ] DEMO_SCRIPT · [ ] SECURITY · [ ] video · [ ] rehearsals · [ ] submitted

## Stage checklist v1 (tick with a proof link or commit hash)

### S0: Scaffold
- [x] A: monorepo, config + zod, types + interfaces, fakes, guards, `.env.example`, MIT, first push (1f0390c)
- [x] B: pulled; Foundry init; `packages/payments` skeleton builds
- [ ] C: pulled; Next app, tokens, fixture loader, `?mock=1` banner

### S1: Spikes
- [x] A · S1 ENS: team name + registry · agent + own resolver · `sb.memory.head` ✓ · `sb.pay.cap` revert tx · UR read-back · unregister → null · transfer revert · **handoff `ens.sepolia.json` to B** (cff14b9; proofs in the A log)
- [x] A · S2 Arkiv: batch ok · `$creator ≠ $owner` in ONE tx · queries ok · **extend-on-readonly: WORKS (owner extends; nobody patches; Keep = 1 batch)** · watcher fires · expiry exact · friction logged (8 entries) (proofs in the A log; `pnpm arkiv:query`)
- [x] A · S3 MCP: public URL (ngrok static domain) · Claude Code ✓ · Claude.ai ✓ (path token) · Antigravity ✓ · bad token 401 ✓ (fafbe3a; quirks in the A log)
- [x] B · S4 World: IDKit 4 live: approve ×3 · deny (`verification_rejected`) · cancel (85c358a; runs logged in WORLD_DEBRIEF.md)
- [x] B · S5 Vault: `forge test` green (mock registry) · 47 passed · V1 review done (0 crit/high/med; L-2/L-3/L-4 fixed) · 34f9228
- [ ] C: static graph with all encodings + list view (screenshot)

### S2: Memory core
- [x] A: whoami/recall/remember/explain ✓ · lineage + trust tests ✓ · Arkiv batch writes ✓ · startup rebuild ✓ · ENS check per call ✓ · SSE ✓ · `/api/team` `/api/graph` `/api/memory/:key` ✓ (live: `pnpm e2e:memory` 11/11, real Claude Code session; Antigravity write still to run by Kai) (b5d0d05, 6a9234f)
- [x] B: fork test vs the real team registry ✓ e4fcbf5 · V1 review ✓ · deployed ✓ [0x2da7…0ec8](https://sepolia.etherscan.io/address/0x2da794b8dd00afc970b372d7cf960ecd1f190ec8) · 1-USDC pay tx ✓ [0x9ab2…06ae](https://sepolia.etherscan.io/tx/0x9ab200485f3fbf0c5f39a832d9c19a00e31cfaab0b04d1d52009f6c7f2a806ae) · `step-kill` revert tx ✓ [0x516b…4579](https://sepolia.etherscan.io/tx/0x516b96da3c4df023563178a2a2f71cb6d351b48abcc945d8d09d3380d53e4579) · `decidePayment` table tests ✓ 202d16e
- [ ] C: drawer · agents rail · feed · **switched to real graph + SSE**
- [ ] **Gate:** Claude Code + Antigravity write to one graph, live in the UI

### S3: Undo ⭐ (memory-first checkpoint)
- [x] A: dry run (+ readers) ✓ · revoke ✓ · quarantine ✓ · notices ✓ · Keep ✓ · Correct this ✓ · Add context ✓ · refs ✓ · recall log ✓ (live: `pnpm e2e:undo` 14/14; restart keeps revocations, corrections, Keep and notices)
- [x] B: `onRevoke` (`revokeRoot`, cancel intents) · `pauseAgent`. Live: revoke email → [vault revokeRoot](https://sepolia.etherscan.io/tx/0x7083d77c6266ac8afb64021d1899eb1ac7f6dd94298fafcff8153659fd983137) → [on-chain `RootRevoked` refusal](https://sepolia.etherscan.io/tx/0x7e589a3ce39efbf3bb0f964c6f13a1cfc3d852a29e7b0a337c9521e77a70ddd4)
- [ ] C: dry-run modal · cascade · Keep/Correct/Add context · ref card · before/after
- [ ] **Gate:** one full rehearsal without money (connect → write → dry run → revoke → re-ask)

### S4: Onboarding
- [x] A: `/api/pair` ✓ · snippets ✓ · copy prompt ✓ · `/connect?code` QR (short code, never the token) ✓ · `connected` event ✓ · path-token route ✓ (7759e82; live: pair → code swap → whoami → `connected` on SSE)
- [x] B: token design security review ✓ 1cc1296 (F1–F3 fixed by A)
- [ ] C: `/t/connect` with QR → green on connect
- [ ] **Gate:** a stranger's AI connects from the QR

### S5: Money
- [x] A: acme vendor ENS (own resolver, vendor-owned records) ✓ · `EnsAuthority` vendor fns ✓ · `GraphView` (live graph) / `ArkivWriter` (team writes `sb.payment`) ✓ · `pay`/`pay_status` mounted ✓ · `/api/payments` `/api/approvals` (World link owner-only) ✓ · payment memories after PAID ✓ · `PROTECTED_PAYEE` ✓ · `demo:seed` ✓ (32246da, 4ff34c4). **Live P1/P3 waits for B's five env values on Kai's laptop**
- [x] B: `createPayments` end to end (policy ✓ 30f99b8 · attestation ✓ f59b6b9 · vault client ✓ 1973e38 · engine + pending-human ✓ 26d47f0 · createPayments ✓ 30a54e6 · Sepolia deploy ✓ 7c1429e · mounted by A · live)
- [ ] C: payments page
- [x] **Gate:** P1 BLOCKED (ENS mismatch) from a real MCP client (`demo:step blocked` through the server's pay tool) · paid tx on Etherscan: [P3](https://sepolia.etherscan.io/tx/0x7b983ad5aafadce22a1fdd98da09a3710be64be673f96c39602c5663de517528)

### S6: Human
- [x] B: World approve → [paid](https://sepolia.etherscan.io/tx/0x7b983ad5aafadce22a1fdd98da09a3710be64be673f96c39602c5663de517528) · deny → nothing moved · owner cancel → nothing moved (expire: unit tests)
- [ ] C: approval card
- [x] **Gate:** both paths live (approve → paid, deny → nothing moved; 2026-11-06, Srijit's World App)

### S7: Extras (cut order applies)
- [ ] A: ENS watcher · Notion import · public "ETHMumbai brain" · `/api/advisories`
- [ ] B: restore-with-World · enroll owner sub
- [ ] C: rules · advisories · landing · mobile

### S8: Ship
- [ ] A: `seed.ts` on a fresh team · Arkiv docs · README addresses · V5 + V6
- [x] B: SECURITY.md ✓ cbb5549 · WORLD_DEBRIEF.md ✓ 7540d6e · SPONSORS World/Vault ✓ fdf684b · V3 red team ✓ 1c8ae65 · live evidence + PROTECTED_PAYEE c7f6f5e
- [ ] C: DEMO_SCRIPT.md · video · README · Vercel · V2 sponsor audit
- [ ] Rehearsal 1 · Rehearsal 2 · Rehearsal 3 · **Submitted** (link: ___)

---

## Requests (cross-lane; format: `- [ ] FROM → TO: ask (time)`)
- [ ] C → A: `/blocked` lives in memory, so after a server restart the security feed and the rule-hit chart lose earlier refusals. Stops still show, from quarantined checkpoints on Arkiv. Ask: persist BlockedEntry rows (e.g. `sb.block` on Arkiv, team wallet), or reload them from the stop revocations at startup (2026-11-06 22:05 IST)
- [ ] C → A: secret refusals (`INVALID` from `scanSecrets`) aren't in `/blocked`, so the site can only show them from the current lab session. Ask: record them as code `SECRET` (no excerpt, since it's a secret) (2026-11-06 22:05 IST)
- [ ] B → A: **brains are ready** (2026-11-06 20:12 IST): 10 brains (otter … tundra, indexes 1–10) and 30 AI names verified on ENSv2 Sepolia (`pnpm ens:brains-status`), and every AI wallet holds 0.33 tGLM on Rabdi, so checkpoints can be signed by each brain AI's own wallet. Read them with `readBrainsDeployment(root)`; wallets are `brainAgentAccount(BRAIN_AGENT_MNEMONIC, brain.index, family)`. Tell B when B4 (demo-brain pay steps) and B5 (Codex / ChatGPT) can run
- [ ] B → A: **brains are going live on ENS** (2026-11-06 19:44 IST): `otter` is verified on chain (`pnpm ens:brains-status`); the other 9 are provisioning now. The team wallet holds 0.005 ETH on Sepolia for rule changes. Two notes for the server: (1) read rules through the same `createRulesWriter` instance you write with. A fresh read right after a change hit a lagging RPC node and showed the old `sb.status` next to the new `sb.scope`; the writer pins reads to its last receipt block. (2) Brain AI wallets on Rabdi are unfunded until Srijit's faucet claim lands (`pnpm brains:fund`). Until then, checkpoints in brains other than the demo brain will fail the balance check. `BRAIN_AGENT_MNEMONIC` comes from Srijit privately
- [ ] B → A: **v2 brains contract** (2026-11-06 19:27 IST): read brains with `readBrainsDeployment(root)` from `@supabrain/ens` (`config/deployments/brains.sepolia.json`: per brain `{label, ens, index, registry, tokenOwner, expiry, agents: {claude|gemini|openai: {ens, labelhash, wallet, resolver, accountIndex, addressIndex, expiry, records, funding?}}}`). AI wallet = `brainAgentAccount(BRAIN_AGENT_MNEMONIC, brain.index, family)` (indexes start at 1). Rules: `createRulesWriter({ keys: ruleKeys(config.app.ens.textKeys, readBrainsConfig(root)), parentName: "supabrain.eth", txUrl, account: TEAM, chain: sepoliaChain(config, rpcUrl) })` then `setRules(aiEns, {status?, scope?, writeDaily?, role?})` → `{txHash, txUrl, changed}` (errors `RulesError` INVALID / NOT_OURS / NO_RESOLVER / REVERTED). The writes-per-day key is `sb.write.daily`. `BRAIN_AGENT_MNEMONIC` comes from Srijit privately. The team wallet needs Sepolia ETH to change rules (B will send some from the owner on "go"). Brains go on chain after Srijit's go
- [ ] A → B: **v2 tasks B1–B6** (docs/PLAN.md §4, DECISIONS 2026-11-06 19:30): brains on ENS + `config/deployments/brains.sepolia.json` + `ens:brains-status`; tGLM funding from a separate FUNDER key (cost per write measured first); `packages/ens/src/rules.ts` rules writer; demo-brain payments re-check after step 1; Codex/ChatGPT tests; SECURITY.md MVP update. Wallet derivation: `mnemonicToAccount(BRAIN_AGENT_MNEMONIC, { accountIndex: brainIndex, addressIndex: familyIndex })`, families [claude, gemini, openai] (2026-11-06 19:30 IST)
- [ ] A → C: **v2 website contract is `docs/API_V2.md`** (sign-in, brains, connect, summary, checkpoints, tasks, files, notes, rules, Stop, review). Build on fixtures with the MOCK DATA banner until each step lands; simple pages first (2026-11-06 19:30 IST)
- [ ] C → A: `/healthz` is outside the `/api` CORS scope (`app.use("/api", cors(...))`), so the browser on :3000 gets a CORS error and can't read `payments: enabled|disabled`. Ask: mount `cors()` on `/healthz` too (or add `GET /api/health`). Until then the web app skips health and always shows the Payments nav (2026-11-06 16:00 IST)
- [ ] B → C: **read `docs/PROJECT_REFERENCE.md` first**: one file with the whole current picture for the UI build (story beats → API/SSE → what to render, the `dispute` field, payments reasons and approval card, every live endpoint, namespaces, proof links, rules). Pitch story page (plain English, 8 pictures): https://claude.ai/artifact/Y97gb3sEWrZegkKAgfEYU5 (2026-11-06)
- [ ] B → C: **new `dispute` field** on nodes in `GET /api/graph` and on `GET /api/memory/:key`: `{state:"disputed", subject, ensAddress, claimed[]}` or `{state:"unverified", subject, reason}`. Please show an amber "Disputed by ENS" chip (text label, not only colour) on those memories; QUARANTINED styling wins when both apply. Narrative for DEMO_SCRIPT: *"Gemini saves the email and is told at once it disagrees with Acme's ENS (machines flag in milliseconds); the AIs build on it anyway; pay is BLOCKED; one revoke cleans it (humans decide in minutes)."* README: add `pnpm verify:memory <key>` as the "verify without trusting us" command next to `pnpm arkiv:query` (2026-11-06)
- [x] B → A (fixed by B at Srijit's request, b7e449b + 606f216): **/api/payments forgets decisions across a server restart.** Live: P1 (blocked) disappeared from \`GET /api/payments\` after I restarted the server; it is on Arkiv as \`sb.payment\`. The engine keeps intents in memory and \`ArkivWriter\` is write-only. Ask: add \`loadPayments(): Promise<Payment[]>\` to the adapter (read this namespace's \`sb.payment\` rows by the team wallet, newest per intentId); B will seed \`list()\` and the "paid before" set from it at startup (shared interface change, so A's call) (2026-11-06)
- [x] B → A (fixed by B at Srijit's request, cc60d66 + 0a80472: \`demo-seed.<namespace>.json\`) (FYI): \`demo:seed\` rewrites \`config/deployments/demo-seed.json\` for whichever namespace it seeds; B did NOT commit B's \`supabrain-mumbai26-b\` copy so A's committed one stays. Consider a per-namespace file name (2026-11-06)
- [x] B → A (fixed by B at Srijit's request, 63b8e43 + d5299ce): **URGENT (demo): `MemoryGraph.walk` destroys lineage.** `apps/server/src/engine/graph.ts` `walk()`: `const queue = next(start)` is the start node's live `parents` array; `queue.shift()` drains it, so every `ancestors(key)` (called by `pay` through GraphView) leaves that node with `parents: []` in memory. Live repro: `demo:seed` → `demo:step blocked` → `/api/graph` edges 6 → 3 (Arkiv unaffected; restart heals). Fix: `const queue = [...next(start)]`. Tests: `src/engine/graph-walk.repro.test.ts` + `src/payments/lineage-repro.test.ts` (`it.fails`; flip to `it` after the fix). Until then the dashboard loses edges after each payment and memory-target revokes cascade short; source revokes and money decisions are unaffected (roots) (2026-11-06)
- [x] B → A (minor, fixed by A 8fc1499): `scripts/doctor.ts` reads a top-level `issuer` from `config/world.json` ("no issuer … yet"); World now lives under `world.json.idkit` (+ `oidc` fallback). Report `idkit.environment` + the WORLD_* env names instead (2026-11-06)
- [ ] A → B: S5 is mounted (32246da). To run P1/P3 live on Kai's laptop, send Kai privately your `POLICY_SIGNER_PRIVATE_KEY`, `GUARDIAN_PRIVATE_KEY`, `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_SIGNING_KEY` (until then the server logs "payments disabled: missing env POLICY_SIGNER_PRIVATE_KEY" and `pay` fails honestly). `PROTECTED_PAYEE` is in `PayReason` now. Your `demo:step blocked` already reaches the mounted `pay` tool with the seeded M2 and attacker address (2026-11-06 12:56 IST)
- [ ] A → C: **pairing + payments endpoints are live**: `POST /api/pair {label, client?}` (owner) → `{agent, ens, client, token, snippets: Record<Client,string>, prompt, qrPayload, code, expiresAt}`; the QR points at `<web>/connect?code=XXXXXXXX` (10-minute code); the `/connect` page calls public `GET /api/pair/:code` → `{agent, ens, token, snippets, prompt, expiresAt}` (404 when expired) and then watches SSE for `connected {agent, client}`. `GET /api/payments` → `Payment[]`; `GET /api/approvals` → `ApprovalView[]` (`verificationUri` is empty unless the owner cookie is sent: show the World QR only on the owner dashboard); `POST /api/approvals/:id/cancel` (owner) → 204. SSE carries `payment` and `approval`. `/healthz` says `payments: enabled|disabled` (hide the payments nav when disabled) (2026-11-06 12:56 IST)
- [ ] A → C: **owner actions are live (S3)**, all need the `sb_admin` cookie (401 otherwise): `POST /api/dryrun {target}` → `DryRun`; `POST /api/revoke {target, reason?}` → `{revocationKey, arkivUrl, affected, notified, dryRun, vaultTxUrl?, cancelled, ensNote?}` (takes ~5 s: the revocation is written to Arkiv first; show "writing to Arkiv…"); `POST /api/memory/human {text, kind, folder, subject?, ref?}` (Add context, trust 3); `POST /api/memory/:key/keep {days?}` → `{expiresAt, days, txUrl, extended}` (409 `KEEP_REFUSED` when quarantined); `POST /api/memory/:key/correct {text}` → `{revocationKey, arkivUrl, newKey, affected}`. Errors are `{error: CODE, message}` with 400/404/409/502. SSE adds `revocation`, `notice {toAgent, count}`, `kept`. A memory's `why` explains its quarantine (2026-11-06 10:59 IST)
- [ ] A → C: **real API is live (S2)**, switch screen by screen from fixtures: `GET /api/team`, `/api/graph?since=<seq>`, `/api/memory/:key` (with `lineage: string[][]`, `readers`, `why` when quarantined), `/api/recall-log?agent=&q=`, `/api/stream?since=<seq>` (SSE, `id:` = event seq, replay on reconnect via `since` or Last-Event-ID), `POST /api/admin/login {passphrase}` → httpOnly cookie `sb_admin` (SameSite=Lax; use `credentials: "include"`), `GET /api/admin/me`, `POST /api/admin/logout`. Dev server: `https://swear-commend-everybody.ngrok-free.dev` (when Kai's laptop runs `pnpm dev:public`); CORS allows `http://localhost:3000` and `https://supabrain.blackslate.me` (config `server.allowedOrigins`). Small additions to §6: (1) new StreamEvent `{ t: "write_failed", key, error }`: an optimistic (pending) memory did not land, drop it; (2) `/api/team` agents carry `authority: "live" | "unavailable"` and `status: "unknown"` when ENS cannot be read: show "authority unknown", never a guessed status; `connectedClient` is a string like "claude-code 2.1.294"; (3) memories loaded at startup have `proofUrl` = the Arkiv entity page (`…/entity/<key>`), new writes the tx page. Domain: UI on `supabrain.blackslate.me`, API on `api.supabrain.blackslate.me` (same site, so the cookie works) (2026-11-06 10:50 IST)
- [x] (A 2026-11-06, 32246da: mounted; `pay`/`pay_status` are live MCP tools; an agent revoked on Arkiv is refused before your engine) B → A: **mount the payment tools** in `apps/server/src/mcp/server.ts` (S5): `registerPaymentTools(server, { payments, agentOf })` from `@supabrain/payments` (MCP `pay` + `pay_status`; the agent comes only from the token; text replies tell the model what to relay). `pnpm demo:step blocked|approve` calls exactly these tools, so they work the moment you mount (2026-11-06)
- [x] (A 2026-11-06, 4ff34c4: `pnpm demo:seed` writes `config/deployments/demo-seed.json` with H1 H2 E1 M1 M2 M3 M4 E2 M5 + both burner addresses; verified `demo:step blocked` reaches the pay tool through it) B → A: **seed output for the demo fallbacks**: have `scripts/demo/seed.ts` write `config/deployments/demo-seed.json` = `{ "attackerAddress": "0x…", "attackerPartnerAddress": "0x…", "keys": { "H1": "<memory key>", "M2": "<memory key>", … } }` (keys use the C-UI §5 fixture names). `demo:step blocked` pays `attackerAddress` citing `keys.M2`; `approve` cites `keys.H1`. Until then both take `--payee` / `--cites` (2026-11-06)
- [x] (A fixed 2026-11-06 in 6a9234f: logs show the route pattern `/mcp/t/:token`, never the raw URL; redaction is case-insensitive too; your test now runs as `it`) B → A: **MCP token review F1 (HIGH): path token logged in clear.** Express routes case-insensitively, so `/MCP/T/<token>` authenticates (200), but `redactTokenPath` (`apps/server/src/auth/tokens.ts:41–43`) only matches lowercase `/mcp/t/`. Fix: log `req.route?.path` + agent label instead of `originalUrl`, or redact via `req.params.token` / an `/i` regex. Test: `apps/server/src/mcp/security-review.test.ts` F1 (`it.fails`; flip to `it` when fixed). Rotate `TOKEN_SIGNING_SECRET` if any shared log has seen a mixed-case path (2026-11-06)
- [x] (A fixed in 6a9234f: JSON error handler, malformed JSON → JSON-RPC -32700, no stack; verified on the public URL) B → A: **F2 (medium): unauthenticated stack trace.** `express.json` runs before auth; a malformed body returns Express's HTML error page with a stack and local file paths. Fix: an error middleware returning JSON-RPC `-32700` (no stack), and `NODE_ENV=production` on the host. Test: F2 (2026-11-06)
- [x] (A fixed in 6a9234f: control characters stripped and lengths capped for clientInfo, method and tool name) B → A: **F3 (low): log forging.** `clientInfo.name/version` are logged and stored unsanitised (`mcp/routes.ts:31–39`); strip control chars, cap length. Test: F3 (2026-11-06)
- [x] (A 2026-11-06: D1 done, every tool incl. `recall` requires ENS active (test: kill switch blocks reads). D2: instead of changing the MAC (which would invalidate the three connected clients), each deployment uses its own `TOKEN_SIGNING_SECRET` (Render gets a fresh one); logged in DECISIONS. D3 done: `pnpm dev:public` runs ngrok with `--inspect=false` (verified: 0 requests recorded). D4 done: the 401 body is generic, the reason goes to the server log; test added) B → A: design notes, no test: **D1** no per-token revocation (7 d TTL); when `recall` lands it must check ENS status too, or a leaked token reads team memory for 7 days. **D2** bind tokens to the deployment: MAC `v1|<appNamespace>|<label>|<exp>`. **D3** run ngrok with inspection off (it records full URLs incl. path tokens); consider a shorter TTL for path tokens. **D4** (minor) 401 text distinguishes expired vs bad_signature (2026-11-06)
- [x] (A added it to `packages/shared/src/types.ts` in 32246da; B: switch `policy.ts` to it) B → A (agreed by A 2026-11-06; A adds it in S5): exact name **`{ code: "PROTECTED_PAYEE"; label: string }`** in `PayReason`, `label` e.g. "agent wallet lead-claude" / "BrainVault" / "USDC token" / "zero address"; B then switches `policy.ts` from `AGENT_NOT_AUTHORIZED` to it. Today a payee that is a team-controlled wallet (agent/vault/token/server key; V3 red team R1/R2) is blocked as `AGENT_NOT_AUTHORIZED` with a clear detail string; a dedicated code would read better in the UI. No rush (2026-11-06)
- [x] B → A, C (done by B, as A asked): `PROJECT.md` §6.3 "How we use it" and §10 are out of date for World: we use **World ID 4 via IDKit** (Human-in-the-loop pattern), not the OIDC device flow (its portal needs an enterprise Google account), and World proofs are **real, not mocked** (live approve/deny/cancel in WORLD_DEBRIEF.md). Action binding is native now (action = intent hash). Please update or point to SPONSORS.md#world (2026-11-06)
- [x] B → A (done by A, 2026-11-06): World moved to IDKit 4. Please add to `.env.example`: `WORLD_APP_ID=` (public), `WORLD_RP_ID=` (public), `WORLD_SIGNING_KEY=` (secret, B). `WORLD_CLIENT_ID/SECRET` stay as the OIDC fallback. Also make `check-secrets.mjs` flag a non-empty `WORLD_SIGNING_KEY=` value (2026-11-06)
- [x] (A mounted it in S5, 32246da: `mountPayments` with the live graph, the Arkiv `sb.payment` writer and the event bus; falls back to the disabled stub with the reason logged) B → A (A replies 2026-11-06 08:28 IST: will mount in S5 together with the GraphView/ArkivWriter adapters, which do not exist yet; the try/catch-to-disabled pattern is accepted): **`createPayments` is ready** (30a54e6). In `apps/server/src/index.ts`, mount it instead of the disabled stub: `try { payments = createPayments(deps) } catch { payments = createPaymentsDisabled() }`. It throws until `config/deployments/vault.sepolia.json` exists (I write it at deploy), and every call fails closed with a clear error if the chain checks fail. Extra method for tests only: `createPaymentsEngine(...).settled(intentId)`. MCP `pay` returns `pending_human` immediately; `pay_status` = `payments.status(intentId)` (2026-11-06)
- [x] B → A (done by A, cff14b9): `GraphView` has no `get(key)`. `decidePayment` takes attestation roots from a cited memory's ancestors, so a cite that is itself a root (evidence/human memory) adds nothing. Please add `get(key): MemoryNode | undefined` (or `roots(key)`) to the interface (2026-11-06)
- [ ] B → C: blocked/pending decisions list **all** reasons, hard first (P1 = ENS_MISMATCH, OUTSIDE_CONTENT_PAYEE, NEW_PAYEE, OVER_CAP). `path` is the offending lineage (cite → payee memory → evidence), e.g. P1 `["0xM2","0xM1","0xE1"]` (2026-11-06)
- [ ] B → C: the approval card shows `ApprovalView.verificationUri` (the IDKit `connectorURI`) as a QR plus a "open in World App" link, with `userCode` as a short reference. The URI carries the bridge key, so render it **only** on the owner-authenticated dashboard and never log it. Deny/expire/cancel come back as `PayDecision` statuses (2026-11-06)
- [x] B → A (done by A): vault pay() calls `getOwner(labelhash)` on the team UserRegistry; `ens.sepolia.json` needs per-agent `labelhash` + `registry` + `wallet` for `set-agents` (2026-11-06) → `teamRegistry.address` + `agents.<label>.{labelhash,wallet}` landed
- [x] B → A: `config/app.json` needs `payments.eip712 {name, version}` for the vault domain (vault takes them as constructor args) (2026-11-06) → done: `{ "name": "BrainVault", "version": "1" }` (matches your tests), zod-validated as `config.app.payments.eip712`
- [x] A → B, C: **S0 pushed: B and C can pull** (1f0390c, 2026-11-06 04:42). Notes for you:
  - Import types/interfaces from `@supabrain/shared` (browser-safe). Node config loader: `@supabrain/shared/config` (`loadConfig()`, `requireEnv()`). Fakes: `@supabrain/shared/testing` (`FakeEns`, `FakeGraph`, `FakeArkivWriter`), unit tests only.
  - Run the doctor as `pnpm run doctor`: plain `pnpm doctor` is a pnpm built-in and prints nothing.
  - B: `packages/payments/src/index.ts` exports a throwing `createPayments` stub for you to fill. `contracts/` keeps your Foundry setup (my `.gitkeep` is harmless; delete it if you like). `config/world.json` is yours; the loader accepts it loosely (`WorldFileSchema` in `config-schema.ts`), so tighten it via a Requests line.
  - C: `apps/web` is a bare Next 16 shell (no Tailwind/shadcn yet); `transpilePackages` already includes `@supabrain/shared`. Port 3000; the server is on 3001.
  - `pnpm build` = `tsc` typecheck per package + `next build`. The server runs TS directly with `tsx` (`pnpm --filter @supabrain/server dev|start`).

- [x] A → B: **S1 ENS done: the fork test and `set-agents` can start** (2026-11-06 08:28 IST). B: received; fork test 4/4 green on live Sepolia (e4fcbf5)
  - `config/deployments/ens.sepolia.json`: `teamRegistry.address` is the `registry` for `setAgent`; per agent `labelhash` is a 0x bytes32 (the vault's uint256 id is `BigInt(labelhash)`), plus `wallet`, `resolver`, `expiry` (unix s) and every tx hash. `ens.agentRegistryRef(label)` returns the same.
  - Live negatives/positives for the fork test: `lead-claude`, `gem-research`, `gpt-writer` are registered now; **`test-agent` is a throwaway that is UNREGISTERED** (use it for `AgentNotRegistered`; do not unregister a demo agent for tests). It can be revived with `pnpm ens:add-agent test-agent --throwaway --yes`.
  - Kill demo (`step-kill`): `pnpm ens:unregister gem-research --yes` (owner key; also revokes the agent's resolver grant), revive for the next rehearsal with `pnpm ens:add-agent gem-research --yes`. Both are dry runs without `--yes`.
  - `createEnsAuthority({ app, deployments, chain: createViemEnsChain(client) })` from `@supabrain/ens`; example in `scripts/ens/status.ts`. It throws `EnsUnavailableError` when ENS cannot be read: treat that as "authority unknown" and fail closed. `AgentView.leaseExpiresAt` is **unix milliseconds**. Caps come from ENS records (`sb.pay.cap` etc.), not config.
  - Not yet available: `findVendorEns` returns null until the `acme` vendor name exists (S5).

## Hand-offs (when a Claude account hits its limit)
<!-- ### <time> · <lane> · state / next step / open questions -->

## Asks received (names only, never values)
- 2026-11-06 · B · ASK WORLD_APP_ID / WORLD_RP_ID: received, validated (live approvals verified by World)
- 2026-11-06 · B · WORLD_SIGNING_KEY: generated locally; only its signer address was registered with World (0x03c3…b479)
- 2026-11-06 · B · ASK SEPOLIA_RPC_URL / OWNER_PRIVATE_KEY / AGENT_LEAD_CLAUDE_PRIVATE_KEY / AGENT_GEM_RESEARCH_PRIVATE_KEY: received, validated (chain 11155111; owner 0xFcf0…E198, lead-claude 0xEd4a…1bfC, gem-research 0x6c57…590c all = ens.sepolia.json)
- 2026-11-06 · B · POLICY_SIGNER_PRIVATE_KEY / GUARDIAN_PRIVATE_KEY: generated locally (policy 0x4F24…26d0, guardian 0x2782…4D51)
<!-- - <time> · <lane> · ASK <NAME>: received, validated (<public detail>) -->

---

## Log: Lane A (Brain)

### 2026-11-06 19:25 IST · A · v2 step 1 (tools + live run)
- did: `continue` / `checkpoint` / `checkout` over MCP (v1 tools hidden in production, `continue` prompt, v2 server instructions); one Arkiv write per checkpoint (tasks, notes, file versions, checkpoint last, keys predicted); website API for the demo brain (`/api/brains`, summary, checkpoints, tasks + add, files + content/versions, notes; file contents never in lists or SSE); `/healthz` CORS (C's request); live harness `pnpm e2e:continue`
- proof: run mw51a6ng through the public tunnel, 13/13 checks: Claude's checkpoint (2 tasks, 2 files incl. 31 KB, 1 note) confirmed in 7.6–9.7 s → Gemini's continue shows it, checkout returns Claude's App.tsx, Gemini's checkpoint ticks the task and descends from Claude's commit → Claude's continue shows Gemini's work. Gemini's checkpoint tx https://rabdi.explorer.arkiv.network/tx/0xea7667f777b0b46c3adf7dbb31740052abd496080f051d8d4587fb41b667ad34 (verified with the Arkiv MCP verify_tx: success, block 293644). Server restart: checkpoints (with the app that made each), task status and files rebuilt from Arkiv alone
- result: PASS. Fixed during the run: a note saved inside Claude's commit hid that commit from Gemini's parents (commits now link to commits; notes stay extra parents); old retraction notices repeated in every reply (continue now delivers them once)
- commit: 31b522e + this commit
- next: Kai tests Antigravity (write + "continue") and the Claude phone app on the live server; then step 3
- asks/blockers: none. Done after Kai's go: `sb.scope` of gem-research.supabrain.eth set to "*" (so Antigravity can write src/ files): https://sepolia.etherscan.io/tx/0xa9e72fd88285b62d45dd4db3c6d8f941ff1b742a6530944efe8a1ad01a3baf5d

### 2026-11-06 19:30 IST · A · v2 plan
- did: after the mentor/judge talks, rewrote the plan as "GitHub for your AIs' memory" (docs/PLAN.md) with Kai; wrote the website contract (docs/API_V2.md); logged the decisions; reverted the old UI (f10e981, Kai's call); started step 1 groundwork (types, continuity engine, one-write checkpoints)
- proof: docs/PLAN.md, docs/API_V2.md, docs/DECISIONS.md 2026-11-06 18:00–19:30
- result: PASS (plan agreed)
- commit: (this commit)
- next: step 1 (tools + API), then the Antigravity and phone tests with Kai
- asks/blockers: B starts B1–B6
<!-- newest first; format in CLAUDE.md §3.4 -->

### 2026-11-06 12:56 IST · A · S5 money mount + S4 pairing + demo seed
- did: registered `acme.supabrain.eth` with Lane B's `ens:add-vendor` (vendor-owned resolver; the vendor wallet set its own payout address and `sb.vendor`); `apps/server/src/payments/mount.ts` (Lane B's `createPayments` with the live graph as `GraphView`, the Arkiv store as `ArkivWriter` (team wallet writes `sb.payment`, intents 15 min / decisions 30 d), the event bus; disabled stub + logged reason when it can't start; an agent revoked on Arkiv can't pay; a PAID decision makes the paying agent's wallet write a `payment` memory on the payment's lineage, once); `pay`/`pay_status` MCP tools; `/api/payments`, `/api/approvals` (World link owner-only), `/api/approvals/:id/cancel`; `PROTECTED_PAYEE`; S4 `POST /api/pair` + `GET /api/pair/:code` (QR carries a 10-minute code, never the token) + copy prompt; `pnpm demo:seed` → `config/deployments/demo-seed.json`
- proof: acme on Sepolia: resolver https://sepolia.etherscan.io/tx/0xefc515bb376d9fbfde9b0a957be5d5aa23476e5cfdbc6551c0c5f82de82cda5b · register https://sepolia.etherscan.io/tx/0x25a8962d747350b84d65529cf1c40bd27095552c88285dd17aa5ce939f3659d3 · vendor sets its address https://sepolia.etherscan.io/tx/0x11fd62aef5ba892bd74dbc866ed9f094aa1ec1808693f7e26bc2410b3b533ee4 · `sb.vendor` https://sepolia.etherscan.io/tx/0xf87bd4678c1487e502b1b9b23dbdfadf73b82b591de9b79a64fa061fe8130104 · UR read-back: acme.supabrain.eth → 0xf15f…B5A5. Seed (dev namespace): 9 memories by 4 signers confirmed on Arkiv in 9.6 s. Pairing live: owner pairs gpt-writer → `/connect?code` swap → the paired token's first whoami → `connected` on the public SSE stream
- result: PASS for everything that doesn't need Lane B's keys (363 tests; 12 new for the mount, MCP pay tools, approvals privacy, pairing). `demo:step blocked` reaches the mounted `pay` tool and gets the honest "payments not enabled yet". **P1 BLOCKED / P3 PAID live: waiting for Lane B's five env values on this laptop**
- findings: (1) `whoami` took 6–11 s on a cold cache: the public Sepolia RPC (publicnode) is slow for Universal Resolver reads, and every tool re-checks ENS once the 10 s cache lapses. A dedicated Sepolia RPC (free Alchemy/Infura key) is needed before any live demo; (2) a DNS blip on the laptop took the ngrok tunnel offline for a few seconds; it reconnected by itself (another reason to host on Render before judging)
- commit: 32246da (mount), 7759e82 (pairing), 4ff34c4 (seed)
- next: run P1/P3 live once the keys arrive; then V5/V6 rehearsal, hosting (Render + `api.supabrain.blackslate.me`), README/Arkiv docs
- asks/blockers: Kai: B's five env values; a free Alchemy or Infura Sepolia URL in `SEPOLIA_RPC_URL`

### 2026-11-06 10:59 IST · A · S3 undo (live, without money)
- did: `apps/server/src/memory/undo.ts` (dry run, revoke, Keep, Correct this, Add context), Arkiv writes for revocations (team wallet, `ExpirationTime.max()`), notices (team batch) and Keep (memory + its edge/taint rows in one owner batch, skipping rows that already live longer), notices restored on load, revoked agents blocked from acting, owner API (`/api/dryrun`, `/api/revoke`, `/api/memory/human`, `/api/memory/:key/keep|correct`) behind the admin cookie; `pnpm e2e:undo`
- proof (Rabdi, `supabrain-mumbai26-dev`): revocation by the team wallet https://rabdi.explorer.arkiv.network/tx/0xe4cc1f57bc231e6ba23208228c7494645d69f514f37014c45204e3ed25983cd7 · Keep (2 rows) https://rabdi.explorer.arkiv.network/tx/0xd284a81d14cc2af7edfac0636c6efad80bc52ab6e65b58ac887097deda3f41f9
- result: PASS. Unit/integration: 98 server tests (the C-UI fixture story written through the real service: dry run = exactly E1 M1 M2 M3 E2, agents/vendors/readers as the fixture, vault root hash = keccak256(id) as Lane B's `revokeRoot`; revoke order; notices; payments skipped while disabled; Keep refused when quarantined and capped at 30 days; Correct supersedes). Live `pnpm e2e:undo` 14/14: owner logs in → human context → the lie spreads email → Gemini → Claude → GPT → dry run "3 memories · 3 agents · 3 vendors" → revoke on Arkiv in 5.7 s → cascade (human memory stays active) → the dashboard stream gets `revocation` + a `notice` per agent → Claude's next recall starts with RETRACTION NOTICES and flags QUARANTINED items → a quarantined memory can't be cited → Keep refused for it, allowed for the human memory → Correct this. Restart: 12 memories, 2 revocations, statuses, the correction, the Keep and both notices all came back from Arkiv alone
- findings: stateless MCP accepts `tools/call` without `initialize` (handy for health checks); after a restart, notices come back unread (read state is not stored on Arkiv; acceptable, they expire in 2 days)
- commit: S3 code + tests, e2e:undo (see git log)
- next: S4 pairing (`/api/pair`, QR, snippets, `connected`), S5 mount Lane B's payments + PROTECTED_PAYEE + acme, then the demo seed
- asks/blockers: Kai: the Antigravity write check (S2 gate) and, when the UI exists, one rehearsal through the dashboard (S3 gate)

### 2026-11-06 10:50 IST · A · S2 memory core (live) + Lane B review fixes
- did: `apps/server` engine (`engine/graph.ts` quarantine/lineage/descendants, `lineage.ts` trust rules + ref/source/folder/scope validation, `session.ts` read-sets/read log/notices, `search.ts` recall); `memory/service.ts` (whoami/recall/remember/explain/check_notices, live ENS check on every call incl. recall, folder scope, cites, max parents, optimistic writes → `confirmed` / `write_failed`); `arkiv/store.ts` (one agent-signed batch per memory: memory + edges + taints, all handed to the team wallet, chunked within the gas rule; loader verifies `$creator` = the named agent's wallet; watcher filtered to our wallets); `memory/sync.ts` (watcher first, then load; restart on watcher errors; expiry ticker); dashboard API + SSE + admin cookie + CORS; `index.ts` boots Sepolia + Rabdi (fail closed), checks agent keys vs ENS wallets, rebuilds from Arkiv; `pnpm e2e:memory` (real MCP calls as 3 agents); `pnpm dev:public` (server + ngrok, inspection off). Fixed Lane B's MCP review F1–F3 + D4; D1 and D3 done
- proof (Rabdi, namespace `supabrain-mumbai26-dev`): Gemini evidence https://rabdi.explorer.arkiv.network/tx/0xa1b3b441cf69690db82428d647ade4e64323446e0bdcfcc10b11019f809669c2 · Claude plan on it https://rabdi.explorer.arkiv.network/tx/0x9d1b46d6d8800204dc57623283a105cfd9da4074d45acb272d710841fe63e64a · GPT draft on that https://rabdi.explorer.arkiv.network/tx/0xaabe7cbd20954394df3971f7484b35e02bcae47295649f4d3690f7f44830a089 · a real Claude Code session (haiku) via MCP: whoami → recall → explain → remember; it reported "Acme's wallet rests only on an outside email (trust 1, root email:…)" and saved a decision https://rabdi.explorer.arkiv.network/tx/0x943d953910933da145b875df541fd91b7d10ce2cc4c9eaa3a86eb7da141ed839
- result: PASS. Tests: 341 workspace (86 server: engine incl. the C-UI fixture revoke invariant, service authority rules, sync, API, MCP end to end, Lane B review). Live `pnpm e2e:memory` 11/11 (whoami ×3, lineage across 3 vendors, trust = min, roots carried, scope refusal, all writes confirmed on Arkiv ~6 s after the last write, explain, read log). Restart test: a fresh process rebuilt all memories + edges from Arkiv alone (1.4–1.6 s). Watcher test: a second server instance wrote 3 memories; the first picked them up from Arkiv events and streamed 3 `memory` SSE events over the public URL. Tool latency: recall/explain ~10 ms, remember ~250 ms (optimistic), whoami ~0.5 s (ENS cached) to ~5 s (cold, public Sepolia RPC); a write lands on Arkiv in 4.5–5.7 s (6 ops, 0.36–0.50M gas)
- findings: (1) a memory naming one agent but signed by another wallet is now rejected on load (`$creator` check), so a stolen key cannot write "as" another agent; (2) the Arkiv gas rule caps one tx at ~34 ops, so writes with many parents/roots are split into batches (memory first) and implicit parents are capped at 12 (`readSet.maxParents`; the agent is asked to cite); (3) Lane B's review tests were written against the old `createApp` signature and would have "failed" for the wrong reason (503); harness updated before fixing; (4) `pkill -f` patterns can match the calling shell (exit 144): use anchored `pgrep` patterns
- commit: 4b26aa2 (engine), add67e4 (service/store/API), b5d0d05 (bootstrap + e2e), 6a9234f (review fixes)
- next: S3 undo (dry run, revoke, quarantine cascade, notices, Keep, Correct this, Add context); then S4 pairing, S5 mount payments + acme
- asks/blockers: Kai: run the Antigravity write check (command in the session report) to close the S2 gate "Claude Code + Antigravity write to one graph"

### 2026-11-06 10:12 IST · A · S1 MCP spike (all pass criteria)
- did: stateless MCP endpoint in `apps/server` (`POST /mcp` Bearer, `POST /mcp/t/:token` path token; new McpServer + transport per request, SDK 1.32.2); HMAC agent tokens (tests first: tampering, wrong secret, expiry, unknown agent, malformed); 401 + `WWW-Authenticate`; Host allowlist from `PUBLIC_BASE_URL`; 405 for GET/DELETE; MCP returns 503 unless a token secret and ENS are configured; `whoami` reads the live `EnsAuthority` and fails closed; `pnpm mcp:token <agent>` prints per-client snippets; Sepolia chain setup moved into `packages/ens`; `docs/ARCHITECTURE.md` written. Funded the guardian 0.01 ETH for Lane B https://sepolia.etherscan.io/tx/0x9ec1a367d37b1eb72465dc5ddb2e09ea7362d6edcba1a67d07e2447273a12e11
- proof: public URL https://swear-commend-everybody.ngrok-free.dev (laptop + ngrok static domain). Server log: Claude Code `claude-code/2.1.294` → `tools/call whoami` 200 (real headless Claude answer: lead-claude.supabrain.eth, lead, active); Claude.ai `Anthropic/ClaudeAI/1.0.0` via path token → `whoami` 200 in 630 ms (Kai's screenshot); Antigravity `antigravity-client/v1.0.0` (Gemini 3.8 Flash) → `whoami` 200 in 602 ms (gem-research.supabrain.eth, worker, research); missing/bad token → 401 on both routes over the public URL
- result: PASS. Client quirks: (1) all three speak protocol `2025-11-25` and first probe `server/discover`, which SDK 1.32.2 answers 400; each then falls back to `initialize` cleanly (no action needed; revisit if we upgrade the SDK); (2) Claude.ai cannot send headers, so the path token is required; it connects from Anthropic's servers as three clients (`Anthropic/1.0.0` setup check, `Anthropic/Toolbox`, `Anthropic/ClaudeAI`) and ngrok's free browser warning page did not interfere; (3) Claude Code shows the model the tool's structured output rather than the text line, so both must carry the facts; (4) Antigravity sends `notifications/roots/list_changed` and saved the tool schema to a local `whoami.json` before calling; (5) Antigravity's global config is `~/.gemini/config/mcp_config.json` with `serverUrl` (not `httpUrl`) and does not expand env variables; (6) first `whoami` in a burst took ~5 s (live ENS reads over public Sepolia RPC), later ones ~0.6 s (10 s cache). Fix: a dedicated Sepolia RPC before demo day. Infra: the default ngrok config on this laptop belongs to another account, so the project uses its own `~/.config/ngrok/supabrain.yml` (token in `.env.local` as `NGROK_AUTHTOKEN`)
- commit: fafbe3a (endpoint), this commit (docs)
- next: S2 memory core (recall/remember/explain, lineage + trust, Arkiv writes per call, startup rebuild + watcher, SSE, `/api/team` `/api/graph` `/api/memory/:key`)
- asks/blockers: before hosting: a Render account and a free Alchemy/Infura Sepolia key (not blocking S2)

### 2026-11-06 09:19 IST · A · S1 Arkiv spike (all pass criteria)
- did: new `packages/arkiv` (6 `sb.*` schemas, guarded writer, per-signer queue, body codec; 34 tests written first); `scripts/arkiv/spike.ts` (dry run by default, `--yes` to broadcast, `--only sN`), `query.ts`, `revert-probe.ts`; Rabdi spike under the separate app `supabrain-mumbai26-spike`
- proof (Rabdi 7794095): **one tx create + handover** `$creator` gem-research ≠ `$owner` team https://rabdi.explorer.arkiv.network/tx/0xbb26837a9202ef13184f19dd96e54d84ea5fd7353979723dafa51a0ebc023626 · lineage: evidence ×2 + taint ×2 (8 ops, 670k gas) https://rabdi.explorer.arkiv.network/tx/0x377cc7c1b00297829f90026c9e6d3cba8cf134015b56b8990ab651d263e0304e, then memory + 2 edges + 2 taints (10 ops, 742k gas) https://rabdi.explorer.arkiv.network/tx/0x2eebd1878ee1b2076b20e8fec0b49559fcc2b4238c71d0c998f1294fe8c8ee34 · **owner extends a READONLY entity** https://rabdi.explorer.arkiv.network/tx/0x43923a1001afe178a39f2511e4d4ce1f26f826d3efb845266e6d7457724f23bb (expiry block 361622 → 577802) · **Keep** (memory + 2 edges + 2 taints, one batch) https://rabdi.explorer.arkiv.network/tx/0x3853419d2c1adc070e93d22b373402e5764291557e6790c4a70bd77ef3f81224 · watcher target https://rabdi.explorer.arkiv.network/tx/0x51ec0cefa28d7811b4ce21d81e3be035300de59d9b48b66ed11710f09b8ead62 · 60 s memory https://rabdi.explorer.arkiv.network/tx/0x73c0ea659ab06f5bd2130b04c2d8859fd517ca00a0f72600a18e9fd35b58df98 · all keys and metrics in `config/deployments/arkiv.rabdi.json`; cross-checked with the Arkiv MCP `verify_tx` / `verify_entity` (creator, owner, `readonly:true`, expiry)
- result: PASS. Answers: (1) `changeOwnership` works in the SAME batch as the create, so no second tx; (2) the owner CAN extend a `readonly` entity (Arkiv's question), so no fallback: memories stay readonly; (3) negative controls refused by the live chain and named: creator extends after handover `NotOwner`, owner patches `ReadOnlyEntity`, owner shortens `ExpiryNotExtended`, creator reclaims `NotOwner`; (4) queries (340 to 810 ms): `app+team+folder`, `taint.root = X` (exactly the revoke set), `edge.parent = X`, `createdBy`/`ownedBy`, typed `trust = 1`; (5) watcher fires, ~11 s after submit, and is chain-wide; (6) expiry is exact (60 s memory gone at its expiry block, no event emitted, so the server emits `expired`); (7) cost ~75 to 110k gas/op, ~0.0007 tGLM per remember at 1 gwei, write 4.5 to 7.7 s (receipt polling 4 s → 1 s fixed)
- findings: SDK reserves attribute names (`by`, `key`, …), so `sb.revocation.by` is `revokedBy`; the SDK's public-client type hides viem actions (two clients); registry `eth_getCode` is empty (verify by simulating); a catch-all SDK error hid our guard's message (fixed with `findCause`); full list in `arkiv/friction.md`
- commit: see git log (`feat(arkiv): …`)
- next: S1 MCP spike (public host). Server wiring of Arkiv (startup rebuild, watcher, writers) is S2
- asks/blockers: S1 MCP needs a public host: Render (likely) or ngrok static domain, then `PUBLIC_BASE_URL`

### 2026-11-06 08:28 IST · A · S1 ENS / steps 3–7 (register → registry → agents → proofs → kill → reads)
- did: registered `supabrain.eth`; deployed + attached the team UserRegistry; created the 3 agents (own resolver, `sb.*` records, setter grant for `sb.memory.head` only, zero-role entry, 7-day lease); proved the agent boundary with the agent's own key; proved the kill switch on a throwaway; built the real `EnsAuthority` (tests first) and verified it live; scripts `ens:register-team|deploy-registry|add-agent|prove|unregister|set-records|status|verify`
- proof (Sepolia): register team https://sepolia.etherscan.io/tx/0x3f363dcb95354fe9aad5fcfaf81ae8c2f29b648bf1f69b70cd9988f75012d780 · registry deploy https://sepolia.etherscan.io/tx/0x956b6394f6e2f000f92553a16c90d8e6c7aca9fc132fd498d4feaef5c18ec2f7 · setSubregistry https://sepolia.etherscan.io/tx/0x9b5311fb…4549 · gem-research resolver https://sepolia.etherscan.io/tx/0xafb80af59904e3577d12fa36af590ede933f5b91171c54b63c5a0865d1b491b8, register https://sepolia.etherscan.io/tx/0xa5dff4507edbaba49e6723e82ed28450dd3aee00ba32380a592ce11a80ed38e9 · all hashes in `config/deployments/ens.sepolia.json`
- **demo proofs**: agent sets `sb.memory.head` https://sepolia.etherscan.io/tx/0xb5099e2a35ea59028b453c4a1d9c11ff409bf3da52a1a3f81d6f279dcad5604a · agent tries to raise its own `sb.pay.cap` → REVERTED `EACUnauthorizedAccountRoles(role 16 = SET_TEXT)` https://sepolia.etherscan.io/tx/0x022aeeca40dc4dd9b97933c1785103e50806463ce2ff1143fb320d17367f3bde · agent tries to transfer its name → REVERTED `TransferUnsafeUntilRegistryIsEmancipated` https://sepolia.etherscan.io/tx/0xa4d3b7fc76072e44d8cc3314dbb8b37ec1e9649bf1f3bb12682ffcc16145dd57 · kill switch on throwaway `test-agent`: first unregister https://sepolia.etherscan.io/tx/0x444058d439c7b13f820b6d0d15af582e6bdfb2cc2f9ef41da5bc4787be7eb050 (the deployment file holds the latest kill, https://sepolia.etherscan.io/tx/0x0c8bfc8f2035110aa09b8db9b20fb0010c043363e14c13c3169fddce728276f0) → `getOwner = 0x0`, name resolves to `null`; re-register + kill again verified (revive works for rehearsals)
- result: PASS (all S1 ENS pass criteria). Findings: (1) after `unregister` the agent could STILL write to its orphaned resolver until its grant is revoked, so `ens:unregister` also revokes the grant; (2) the transfer revert is the registry-level guard (our registry is intentionally not emancipated: the owner keeps unregister/set-resolver), not `TransferDisallowed`; the agent also holds 0 roles on its name (verified); (3) a plain ETH transfer to a brand-new account needs ~207k gas on Sepolia (never hard-code 21000); (4) the public Sepolia RPC is load-balanced: right after a mined tx a node can return stale state / "no data" / a stale nonce, so the tx runner tracks nonces locally, pins post-check reads to the mined block and retries
- commit: cff14b9
- next: S1 Arkiv spike (batch write, `$creator` ≠ `$owner`, queries, watcher, extend-on-readonly), then S1 MCP spike
- asks/blockers: none

### 2026-11-06 07:55 IST · A · S1 / funding
- did: set `ARKIV_ACCESS_KEY` (validated: Rabdi eth_chainId 7794095 via path auth); added `pnpm fund` (dry run by default); moved 0.01 ETH lead-claude → gem-research and acme on Sepolia; moved 3 tGLM lead-claude → gem-research and gpt-writer on Rabdi
- proof: Sepolia gem-research https://sepolia.etherscan.io/tx/0x123b2528f0fb207496560e342a7aef1710494b42efac4e7f5ea51271ebb5f6c5 · acme https://sepolia.etherscan.io/tx/0x81cea6d38775317dd2ee64649d407caf9b35fac6da1b9c3d9cd077769c5949bf · Rabdi https://rabdi.explorer.arkiv.network/tx/0x33fcdae7a917fdf0f84b1f7a90560d0b2072b2c817293d8429f96e9c1c9d2bd7
- result: PASS after one FAIL. First attempt used a hard-coded 21000 gas; both transfers reverted (status 0, only ~756k wei of gas lost). Sending to a brand-new empty account needs ~207k gas on Sepolia now (node estimate). Fix: `fund` uses `estimateGas` + 25%. Failed txs: 0x0f3669a0…d2e0, 0x5c7cf937…56bc
- commit: 144aac9
- next: S1 step 3 `register-team.ts` (owner has 0.05 ETH)
- asks/blockers: none for ENS. Note for Lane B: any plain value transfer to a fresh address needs ~207k gas on Sepolia, so never hard-code 21000

### 2026-11-06 04:52 IST · A · S1 ENS / steps 1–2 (keys, verify-deployments)
- did: generated dev keys into `.env.local` (owner, team, 3 agents, acme vendor; Kai OK'd it); filled `config/ens.sepolia.json` (13 contracts, commit 07e55a05, from the live deployments page); pinned ABIs in `packages/ens/src/abis`; `pnpm run ens:verify` checks code, registry wiring, registrar and label availability; chose team label `supabrain` (AVAILABLE)
- proof: `pnpm run ens:verify` → all 13 addresses have code · `RootRegistry.getSubregistry("eth") == ETHRegistry` · `rentPriceOracle == StandardRentPriceOracle` · MockUSDC 6 decimals. MIN_COMMITMENT_AGE 60 s, MIN_REGISTER_DURATION 28 d
- result: PASS (steps 1–2). Step 3 (register team) waits on funding
- commit: 6bf386a
- next: S1 step 3 `register-team.ts` (needs owner Sepolia ETH; mints MockUSDC itself)
- asks/blockers: fund with Sepolia ETH: owner, 3 agents, acme. Arkiv: tGLM for team + 3 agents, and `ARKIV_ACCESS_KEY`. Public addresses: `pnpm run doctor`

### 2026-11-06 04:42 IST · A · S0 / scaffold
- did: pnpm workspace (apps/server, apps/web shell, packages/{shared,ens,payments}, scripts, contracts/), zod config loader + §6 types/interfaces verbatim + fakes, config seeded with source/verifiedAt, guards (lint:hardcode, check:secrets, doctor) + pre-commit hook, server `/healthz` with `createPaymentsDisabled()`, skeleton docs, MIT, `.env.example`
- proof: fresh clone → `pnpm i --frozen-lockfile && pnpm build && pnpm test` (25/25) `&& pnpm lint:hardcode` all green; `pnpm run doctor` checked Rabdi `eth_chainId` live = 7794095; USDC address verified on developers.circle.com
- result: PASS
- commit: 1f0390c
- next: S1 ENS step 1 (`pnpm keys:new`, after the ASK)
- asks/blockers: team ENS label, SEPOLIA_RPC_URL, OWNER_PRIVATE_KEY (testnet burner), OK to generate keys. Tooling: installed the Arkiv plugin 0.5.4 (Mumbai MCP connected) and the Context7 MCP

## Log: Lane B (Money & Security)

### 2026-11-07 01:17 IST · B · ENS rulebook: sb.guard and sb.deny on chain for otter and maple
- did:
  - Added two ENS rules, enforced on every call:
    - **`sb.guard`:** the attacks an AI may not pass on (instruction-override, remote-code, payment-redirect, secret-exfiltration, rule-tampering, agent-to-agent-command). Absent or `*` means all of them (fail closed). A check the owner removes is saved but flagged "allowed by sb.guard".
    - **`sb.deny`:** paths it may never write, even inside its scope.
  - Wrote `sb.guard = *` and `sb.deny = .github/,scripts/` to the six AIs on `otter` and `maple`: one multicall each from the team wallet, read back from ENS.
  - Live check: gemini.maple (scope `*`) writing `.github/workflows/deploy.yml` → refused **DENIED · sb.deny** (nothing written).
- proof: claude.otter https://sepolia.etherscan.io/tx/0x7f08861ce280636c26625dd8658898bbe33afd746e67a3f68c3327b6223f7397 · gemini.otter https://sepolia.etherscan.io/tx/0xd342ba0d5795a6844d99481c77db0a402b60c4b70ecb99bea687ea56976fbe52 · openai.otter https://sepolia.etherscan.io/tx/0xf85c17fc503d6eb0c3d28f02dc4ace3b81e8af3891a1d2248455faabc25d4c8c · claude.maple https://sepolia.etherscan.io/tx/0x98920502f950d934cc8d3c0ae1435479335377e377a302cd411c40c5f0ad1ec9 · gemini.maple https://sepolia.etherscan.io/tx/0xbbaf0734d5f559ccbb7fad683c7dcbc449bc5bb0058501924e5d6917a8e1851f · openai.maple https://sepolia.etherscan.io/tx/0xde1153beb70cacff2d18f23f31f2f922f07892d0f1d1ee0d37f056b8d7aa3f2c
- result: PASS · commits 77bcf1f, 865f6ef, 007664d, 4325ce5 · 535 tests
- next: rehearse the tour on `otter`
- asks/blockers: none

### 2026-11-06 21:20 IST · B · v2 attack lab API + handoff to the UI Claude
- did:
  - `POST /api/brains/:id/lab/act` lets judges drive continue / checkpoint / checkout **as a brain AI** from the website, through the same code path as MCP (ENS rules, injection guard, Arkiv writes). It's owner-only and capped at 40 checkpoints per 10 minutes per brain. It returns `ok` / `stopped` / `refused` with the rule.
  - Repo audit: nothing to delete. `docs/FRONTEND_V2.md` §12 lists the files the UI Claude must ignore (the 1.8 MB `docs/llms_full.txt`, the v1 briefs and lane plans, chain code).
- proof:
  - 5 lab tests; **523 tests**; typecheck clean (commits ff2b02c, c101a0a, 07e9a6f).
  - Live, read-only, on `maple`: lab `continue` as gemini → `ok` ("you are gemini.maple.supabrain.eth"); `/rules` live from ENS (3 AIs active, scope `*`, 200 a day); `/registry` 10 brains; `/graph` 10 nodes / 8 edges from Arkiv.
- result: PASS. The backend is ready for the frontend build
- next: the UI Claude builds from `docs/FRONTEND_V2.md`. For judging, run `SUPABRAIN_APP_NAMESPACE=supabrain-mumbai26 SUPABRAIN_BRAIN=otter`
- asks/blockers: hosting (a public URL) is needed before judges can connect their own AIs

### 2026-11-06 21:09 IST · B · v2 live: the two-AI injection scene on `maple.supabrain.eth` (`pnpm demo:injection`)
- did: brain-mode server for `maple`. Two real MCP clients act as `claude.maple` (claude-code) and `gemini.maple` (antigravity). **10/10 checks:**
  1. Claude commits.
  2. The owner narrows Gemini's ENS `sb.scope` to `docs/` through the website API (team key pays).
  3. Gemini continues and sees Claude's work.
  4. Gemini relays a poisoned README → **STOPPED** (`instruction-override`, saved as evidence, revoked on Arkiv at once).
  5. Gemini's write to `.github/workflows/deploy.yml` → **refused by ENS `sb.scope`**.
  6. Claude's next `continue` doesn't contain the injected text.
  7. `/blocked` lists both.
  8. Claude's commit becomes its ENS head (`sb.memory.head` = its Arkiv key).
  9. The scope is restored.
- proof:
  - scope → docs/ https://sepolia.etherscan.io/tx/0x9e7e2478e18db18c8591e296b4c4c108203d281cb5db2e9d71f035f61ee7bfb4
  - stop revocation (team-signed, Arkiv) https://rabdi.explorer.arkiv.network/tx/0x988dc29cdcb3a21520630ea19863428c4703f0a4bcab1390865a80b188eff303
  - Claude's commit `0x893b34c5…9329`, signed by `claude.maple`'s wallet `0xBA73…E046`: https://rabdi.explorer.arkiv.network/tx/0x2d918737a2b8bc30d4f6d87a3fc05658143d9ac705bf8cabf2629446265bc83d
  - ENS head https://sepolia.etherscan.io/tx/0xac4d4de888b9236c0c65b36caae3c231e6a6d3906359474d1d1f78a78cf5e5b1
  - scope restored https://sepolia.etherscan.io/tx/0x80f329e021e690e0d2861d87f407852bd1d4d00737fe77450f1c06851fc0e97d
- result: PASS on the second run. **Three bugs were found live and fixed test-first:**
  - **(a)** `sb.scope = "docs/"` would also have refused files under `docs/` (trailing slash). The first run's message showed `docs//`.
  - **(b)** One transient ENS read failure right after the rule tx made Gemini's `continue` fail closed (`AUTHORITY_UNKNOWN`). ENS reads now retry twice before failing closed.
  - **(c)** Gemini's ENS head was published as its **stopped** checkpoint, because Arkiv confirmed the write while the revocation was still being written. Stopped commits are now marked first and the publisher re-checks.
  - `gemini.maple`'s `sb.memory.head` still points at that stopped test checkpoint (`0xa2bd4532…`); its next clean commit replaces it.
  - Commits 3f5e636, 3929f9a; 518 tests.
- next: the UI (`docs/FRONTEND_V2.md`); demo on `otter`; the server runs locally in brain mode for `maple`
- asks/blockers: none

### 2026-11-06 21:00 IST · B · v2 steps 3–4 backend (taking over Lane A while Kai's laptop is down)
- did:
  - **ENS rules on every call:** `sb.status` paused, `sb.scope`, `sb.write.daily` (new `RATE_LIMIT`). Every refusal is logged with the rule named and streamed as `blocked`.
  - **Prompt-injection Stop:** relayed instructions (override, remote code, payment redirect, secret leak, rule tampering, agent-to-agent command) are saved as evidence and revoked at once on Arkiv by the team wallet.
  - **Brain mode** `SUPABRAIN_BRAIN=<label>`: serves a pre-made brain from its own ENSv2 subname registry, with the AIs signing through derived wallets.
  - **ENS heads:** `sb.memory.head` = the newest confirmed commit's Arkiv key.
  - **New API:** `/api/registry`, rules GET/POST (both forms), `/blocked`, `/review`, `/heads`, healthz `mode`.
  - `pnpm demo:injection`, the live judge scene.
  - `docs/research/supermemory-v2.md` (fresh research: they now sell cross-agent memory too, so our edge is accountability), `docs/FRONTEND_V2.md` (the UI brief) and `docs/design/supabrain-night.html` (the visual reference), plus the SPONSORS v2 rows and the API_V2 contract updated.
- proof: tests first; **514 tests** green, typecheck clean. Commits f61577b, 3032d19, 7f2db9b, 9c19e7b. The server is running in brain mode for `maple` (`/healthz` → `mode: brain, ens: maple.supabrain.eth`)
- result: PASS (unit + local). The live scene was not run: it broadcasts (ENS rule txs and a head tx from the team wallet, a team-signed Arkiv revocation), so it waits for Srijit's go
- next: `SUPABRAIN_BRAIN=maple pnpm demo:injection` on go; then demo on `otter`
- asks/blockers: go for the live scene

### 2026-11-06 20:12 IST · B · v2 B2: all 30 brain AI wallets funded on Rabdi
- did: the faucet claim (10 tGLM) went to the funder burner `0x49bE9ddD1e2eacE2662a0B5ffEA86a605287c910`. `pnpm brains:fund --only otter,maple,comet --yes` (9 transfers; balances re-read: 0.33 each), then `pnpm brains:fund --yes` for the other 21. Every AI wallet holds **0.33 tGLM** (≈ 195 writes of 20 KB or ~600 of 6 KB; the target moved from 0.35 so one claim funds all 30, see DECISIONS). The funder has 0.099 tGLM left. Each transfer's hash is recorded per AI in `config/deployments/brains.sepolia.json` (`funding`), with the sizing in `fundingPlan`. No team or server wallet sent anything on Rabdi
- proof: e.g. claude.otter https://rabdi.explorer.arkiv.network/tx/0x2109a1455eec8d59b98b0bab144b234a82a532f2c7290d0491d373ff420c4d2a · gemini.otter https://rabdi.explorer.arkiv.network/tx/0x435fab06ebad099c99b05c0e098f0add19158f43b71265967efaff195b9e6f08 · openai.tundra https://rabdi.explorer.arkiv.network/tx/0x01ba7bf1a7e1469cefc9289caa731639d39d8adffcc31c200b2e8cd4eb822cb9 (all 30 in the json)
- result: PASS
- next: top up with `pnpm brains:fund` when a wallet falls below half (0.165)
- asks/blockers: none

### 2026-11-06 20:05 IST · B · v2 B1: all 10 brains live on ENSv2 Sepolia
- did: the 9-brain run mined 94 of 99 txs. `tundra`'s gemini memory-head grant **reverted** (out of gas): right after its resolver was deployed, a lagging load-balanced RPC node simulated against pre-deploy state and estimated 38k instead of 258k. Fix: every provisioning step now uses a fixed gas limit above measured use (Sepolia gas is cheap; under-gassing is the risk), and `--only tundra --yes` resumed the last 5 steps. The 7 tundra txs from the failed run were added to the record from the run log. `pnpm ens:brains-status`: **✓ 10 brains, 30 AI names** (owner = derived wallet, no roles, addr and rules via the Universal Resolver, the team may set text, the AI may set only `sb.memory.head`, leases until 2026-11-20)
- proof: registries otter `0x8158BC6a0005950b942B33303930823Cb25d1866`, maple `0x7e2dfaC4Cb7fDaB38722FF7FD526a966248d547C`, comet `0x9330D6E20b9Cc1A2823D1DAAf1F4EEfF8f1f1d1b`, cedar `0x3d7C3c9CD6A16E5F197FfE3743C3af1289Bf0A68`, ember `0x86430d4849318c7d683C81211Ae822efc607b7a2`, fjord `0x99eaA2E91349cEBC1069d49ae2626E5fCfb53a5B`, heron `0x87524c693E209F46511B1DCD5aF70eBCF9B7E577`, lotus `0x161Cf9Ebd587989efA71140dcEa61B8263e0aCFE`, prism `0x6206e593c88237559094737C5D3c6229054E30F7`, tundra `0xb7fCD3f7FB1982D02A8a9B7689333832A8fb7d2A` · the failed grant https://sepolia.etherscan.io/tx/0xd44e3b47f579c6ddddd8d6466ad6cac561011cd67ae8aaefa1d9a26a4cea4d36 and its retry https://sepolia.etherscan.io/tx/0xab418f558779c88f73b10741b715a13738cc8bc5910b5f0a5ada2f176bd8f492 · every hash is in `config/deployments/brains.sepolia.json`: 111 txs in total, 110 succeeded and 1 reverted then retried (commit 0f87d66's message says 115; 111 is correct)
- result: PASS · commit 0f87d66. Owner spent ≈ 0.000000006 ETH; it holds 0.035 ETH (0.005 went to the team wallet)
- next: Lane A reads `readBrainsDeployment()`
- asks/blockers: none

### 2026-11-06 19:44 IST · B · v2 B2 (funder burner created; faucet needs a human)
- did: generated the burner `FUNDER_PRIVATE_KEY` straight into `.env.local` (not printed): funder **`0x49bE9ddD1e2eacE2662a0B5ffEA86a605287c910`**. It is not the team wallet or any server wallet (`pnpm brains:fund` refuses those). Opened https://hub.arkiv.network/faucet: a claim needs a **connected browser wallet** (one claim per wallet per cooldown), which the built-in browser doesn't have, and Claude doesn't import private keys into wallets. Fixed `pnpm brains:fund` to estimate each transfer's gas (see the Sepolia note in the next entry)
- result: BLOCKED on a human faucet claim
- next: once the funder holds ≥ 3.2 tGLM, `pnpm brains:fund --only otter,maple,comet` (dry run), then `--yes`
- asks/blockers: Srijit claims tGLM at the faucet (own wallet, then send to the funder; or import the burner)

### 2026-11-06 19:42 IST · B · v2 B3 live: rules writer on `openai.otter.supabrain.eth`
- did: `pnpm ens:brain-rules openai.otter.supabrain.eth --status paused --scope docs/ --write-daily 50 --yes` (one multicall from the team wallet), then back to `active`, `*`, `200`. Each run read the rules back pinned to its receipt block
- proof: pause https://sepolia.etherscan.io/tx/0x5f46ebed967c245c01388ec60059a7d060f5e17f10ac425d00128c6be06a58c6 · restore https://sepolia.etherscan.io/tx/0x4bdc5a011a67788b266973929327e6f5ac1b0ddf6a7a31056ed55a1f57183fc6
- result: PASS. **Finding:** a fresh process reading right after the restore saw `status=paused` but the new `scope=*` (one multicall set both). That's a lagging load-balanced RPC node answering one call; three later reads all showed `active`. Within one writer instance, reads wait for the writer's own last receipt block, so the server should read rules through the same `createRulesWriter` instance it writes with (or pin to that block)
- next: Lane A wires `setRules` into the website's Rules form
- asks/blockers: none

### 2026-11-06 19:40 IST · B · v2 B1: `otter.supabrain.eth` on ENSv2 Sepolia (1 of 10)
- did: `pnpm ens:provision-brains --only otter --yes`: 11 owner txs, all mined, post-check green. `pnpm ens:brains-status`: ✓ otter #1. Its registry `0x8158BC6a0005950b942B33303930823Cb25d1866` is held by the team wallet (renew only) until 2026-11-20. Names, wallets and resolvers:
  - `claude.otter.supabrain.eth` → `0xBBCc4a88A2603Cc6F9848D6411ad7B88FE38DA34` (resolver `0xd9cFb3A77AE50BC090Cd8986d7b90137e3d714e9`)
  - `gemini.otter.supabrain.eth` → `0xA109Da4214220d9253Ef7d9A8cf902EE2952D085` (resolver `0x45dcbD9755d51747416aB52287aA7Eb6520e69Ca`)
  - `openai.otter.supabrain.eth` → `0xdA6A769494c0DB9a86F13ff9c911c8312bBc6Cd6` (resolver `0x917ecFFE3426B4bB143a899debb18548c4CCfc71`)
  - rules read through the Universal Resolver: status active, role lead/worker/worker, scope `*`, 200 writes a day
- proof: registry https://sepolia.etherscan.io/tx/0x885287f91ba748ecee1c37eac9987598ea25afc829bf9804d9d8aa09789a3eee · brain name https://sepolia.etherscan.io/tx/0x5eb44da8f63ab4bc1cfaa7398ba1862c19402fbc4d99712a7c6486feea4f5a03 · claude resolver / grant / name https://sepolia.etherscan.io/tx/0x0eb637156f311b2b125042d655e65286df0c1547e78be9ca8b7fbf7a96aec91f https://sepolia.etherscan.io/tx/0xb578844c2a1766ba4734bd07cf7c2a5c3a8fb646ff75a74bb5c990c5d97829d4 https://sepolia.etherscan.io/tx/0xa4bb48ad2c34edfcfb4e555704f2d3bd2a78100db35c389573002ef268055cbd · all 11 hashes are in `config/deployments/brains.sepolia.json`
- result: PASS · commit 8a7e721
- next: the other 9 brains
- asks/blockers: none

### 2026-11-06 19:36 IST · B · v2: team wallet funded on Sepolia (for rule changes)
- did: 0.005 ETH from owner to team `0x4eA717986244B28B8af633f698FdDf8308D35A56`. The first try **reverted**: 21,000 gas isn't enough on Sepolia now for a value transfer that creates an account (the team wallet had nonce 0 and balance 0). The estimate was 207,391 and the retry used 204,600. Cost of the failed try ≈ 0 ETH
- proof: failed https://sepolia.etherscan.io/tx/0xa6e58e81db5663f15ddebe71e73b80d0b5fd898888a722350694467c2c9f0cd9 · ok https://sepolia.etherscan.io/tx/0x04bd3df98aa8e2ca836e005adde99394558b01c1be943709247c69090584b7e0
- result: PASS (second try). The team wallet holds 0.005 ETH
- next: B1
- asks/blockers: none

### 2026-11-06 19:27 IST · B · v2 B6
- did: `SECURITY.md` §0 "v2 MVP: brains": sponsored gas, server-held derived AI wallets (one mnemonic, single point of failure, said plainly), the server key's exact ENS rights per brain, owner key offline as recovery, rules enforced per call (fail closed), private brains (encrypted against public readers, not against the operator; metadata public), Stop and review notices (heuristic), separate Rabdi funder
- result: PASS (doc)
- next: update when Lane A lands private brains and Stop
- asks/blockers: none

### 2026-11-06 19:27 IST · B · v2 B2 (measured; funding waits for the funder key)
- did: `pnpm brains:write-cost` (read-only): 23 real Rabdi write receipts fit gasUsed ≈ 52k + 77.5 gas per input byte at a flat 1 gwei. A 6 KB write ≈ 0.0005 tGLM, 20 KB ≈ 0.0016, 128 KB ≈ 0.010. Sized **0.35 tGLM per AI wallet** (200 writes of 20 KB plus one max-size write's upfront gas) = **10.5 tGLM for 30 wallets** (`config/brains.json` funding). `pnpm brains:fund` (dry run by default) tops each derived wallet up from `FUNDER_PRIVATE_KEY`, refuses a wallet the server uses on Rabdi, and records each transfer in `brains.sepolia.json`
- result: PASS (measurement). Funding not sent
- next: fund after B1 is on chain
- asks/blockers: **ASK FUNDER_PRIVATE_KEY**: a separate faucet-funded Rabdi wallet with ≥ 10.6 tGLM (or fund fewer brains with `--only`)

### 2026-11-06 19:27 IST · B · v2 B3 (code + unit tests; live test waits for B1 and team ETH)
- did: `packages/ens/src/rules.ts` `createRulesWriter({ keys, parentName, txUrl, account, chain })` → `setRules(aiEns, { status?, scope?, writeDaily?, role? })` and `readRules(aiEns)`. It validates input, refuses names outside `supabrain.eth`, finds the resolver live through the Universal Resolver (none → `NO_RESOLVER`, nothing sent), reads current values and writes only changed keys in **one** `multicall` of `setText(dnsName, key, value)`, waits for the receipt (reverted → `REVERTED` with the URL) and returns `{ txHash, txUrl, changed }`. Writes from one writer are serialised; reads after a write wait for that block. CLI: `pnpm ens:brain-rules <ai-ens> [--status …] [--yes]` (dry run by default; read-only smoke test against `gem-research.supabrain.eth` OK)
- proof: 22 tests in `packages/ens/src/rules.test.ts` (written first, failed, then green); commits 6a22064, 493c4cb
- result: PASS (unit). Live test pending
- next: `pnpm ens:brain-rules openai.otter.supabrain.eth --status paused --yes`, then back to active
- asks/blockers: the team wallet has **0 Sepolia ETH**, and rule changes are signed by it. Asking for a "go" to send it 0.005 ETH from the owner

### 2026-11-06 19:27 IST · B · v2 B1 (code + dry run; broadcast waits for "go")
- did: `config/brains.json` (10 brains, indexes 1–10, lease 14 d, default records), `packages/ens/src/brains.ts` (schemas, derivation, records, role bitmaps), `packages/ens/src/brains-chain.ts` (`checkBrainOnChain`), `pnpm ens:provision-brains` (dry run by default, `--yes`, `--only`, idempotent, `--init-mnemonic`), `pnpm ens:brains-status` (read-only). `BRAIN_AGENT_MNEMONIC` generated with viem into `.env.local` (not printed; name added to `.env.example`). Dry run: **110 owner txs** (per brain: registry deploy, brain registration, and per AI a resolver deploy, a memory-head grant and a registration), ~127M gas, **~0.0000000046 ETH** at 2× today's Sepolia gas price (owner holds 0.04 ETH; at 0.3 gwei it would still fit). Every step that can run before earlier ones simulated OK, including registering the brain name to the team wallet with renew only (742k gas)
- proof: 13 tests in `packages/ens/src/brains.test.ts` (written first); commits 566084f, c923a93
- result: PASS (dry run). Nothing broadcast
- next: on "go": `--only otter` first (11 txs), `ens:brains-status`, then the other 9 brains
- asks/blockers: **go** for the broadcast; Srijit shares `BRAIN_AGENT_MNEMONIC` with Kai privately

### 2026-11-06 21:30 IST · B · Docs / project reference + pitch story
- did: `docs/PROJECT_REFERENCE.md`, the full current reference for the UI build (product, demo beats mapped to API/SSE/UI, concepts incl. `dispute`, MCP tools, payment reasons + approval card, every dashboard route with shapes, SSE handling, local run + namespaces, deployments + proof links, repo map, rules, open requests, honest limits). Plain-English pitch story with 8 illustrated chapters, sponsor cards, rival table, proof links and judge Q&A published as https://claude.ai/artifact/Y97gb3sEWrZegkKAgfEYU5
- proof: shapes checked against `apps/server/src/api/routes.ts`, `pair.ts`, `memory/undo.ts`, `mcp/server.ts`, `packages/shared/src/types.ts`
- result: PASS
- next: UI session reads the reference first; seed the judging namespace within 2 days of judging
- asks/blockers: none
<!-- newest first -->

### 2026-11-06 IST · B · Supermemory review → upgrades (research + decision + review + critique agents)
- did: Kartik Talwar (ETHGlobal) suggested looking at Supermemory. A research agent wrote `docs/research/supermemory.md`, and decision, review and critique agents produced `docs/research/supermemory-plan.md`. Built, tests first: (1) policy matches payee addresses stated in vendor-tagged memory text (ENS block + honest lineage fix); (2) **Disputed by ENS** flag, computed on read, in recall/remember text and `/api/graph`/`/api/memory/:key`; (3) `arkiv/why-arkiv.md` + `arkiv/reach.md` with live counts (`pnpm arkiv:reach`); (4) public `pnpm verify:memory <key>` (Arkiv + ENS only); (5) comparison in PROJECT.md §9, SPONSORS rows, QA rows C1–C3
- proof: 416 workspace tests; every new rule mutation-checked. Live on `-b`: `/api/graph` after a rebuild shows E1, M1 disputed (ENS 0xf15f… vs claimed 0xf892…); `verify:memory` M3 → 5/5 hops verified against ENS getOwner, 4 revoked; `arkiv:reach` 67 (-dev) + 38 (-b) live entities across 4 signers
- result: PASS
- commit: bd216d9, 83cacbb, a468301, 9f3b609, 2465911, 7ddd36b, 499db76, 512683a, 820cd48, this commit
- next: C renders the dispute chip + updates DEMO_SCRIPT; seed the judging namespace within 2 days
- asks/blockers: Request to C above

### 2026-11-06 IST · B · QA M2 live re-check (P1 after the graph.walk fix)
- did: `pnpm demo:step blocked` (go) against the restarted server on the fixed code (namespace supabrain-mumbai26-b, seed file found by namespace)
- proof: `/api/graph` before and after the payment: 7 edges, M1 ← E1, M2 ← H1/M1 (the first run lost 3 edges here). Decision BLOCKED [ENS_MISMATCH, QUARANTINED_LINEAGE, OUTSIDE_CONTENT_PAYEE, NEW_PAYEE, OVER_CAP], path M2 → M1 → E1 (= fixture; it was E1 → M1). Arkiv https://rabdi.explorer.arkiv.network/tx/0x39ba19e484b0ed7cf2a0ee502f5e38d91deae998bfc0a5bd136efed9c16fdd62 · `/api/payments` lists it plus the 4 reloaded decisions
- result: PASS
- commit: (this entry)
- next: Kai pulls and reviews; seed the judging namespace within 2 days of judging
- asks/blockers: none

### 2026-11-06 IST · B · QA cycle: plan, research, fixes for A's open items (Srijit's instruction)
- did: wrote `docs/QA_PLAN.md` (scope, entry/exit, P0 matrix, risks, rehearsal runbook). Researched open B → A requests, `it.fails`, and in-place mutations across the server. Fixed, tests first: (1) `MemoryGraph.walk` drained a node's parents (+ the graph now hands out and stores its own array copies); (2) payment history after a restart: `MemoryStore.loadPayments()` (Arkiv `sb.payment` by the team wallet, one per intent, final beats pending), merged in `payments/mount.ts` under the live engine; a stale pending approval shows as expired; (3) demo seed per namespace, `demo-seed.<namespace>.json`; `demo:step` reads the file for the server's `/healthz` namespace (Kai's -dev file moved unchanged, B's -b rehearsal file added). D2 token binding: accepted with a mitigation (matches A's DECISIONS entry)
- proof: 383 vitest (0 expected-fail) · typecheck 7/7 · forge 47 + fork 4/4 live · guards clean · each fix mutation-checked · live smoke after restart: "loaded 4 payment decisions", `/api/payments` = cancelled, denied, paid (0x7b98…7528), blocked; `/api/graph` 10 nodes / 7 edges, statuses correct
- result: PASS
- commit: 63b8e43, d5299ce, b7e449b, 606f216, cc60d66, 0a80472, this commit
- next: Kai pulls and reviews (A-owned files changed); the demo namespace seeds fresh within 2 days of judging
- asks/blockers: none

### 2026-11-06 IST · B · S5/S6 / PROTECTED_PAYEE + docs with live evidence
- did: tests first (6 failing), then `policy.ts` blocks team-controlled payees + the zero address with `{ code: "PROTECTED_PAYEE", label }` (A's S5 type), `mcp-tools.ts` explains it; mutation-checked (guard off → 5 fail). SECURITY.md (T14 code, live-proof block, restart gap), SPONSORS.md (World checklist: Sepolia protected action ✓, deny/cancel live; Vault rows: revokeRoot + on-chain RootRevoked + P3 PAID), WORLD_DEBRIEF.md (live status, paths table, timeline); all policy.ts refs recomputed from anchors. Ticked S2/S3/S4/S5/S6 Lane B items and both S5/S6 gates
- proof: 372 workspace tests + 2 expected-fail (A's graph.walk repro); commits 6773eee (tests), c7f6f5e (fix), this commit (docs)
- result: PASS
- next: A fixes `MemoryGraph.walk` (flip the two it.fails); `loadPayments` request
- asks/blockers: Requests to A above

### 2026-11-06 IST · B · S6 live / deny, cancel, revoke-vs-vault on chain
- did: (a) deny (go): pending `pay(acme, 5)` → Srijit rejected in World App → DENIED. (b) cancel (go): pending `pay(acme, 5)` → owner `POST /api/approvals/:id/cancel` (204) → CANCELLED. (c) revoke vs vault (go): `pnpm vault:pay-proof lead-claude <acme> 1 --root email:acme-0611 --expect-revert RootRevoked --yes`: a VALID policy-signed attestation carrying the revoked root, sent by lead-claude with fixed gas
- proof: deny: sb.payment pending https://rabdi.explorer.arkiv.network/tx/0x3ddae41b347072fd56d87283b5090d096e1478de2ba02e99075829f26cbc2172 → denied https://rabdi.explorer.arkiv.network/tx/0xc272dd7fa0e51ad5ea40c64a06cb1255bc70ad7f4546c2a8dc0c8e8708a8aa39. Cancel: pending https://rabdi.explorer.arkiv.network/tx/0xcc479fb6226e36efbe57a939401e7d943524837db276d7bbfa7bffee49b1c17e → cancelled https://rabdi.explorer.arkiv.network/tx/0x926cd6ffe99f47e3efc53db12ad2debf94e39cb32864ad5d2cc46afa8eba1128. **On-chain refusal: mined revert `RootRevoked(0xcc13…f7fc)`** https://sepolia.etherscan.io/tx/0x7e589a3ce39efbf3bb0f964c6f13a1cfc3d852a29e7b0a337c9521e77a70ddd4. Vault stayed at 4 USDC through all three; `/api/payments`: cancelled, denied, paid
- result: PASS (expired path: unit tests only; a live expiry was not waited out)
- commit: a7bd503 (pay-proof flags) + this entry
- next: PROTECTED_PAYEE switch (test first), docs with live evidence
- asks/blockers: none

### 2026-11-06 IST · B · S5/S6 live / revoke → P3 World-approved → PAID
- did: owner login; `POST /api/dryrun` email:acme-0611 → E1 M1 M2 M3 E2 M5 · 3 agents · 3 vendors · readers gem-research, lead-claude. `POST /api/revoke` (go) → cascade exactly those 6 (H1 H2 M4 stay active), notices to all 3 agents, vault `revokedRoot(keccak("email:acme-0611")) = true`. `pnpm demo:step approve` (go): lead-claude got the retraction notice, `pay(acme.supabrain.eth, 5)` → PENDING HUMAN (OVER_CAP) → Srijit approved in World App → PAID
- proof: Arkiv revocation https://rabdi.explorer.arkiv.network/tx/0x6933acedc8f959aa3cde69e9620e8bdb26e039389e05315524990b7305bd78ae · vault revokeRoot https://sepolia.etherscan.io/tx/0x7083d77c6266ac8afb64021d1899eb1ac7f6dd94298fafcff8153659fd983137 · **P3 PAID** https://sepolia.etherscan.io/tx/0x7b983ad5aafadce22a1fdd98da09a3710be64be673f96c39602c5663de517528 (Paid event: agent lead-claude, payee 0xf15f…B5A5 = acme ENS, 5 USDC, humanApproved=true, roots=[H1] only, email root absent) · sb.payment pending https://rabdi.explorer.arkiv.network/tx/0xa7e41fc8a50ad59bc0dec851cc3b78ff0bff75a5f8ec5180a60bcc5d2caca152 → paid https://rabdi.explorer.arkiv.network/tx/0xa16166ae16892e3ea2bea0ffb1a18f34e756e4ef20e30c43120aeb72290adb12 · 85 s pending → paid · vault 9 → 4 USDC · `payment` memory by lead-claude in /api/graph
- result: PASS
- commit: (this entry)
- next: deny path, cancel path, revoke-vs-vault on-chain refusal
- asks/blockers: `/api/payments` forgets decisions made before a server restart (engine keeps intents in memory; they are on Arkiv) → Request

### 2026-11-06 IST · B · S5 live / local server, seed, P1 BLOCKED
- did: /start (pull, `pnpm i`, 372 tests green, doctor: no hard failures, vault 9 USDC, guardian 0.01 ETH). `.env.local`: `SUPABRAIN_APP_NAMESPACE=supabrain-mumbai26-b`, `PUBLIC_BASE_URL` off. Waited for Kai's server to stop (his /healthz went from JSON to ngrok offline). Local server: "rebuilt from Arkiv (supabrain-mumbai26-b/team1): 0 memories", "payments enabled". `pnpm demo:seed` (go): 9 memories confirmed on Arkiv in 6.0 s; graph trust/lineage = fixture. `pnpm demo:step blocked` (go)
- proof: P1 → **BLOCKED** [ENS_MISMATCH (0xf892…Ff6c vs acme.supabrain.eth = 0xf15f…B5A5), OUTSIDE_CONTENT_PAYEE (email:acme-0611), NEW_PAYEE, OVER_CAP]; `GET /api/payments` shows it; Arkiv sb.payment by the team wallet: https://rabdi.explorer.arkiv.network/tx/0xe5783a4e5849d5c1588c791f776cfaa29c1ba389c841ba29a045a7b540e2a11a
- result: PASS for money. **FAIL found (Lane A): pay wipes lineage in memory.** After P1, `/api/graph` edges 6 → 3 (M1 ← E1, M2 ← H1/M1 gone); Arkiv fine (restart rebuilt all 6). Root cause: `MemoryGraph.walk` uses the start node's live `parents` array as its BFS queue, so `ancestors()` drains it. Repro tests (it.fails): `apps/server/src/engine/graph-walk.repro.test.ts`, `apps/server/src/payments/lineage-repro.test.ts`; the one-line fix makes both pass (verified locally, reverted: A owns graph.ts). Money stays correct (quarantine + attestation roots key on `roots`)
- commit: (this entry)
- next: revoke email:acme-0611 (owner API) → P3 approve in World App
- asks/blockers: Request to A (below)

### 2026-11-06 IST · B · S5 / acme.supabrain.eth vendor name
- did: received the full env from Kai (merged names only into `.env.local`, no conflicts). `pnpm ens:add-vendor acme` dry run found acme **already set up** with the add-vendor flow (on chain ~1 h earlier, deployment file not committed). Re-verified on chain read-only, recovered the 4 tx hashes from logs, recorded `vendors.acme` in `config/deployments/ens.sepolia.json` (via `updateEnsDeployment`, schema-validated). No new transactions
- proof: deploy resolver https://sepolia.etherscan.io/tx/0xefc515bb376d9fbfde9b0a957be5d5aa23476e5cfdbc6551c0c5f82de82cda5b (owner) · register https://sepolia.etherscan.io/tx/0x25a8962d747350b84d65529cf1c40bd27095552c88285dd17aa5ce939f3659d3 (owner) · setAddr https://sepolia.etherscan.io/tx/0x11fd62aef5ba892bd74dbc866ed9f094aa1ec1808693f7e26bc2410b3b533ee4 (**acme wallet**) · sb.vendor https://sepolia.etherscan.io/tx/0xf87bd4678c1487e502b1b9b23dbdfadf73b82b591de9b79a64fa061fe8130104 (**acme wallet**). Checks: getOwner = acme wallet, no roles on the name, resolver roles vendor-only (team owner can't set addr or text), UR addr = acme wallet, sb.vendor "Acme Studio", `findVendorEns` = acme.supabrain.eth; `pnpm ens:status`: `acme.supabrain.eth → 0xf15f…B5A5`
- result: PASS
- commit: (this entry)
- next: live P1/P3 via `pnpm demo:step blocked|approve` once A mounts `registerPaymentTools` + `createPayments`
- asks/blockers: none for acme. Kai: please push config changes after on-chain runs, so two people don't both run the scripts

### 2026-11-06 IST · B · S5 / add-vendor script, demo fallbacks, PROJECT.md
- did: (a) `scripts/ens/add-vendor.ts` (`pnpm ens:add-vendor acme`): owner deploys a resolver whose roles go to the vendor wallet only, registers `acme.<team>.eth` to the vendor with no roles on the name; the vendor wallet itself sets addr(60) + `sb.vendor`; post-checks incl. `EnsAuthority.findVendorEns` → writes `vendors.acme`. Not broadcast yet: needs VENDOR_ACME_PRIVATE_KEY. (b) `registerPaymentTools` (MCP `pay` / `pay_status`) in `packages/payments/src/mcp-tools.ts` for A to mount; `pnpm demo:step blocked|approve` drives those tools on the running server as the lead agent (same createPayments path). (c) PROJECT.md World text → IDKit 4 / Human-in-the-loop, real proofs, action = intent hash
- proof: 6 demo-step tests over an in-process MCP server (P1 blocked with path, P3 pending → approve → paid with humanApproved, deny, unauthenticated refused); 281 workspace tests + 3 expected-fail review findings
- result: PASS (code); live runs wait on the acme key and A's S5 mount
- commit: 86ebb37 (add-vendor), e9bdbba (tests), 1b54d66 (tools + steps), this commit (PROJECT.md)
- next: `pnpm ens:add-vendor acme` dry run → ASK go → broadcast → `pnpm ens:status`
- asks/blockers: ASK VENDOR_ACME_PRIVATE_KEY (Kai, privately); vendor wallet needs a little Sepolia ETH for its 2 txs. RPC key: needs a human to create the Alchemy/Infura account

### 2026-11-06 IST · B · S4 / MCP token design security review
- did: reviewed `apps/server/src/auth/tokens.ts`, `pairing.ts`, `mcp/auth.ts`, `routes.ts`, `server.ts`, `app.ts`, `index.ts`, `scripts/keys/mcp-token.ts`. Probed URL variants against a live in-process server. Verified OK: HMAC-SHA256 v1 prefix, constant-time compare, inclusive expiry, unknown agent, label/size limits, secret ≥32 at startup, 401 without echo, Host allowlist, 503 when unconfigured, fail-closed whoami
- proof: 3 confirmed findings as `it.fails` tests in `apps/server/src/mcp/security-review.test.ts` (each fails today for the stated reason): **F1 high** path token logged in clear for `/MCP/T/<token>` (case-insensitive routing vs lowercase redaction); **F2 medium** malformed JSON → HTML stack trace with local paths, unauthenticated; **F3 low** log-line forging via `clientInfo`. Plus design notes D1–D4. SECURITY.md §7 rewritten
- result: PASS (review done; fixes are A's)
- commit: (this entry)
- next: `scripts/ens/add-vendor.ts` (acme), needs VENDOR_ACME_PRIVATE_KEY from Kai
- asks/blockers: Requests to A below

### 2026-11-06 IST · B · S8 / V3 policy red team
- did: hunted for inputs that get a bad payment ALLOWED. Found 3: R1 payee = an agent's own server-held wallet (or its ENS name), R2 payee = vault / token / zero address (both allowed after one approval + a clean memory), R3 concurrent payments jointly beat the ENS daily limit (8 × 4 USDC passed a 30 USDC limit). Wrote 7 failing tests first, then fixed: team-controlled addresses + zero are hard-blocked (built from the ENS deployment, vault, USDC, policy signer, guardian; owner stays payable), evaluate→execute serialised per agent
- proof: 7 tests failed for the right reason before (outcome `allow`, 8 paid), pass after; each fix mutation-checked (removing it fails its test); 260 workspace tests green; SECURITY.md T14/T15 + §2.1, all doc file:line refs recomputed from anchors
- result: PASS
- commit: b228947 (failing tests), 1c8ae65 (fix), 1f48ba2 (docs)
- next: Lane B docs done; remaining B work waits on A's S5 server mount (live P1/P3 from a real MCP client) and C's approval card
- asks/blockers: Request to A: a dedicated `PayReason` code for team-controlled payees would read better than `AGENT_NOT_AUTHORIZED` (shared types change)

### 2026-11-06 IST · B · S8 / WORLD_DEBRIEF.md final
- did: restructured to the spec (summary, time to first success ≈2 h incl. OIDC dead end / ≈25 min from RP registration, flow, backend validation, denied/expired/cancelled/failed paths with code + proof, timeline, friction by product, missing capability, single most important improvement); removed an overclaim (Sepolia approve → paid is pending the server mount; proven on anvil)
- proof: cited lines checked at 7540d6e
- result: PASS
- commit: 7540d6e
- next: V3 policy red team (failing tests first, then fixes)
- asks/blockers: video timestamp later (C)

### 2026-11-06 IST · B · S8 / SPONSORS.md World + Vault rows
- did: World section (what breaks, 6 feature rows with file:line, live run results, §6.3 checklist with open items stated) and an "ENS × money: BrainVault" subsection under ENS (on-chain getOwner kill, set-agents, ENS caps, mismatch block, fork test, deployment) with Sepolia tx proof
- proof: each cited line checked against the code at fdf684b
- result: PASS
- commit: fdf684b
- next: WORLD_DEBRIEF.md
- asks/blockers: Request to A/C: PROJECT.md §6.3 and §10 still describe the OIDC device flow and "mocked World proofs"; both are now wrong

### 2026-11-06 IST · B · S8 / SECURITY.md
- did: `SECURITY.md`: assets, 13 threats → controls with file:line, key custody (who holds what, can / can't), bounded worst case (34 test USDC/day, 2x across UTC midnight), vault check order, Binance lessons without overclaiming, known gaps, pending pairing-token review checklist, reporting
- proof: every cited line spot-checked against the code at this commit
- result: PASS
- commit: cbb5549
- next: World + Vault rows in SPONSORS.md
- asks/blockers: none (guardian funded: 0.01 ETH ✓)

### 2026-11-06 IST · B · S2 / on-chain kill proven (step-kill)
- did: `pnpm demo:step-kill gem-research --yes --revive` after the ASK go. Signed a valid 1-USDC attestation while registered (simulated ok) → Lane A's `ens:unregister` → the same pay sent from gem-research's own wallet with fixed gas → mined revert → `ens:add-agent` revive
- proof: unregister https://sepolia.etherscan.io/tx/0xe89f464acea50e816ca326308f0d3c5206eb9cb43ea6c92daa343adb9e126fc7 · grant revoked https://sepolia.etherscan.io/tx/0x33abd6ef77cb9a881f6c368ee71f7ac736dffb88eff538e2e1ebaea905147190 · **pay reverted `AgentNotRegistered()`** https://sepolia.etherscan.io/tx/0x516b96da3c4df023563178a2a2f71cb6d351b48abcc945d8d09d3380d53e4579 · revive grant https://sepolia.etherscan.io/tx/0x76cc00f796d76eaab792569d29b43f2d1b7d37f7cf104fb396dcb70dee24720d · re-register https://sepolia.etherscan.io/tx/0x65b618fc1e80cb73f8537d854cb2d540d8f9ce239b0fc02156c2e0ed710adf0e · vault status after: gem-research getOwner = wallet ✓
- result: PASS (S2 gate: paid tx + AgentNotRegistered revert tx logged)
- commit: c8fd46d (script) + this entry (`ens.sepolia.json` updated by Lane A's scripts)
- next: guardian ETH; mount `createPayments` (A) → P1 blocked / P3 World-approved paid from a real MCP client
- asks/blockers: guardian 0x2782…4D51 still 0 ETH (revokeRoot/pauseAgent can't broadcast)

### 2026-11-06 IST · B · S2 / first real vault payment
- did: `pnpm vault:pay-proof lead-claude <owner> 1 --yes` after the ASK go: policy-signer attestation + lead-claude's own key → `BrainVault.pay`
- proof: https://sepolia.etherscan.io/tx/0x9ab200485f3fbf0c5f39a832d9c19a00e31cfaab0b04d1d52009f6c7f2a806ae · vault 10 → 9 USDC · lead-claude spentToday 1 · live ENS getOwner = wallet ✓
- result: PASS
- next: `scripts/demo/step-kill.ts` (gem-research: pay ok → owner unregisters → pay reverts AgentNotRegistered on chain)
- asks/blockers: guardian 0 ETH

### 2026-11-06 IST · B · S2 / vault funded
- did: `pnpm vault:fund 10 --yes` after the ASK go (owner → vault, Circle test USDC from the faucet)
- proof: https://sepolia.etherscan.io/tx/0x79be7f8eef5000b6c36cd92a4bc8a83e476faf44a44de34bc3e667991f7f327b
- result: PASS
- next: 1-USDC `vault:pay-proof lead-claude <owner> 1` (dry run simulated ok)
- asks/blockers: guardian 0 ETH

### 2026-11-06 IST · B · S2 / set-agents on Sepolia
- did: `pnpm vault:set-agents --yes` after the ASK go (owner key)
- proof: lead-claude ceiling 30 https://sepolia.etherscan.io/tx/0x399031897064938351af533681476bf3d561f09f490d2e75f5cc6c604bf40134 · gem-research ceiling 4 https://sepolia.etherscan.io/tx/0x7eebf371aec9def3753d1242e6dce7b7f223ce8bc66d57ef6cb636b9e38def24 · gpt-writer ceiling 0 https://sepolia.etherscan.io/tx/0xd591128b699d740aa0eb77bf58e311648a231279ac37ad5cd2fa08f350035798 · `vault:status`: all three set, live ENS `getOwner` = wallet ✓
- result: PASS
- commit: (this entry)
- next: fund the vault (owner needs test USDC), 1-USDC `vault:pay-proof`, then `step-kill` with gem-research
- asks/blockers: owner 0 USDC (faucet.circle.com → 0xFcf0…E198); guardian 0x2782…4D51 0 ETH

### 2026-11-06 08:43 IST · B · S2 / BrainVault deployed on Sepolia
- did: `pnpm vault:deploy --yes` after the ASK go. Dry run first caught a gas limit above the EIP-7825 per-tx cap (Sepolia estimates ~15.5M gas for 11 KB init code; +25% would be rejected) → fixed to +5% capped (9091655)
- proof: tx https://sepolia.etherscan.io/tx/0x782509e09202ec6d2b59a0457e5083abf7717483b51e3ab85ffdb1432a04f25e · vault https://sepolia.etherscan.io/address/0x2da794b8dd00afc970b372d7cf960ecd1f190ec8 · token/owner/guardian/policySigner/MAX_ROOTS read back from chain = plan
- result: PASS
- commit: 7c1429e (`config/deployments/vault.sepolia.json`)
- next: `vault:set-agents --yes` (3 txs, dry run simulated ok) → fund → 1-USDC pay-proof → step-kill
- asks/blockers: guardian 0x2782…4D51 has 0 ETH; owner has 0 USDC (faucet.circle.com)

### 2026-11-06 IST · B · S2 / fork test + vault scripts
- did: `contracts/test/BrainVaultFork.t.sol` (real `supabrain.eth` UserRegistry + Circle USDC from config, skips without RPC); `scripts/vault/{deploy,set-agents,fund,status,pay-proof}.ts` (dry run by default, `--yes` broadcasts, deploy reads every immutable back before writing `vault.sepolia.json`); `pnpm vault:*` scripts; cited root memories now add their own root (uses A's `GraphView.get`)
- proof: fork 4/4 on live Sepolia (getOwner = wallet for all 3 agents; lead-claude pays; test-agent → AgentNotRegistered; impostor → AgentNotRegistered); forge 47 + 4 fork; 216 workspace tests green
- result: PASS
- commit: e4fcbf5, 99106fc
- next: Sepolia deploy → set-agents → fund → 1-USDC pay-proof → step-kill (gem-research)
- asks/blockers: ASK SEPOLIA_RPC_URL, OWNER_PRIVATE_KEY (shared burner, from Kai privately), AGENT_LEAD_CLAUDE_PRIVATE_KEY + AGENT_GEM_RESEARCH_PRIVATE_KEY, Sepolia ETH for guardian, test USDC

### 2026-11-06 IST · B · S5 / createPayments + pending-human
- did: `engine.ts` (policy → intent snapshot → World approval bound to `intentHash` → live hard re-check → fresh attestation → vault pay → Arkiv + SSE; deny/expire/cancel/fail → nothing moves; `onRevoke` cancels intents whose supporting lineage is hit, guardian `revokeRoot`/`pauseAgent`, vault errors returned as data); `runtime.ts` + real `createPayments` (config + env, fail-closed chain checks: chainId, code, USDC decimals, on-chain policySigner)
- proof: 30 engine tests; 12 engine mutants: 11 caught, the 12th (a duplicate guard) is covered by its twin; a mutant exposed a cancel-during-vault-call race → fixed (in-flight payments can't be cancelled). Anvil e2e through the engine: allow → paid, over cap → approved → paid, `Paid` event `humanApproved=true`. 194 workspace tests green
- result: PASS
- commit: 00caf00 (tests), 26d47f0, 30a54e6
- next: `scripts/vault/deploy` + `set-agents` + fork test against the real `supabrain.eth` registry, then the Sepolia deploy (ASK go) and a 1-USDC pay
- asks/blockers: need `SEPOLIA_RPC_URL`, `POLICY_SIGNER_PRIVATE_KEY`, `GUARDIAN_PRIVATE_KEY`, the lead agent key, test USDC; A: mount `createPayments` (Request)

### 2026-11-06 IST · B · S5 / attestation + vault client
- did: EIP-712 policy-signer attestation + `intentHash` (`packages/payments/src/vault/attestation.ts`); generated ABI (`scripts/vault/gen-abi.sh`); typed `createVaultClient` (simulate-then-write, revert names, per-signer serialisation)
- proof: TS signer reproduces the cast-signed vector from `BrainVaultReview.t.sol` byte for byte; anvil integration deploys the real compiled vault (throwaway keys): pay ✓, Replay, BadAttestation, RootRevoked, cancelIntent, AgentNotRegistered after unregister ✓; 163 workspace tests green
- result: PASS
- commit: 874ca18 (tests), f59b6b9, 1973e38
- next: `createPayments` (intent snapshot → World approval → live hard re-check → attestation → vault pay → Arkiv decision + SSE), `onRevoke`, `pauseAgent`
- asks/blockers: none yet (Sepolia deploy needs A's `ens.sepolia.json` + an ASK "go")

### 2026-11-06 IST · B · S5 / decidePayment policy
- did: `packages/payments/src/policy.ts`: agent authority from live ENS (fail closed), payee resolution, ENS-mismatch hard block (also for ENS-named payees, stricter than spec), quarantined lineage, outside-content/new/unknown payee, cap + daily from ENS records, attestation roots (sorted, deduped, quarantined excluded, only memories supporting this exact address), root overflow → error, offending `path`
- proof: 39 table tests (P1/P2/P3 + V3 red team), 147 workspace tests green; 11 of 11 rule mutants caught (2 survived the first pass and got new tests)
- result: PASS
- commit: 202d16e (tests), 30f99b8 (feat)
- next: intents + EIP-712 attestation signer + vault client, then `createPayments` with the pending-human flow
- asks/blockers: GraphView.get (Request to A)

### 2026-11-06 08:01 IST · B · S1 / S4 World spike LIVE
- did: registered the relying party (RP ID in env; signer key generated locally, only its address given to the portal). Live runs against production World App: `any(proof_of_human, selfie)` → `feature_unavailable`; Orb only + legacy → APPROVED ×3 (111 s, 85 s, 99 s), reject → DENIED `verification_rejected` (46 s), `--cancel-after 45` → CANCELLED
- proof: spike output (redacted: credential, nullifier prefix); every approval passed the local checks + `/api/v4/verify/{rp_id}`
- result: PASS
- commit: 85c358a
- next: `decidePayment` policy + table tests; then the pending-human wiring into `createPayments`
- asks/blockers: booth: confirm the prize means this product (Human-in-the-loop / World ID 4)

### 2026-11-06 IST · B · S1 / S4 World: switch to IDKit 4 (Human-in-the-loop)
- did: OIDC route blocked (pasted creds were IDKit app id + portal API key → `invalid_client`; the auth.world.org portal returns `account_not_eligible` for non-enterprise Google). Built World ID 4 approval on `@worldcoin/idkit-core@4.6.0`: per-intent action `supabrain-pay:<intentHash>` signed server-side, signal = intent hash, bridge polled from Node, local checks (action, nonce, env pin, signal_hash, credential) then `/api/v4/verify/{rp_id}`, one-time `(action, nullifier)`. OIDC kept as `world:oidc-spike`
- proof: 46 new tests (83 in payments, 108 workspace); mutants on the action/signal/replay checks each caught; live probe: `IDKit.request` + `pollOnce` from plain Node → `waiting_for_connection` (throwaway key, staging)
- result: PASS (code); live approve/deny pending
- commit: 1abe309 (tests), e46d944 (feat)
- next: live approve + deny + cancel once `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_SIGNING_KEY` are in .env.local; then `decidePayment`
- asks/blockers: ASK WORLD_RP_ID + WORLD_SIGNING_KEY (Developer Portal → app, "Enable World ID 4.0" if shown). Booth: which product the prize means

### 2026-11-06 IST · B · S1 / S4 World spike (client, tests, live discovery)
- did: World device-flow client in `packages/payments/src/world/` (discovery, client_secret_basic start/poll, RFC 8628 interval + slow_down, 503 keep-waiting, 429 terminal, cancel, local expiry); backend `id_token` validation with jose (iss, aud, exp, sig, auth_time freshness, one-time jti, optional enrolled sub); `config/world.json`; `world:spike` script; WORLD_DEBRIEF.md started
- proof: vitest 37 World tests pass (62 workspace total); live `world:spike -- --discover` → issuer auth.world.org, device endpoint /api/v1/device_authorization, token /api/v1/token, RS256; sandbox issuer discovery also advertises the device grant
- result: PASS (discovery) · approve/deny/expire live still to do
- commit: 1b58ae5, c137a77, ca97c0f, 52c950e
- next: live approve + deny + cancel once credentials are in .env.local; then decidePayment table tests
- asks/blockers: ASK WORLD_CLIENT_ID / WORLD_CLIENT_SECRET (auth.world.org/portal or sandbox portal) + booth answer on prod vs sandbox issuer + HTTPS redirect URI (ngrok domain). Note: vitest 5 needs Node ≥22 (repo engines say so); Node 20 crashes its failure reporter

### 2026-11-06 IST · B · S1 / S5 vault (mock registry) + V1 review
- did: Foundry in `contracts/` (pinned deps via `install-deps.sh`, lib/ gitignored); `BrainVault.sol` written test-first against a mock ENSv2 registry; V1 adversarial review; fixed L-2 (remove+re-add reset), L-3 (two-step ownership), L-4 (`cancelIntent`), I-4/I-6; documented 2x-at-UTC-midnight worst case (L-1)
- proof: `forge test` → 47 passed, 0 failed (incl. 512-run ceiling fuzz, cast-signed EIP-712 vector); ENSv2 `getOwner(uint256)` returns 0 when `block.timestamp >= expiry` (contracts-v2 07e55a05, verified in source)
- result: PASS
- commit: 6ef9e01, bae2df6, 33f9e9c, 34f9228
- next: S1 World device-flow spike (needs WORLD_CLIENT_ID/SECRET + issuer); then vault deploy script once config/ + `ens.sepolia.json` land
- asks/blockers: none for this step. Deploy needs SEPOLIA_RPC_URL, POLICY_SIGNER/GUARDIAN keys, A's `ens.sepolia.json`

## Log: Lane C (Face)

### 2026-11-07 00:53 IST · C · v4 live check: an owner send in Try it, in the browser
- did: signed in as the owner in the browser pane. On `maple`: Try it → Gemini → Attacks → **Poisoned README** → Send as Gemini. Gates 1–2 passed and the flow stopped at **Content: STOPPED · INJECTION** ("Tries to override the next AI's instructions") with the real excerpt and the Arkiv revocation link. **What Claude reads now** ran a real `continue` as Claude: **✓ NOT RECEIVED**. Live updated on its own (4 injections stopped; a new red stop on Gemini's lane). The refusal log was saved to `.data/blocked-*.json`. Fixed: the result box's body inherited the red/green text colour
- result: PASS
- next: rehearse the tour on `otter`
- asks/blockers: none

### 2026-11-07 00:13 IST · C · v4 redesign (docs/UI_REDESIGN_PROMPT.md) + real-time pipeline
- did:
  - **Pipeline:** `/api/stream` sends a named `ping` every 10 s and the store runs a watchdog that reconnects with `?since` when pings stop. The refusal log is persisted (`.data/`), so the counts survive restarts. A recent-change map means the graph animates only what just changed.
  - **IA:** Story / Live / Try it, a More menu for the utilities, Present mode, 18px body and nothing under 13px.
  - **Live:** a headline with three live numbers; a full-width graph (lanes as sticky headers with an ENS-rules popover, one line per commit, red captions for stops and blocks, a thick "continue" curve, the HEAD ring, keyboard); a 560px side panel; the log as a bottom drawer; Insights below.
  - **Try it:** a three-step flow with an editable preset or your own words and four gates that settle on the server's answer; a rules side sheet (writing → Sepolia tx → read-back); a ticker of real MCP traffic.
  - The landing is four screens after the hero; Why ENS / Why Arkiv moved to `/verify`. The tour is a bottom presenter bar. `docs/DEMO_SCRIPT.md` is updated.
- proof: 524 tests; `pnpm --filter @supabrain/web build` OK; `lint:hardcode` + `check:secrets` (including `.next`) OK. Checked in the browser on a live `maple` server at 1280×800 and 375px (no horizontal scroll, no text under 13px). Commits 9c99d12, 3a29071, 59fdfcd
- result: PASS. **Not verified in the browser:** an owner-only send in the lab, which needs the passphrase typed by a human. Its API path was proven live earlier (`pnpm demo:injection` 10/10)
- next: Srijit signs in on the demo laptop and runs the tour once end to end on `otter`
- asks/blockers: none
<!-- newest first -->

### 2026-11-06 22:05 IST · C · v2 website on the live backend
- did: built `apps/web` for v2 against the live brain-mode server (maple, `supabrain-mumbai26-b`), from `docs/FRONTEND_V2.md` + `docs/FRONTEND_CONTENT.md`:
  - `/` landing: hero; live proof strip; evidence cards; MCP/ENS/Arkiv bands; Fig. 4 four gates with live counts; v2 scroll story labelled "example"; why ENS and why Arkiv; FAQ.
  - `/b/[id]` live brain: AI cards (ENS status/scope, writes today vs `sb.write.daily`, HEAD ✓, signer); Fig. 1 commit graph (swimlanes, time ticks, "continue" handoff label, HEAD rings, STOPPED rings, BLOCKED ticks, particles, hover cards, drawer with lineage, files + blame, readers); live log; meters; Figs. 2, 3, 5, 7, 8.
  - `/b/[id]/lab` attack lab: two consoles merging real MCP traffic with lab calls; editable forms; 6 normal + 11 attack presets; live ENS rules strip with write-to-ENS and reset; "what the next AI reads"; outcome callouts rendered only from the API; a live `continue` as the other AI after a stop; `?present=1`.
  - `/b/[id]/rules`, `/history`, `/files`, `/tasks`, `/review`, `/brains` (Fig. 9 registry map), `/verify` (Fig. 6 heads, limits, FAQ), `/connect` (identity first, snippets, Codex from the server's own link, QR, waiting → connected).
  - `?mock=1` replays `fixtures/v2-demo.json` behind the MOCK DATA banner.
- proof: lab driven live through the API as the owner: clean checkpoint → `ok` with key; Gemini continue → `ok` with text; poisoned README → `stopped · instruction-override` with an Arkiv revocation link. Pages checked in the browser at 1440 px and 375 px.
- result: PASS. `next build` (11 routes), `lint:hardcode`, `check:secrets` (includes `.next`) and `pnpm test` (523) all green.
- commit: see the feat(web) commit below this log entry
- next: rehearse on `otter` with two real apps; owner-signed-in lab run in the browser (not done by Claude: the session cookie can't be handed to the browser pane)
- asks/blockers: two C → A requests above (persist `/blocked`; log secret refusals)

### 2026-11-06 16:00 IST · C · S1–S6 screens on real data
- did: built `apps/web` against the live API + SSE (namespace `supabrain-mumbai26-b`): `/t` swimlane lineage graph (one lane per author, one row per memory; focus family, "why" path, blast-radius preview, ~120 ms/hop revoke cascade, DISPUTED BY ENS / QUARANTINED / STALE / EXPIRED / PENDING / KEPT tags in words), list view, agents rail (live ENS caps, AUTHORITY UNKNOWN fail-closed), drawer (lineage, readers, signer, Arkiv proof, Keep 7/30, Correct this, This is wrong → source/memory/agent scope), dry-run/revoke side panel with proof steps, live feed, Add context (with private ref), Before/After (recall log), pitch guide (8 demo beats, each ✓ computed from live data); `/t/payments` (all reasons hard-first, path → "show in graph", World approval card with QR only for the owner, countdown, cancel); `/connect` (pair → snippet + prompt + QR → waits for SSE `connected`); `/t/rules` (ENS records live); `/how` (architecture, life of a memory, 15 judge questions, honest limits); `/` landing ported from the Night reference + live proof strip + 9 threat scenarios + comparison. `?mock=1` replays `fixtures/demo.json` (a snapshot of the live namespace) behind a MOCK DATA banner
- proof: e2f08b9; `next build` 7 routes OK; `lint:hardcode` + `check:secrets` OK; checked in the browser at 1440, 1280 and 375 px, dark + light; dry run → revoke → cascade exercised in `?mock=1` (no Arkiv writes)
- result: PASS (owner actions against the real server not exercised yet: they need the owner passphrase and write to Arkiv)
- commit: e2f08b9
- next: rehearse dry run / revoke / Keep / Correct / pair on the judging namespace after `demo:seed`; DEMO_SCRIPT.md; video
- asks/blockers: C → A `/healthz` CORS (Requests)
