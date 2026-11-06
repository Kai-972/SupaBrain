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
| A: Brain (server, memory, Arkiv, ENS) | Kai | #1 | S1 ENS: steps 1–2 ✅ → step 3 register team | 🔨 in progress | – (all wallets funded, Arkiv key set) |
| C: Face (dashboard, onboarding, demo) | Kai | #2 | S0 (A's scaffold is pushed: pull) | ⏳ | – |
| B: Money & Security (policy, vault, World) | Srijit | #3 | S1 ✅ World live · S5 policy ✅ · attestation + vault client ✅ (anvil). Next: `createPayments` + pending-human | 🔨 | A: S0 scaffold (for `packages/payments`), A: S1 `ens.sepolia.json` (for fork test + deploy) |

Status icons: ⏳ not started · 🔨 in progress · ✅ done · 🛑 blocked · ⚠️ fallback taken

---

## Stage checklist (tick with a proof link or commit hash)

### S0: Scaffold
- [x] A: monorepo, config + zod, types + interfaces, fakes, guards, `.env.example`, MIT, first push (1f0390c)
- [ ] B: pulled; Foundry init; `packages/payments` skeleton builds
- [ ] C: pulled; Next app, tokens, fixture loader, `?mock=1` banner

### S1: Spikes
- [ ] A · S1 ENS: team name + registry · agent + own resolver · `sb.memory.head` ✓ · `sb.pay.cap` revert tx · UR read-back · unregister → null · transfer revert · **handoff `ens.sepolia.json` to B**
- [ ] A · S2 Arkiv: batch ok · `$creator ≠ $owner` · queries ok · **extend-on-readonly result: ___** · watcher fires · friction logged
- [ ] A · S3 MCP: public URL · Claude Code ✓ · Claude.ai ✓ · Antigravity ✓ · bad token 401
- [x] B · S4 World: IDKit 4 live: approve ×3 · deny (`verification_rejected`) · cancel (85c358a; runs logged in WORLD_DEBRIEF.md)
- [x] B · S5 Vault: `forge test` green (mock registry) · 47 passed · V1 review done (0 crit/high/med; L-2/L-3/L-4 fixed) · 34f9228
- [ ] C: static graph with all encodings + list view (screenshot)

### S2: Memory core
- [ ] A: whoami/recall/remember/explain · lineage + trust tests · Arkiv batch writes · startup rebuild · ENS check per call · SSE · `/api/team` `/api/graph` `/api/memory/:key`
- [ ] B: fork test vs the real team registry · V1 review · deployed · 1-USDC pay tx · `step-kill` revert tx · `decidePayment` table tests
- [ ] C: drawer · agents rail · feed · **switched to real graph + SSE**
- [ ] **Gate:** Claude Code + Antigravity write to one graph, live in the UI

### S3: Undo ⭐ (memory-first checkpoint)
- [ ] A: dry run (+ readers) · revoke · quarantine · notices · Keep · Correct this · Add context · refs · recall log
- [ ] B: `onRevoke` (`revokeRoot`, cancel intents) · `pauseAgent`
- [ ] C: dry-run modal · cascade · Keep/Correct/Add context · ref card · before/after
- [ ] **Gate:** one full rehearsal without money (connect → write → dry run → revoke → re-ask)

### S4: Onboarding
- [ ] A: `/api/pair` · snippets · `connected` event · path-token route
- [ ] B: token design security review
- [ ] C: `/t/connect` with QR → green on connect
- [ ] **Gate:** a stranger's AI connects from the QR

### S5: Money
- [ ] A: acme vendor ENS (own resolver) · `EnsAuthority` vendor fns · `GraphView`/`ArkivWriter` · `pay`/`pay_status` mounted
- [ ] B: `createPayments` end to end (policy ✓ 30f99b8 · attestation ✓ f59b6b9 · vault client ✓ 1973e38 · createPayments · pending-human)
- [ ] C: payments page
- [ ] **Gate:** P1 BLOCKED (ENS mismatch) from a real client · paid tx on Etherscan

### S6: Human
- [ ] B: World approve → paid · deny/expire → nothing moved
- [ ] C: approval card
- [ ] **Gate:** both paths live

### S7: Extras (cut order applies)
- [ ] A: ENS watcher · Notion import · public "ETHMumbai brain" · `/api/advisories`
- [ ] B: restore-with-World · enroll owner sub
- [ ] C: rules · advisories · landing · mobile

### S8: Ship
- [ ] A: `seed.ts` on a fresh team · Arkiv docs · README addresses · V5 + V6
- [ ] B: SECURITY.md · WORLD_DEBRIEF.md · V3 red team
- [ ] C: DEMO_SCRIPT.md · video · README · Vercel · V2 sponsor audit
- [ ] Rehearsal 1 · Rehearsal 2 · Rehearsal 3 · **Submitted** (link: ___)

---

## Requests (cross-lane; format: `- [ ] FROM → TO: ask (time)`)
- [x] B → A (done by A, 2026-11-06): World moved to IDKit 4. Please add to `.env.example`: `WORLD_APP_ID=` (public), `WORLD_RP_ID=` (public), `WORLD_SIGNING_KEY=` (secret, B). `WORLD_CLIENT_ID/SECRET` stay as the OIDC fallback. Also make `check-secrets.mjs` flag a non-empty `WORLD_SIGNING_KEY=` value (2026-11-06)
- [ ] B → A: `GraphView` has no `get(key)`. `decidePayment` takes attestation roots from a cited memory's ancestors, so a cite that is itself a root (evidence/human memory) adds nothing. Please add `get(key): MemoryNode | undefined` (or `roots(key)`) to the interface (2026-11-06)
- [ ] B → C: blocked/pending decisions list **all** reasons, hard first (P1 = ENS_MISMATCH, OUTSIDE_CONTENT_PAYEE, NEW_PAYEE, OVER_CAP). `path` is the offending lineage (cite → payee memory → evidence), e.g. P1 `["0xM2","0xM1","0xE1"]` (2026-11-06)
- [ ] B → C: the approval card shows `ApprovalView.verificationUri` (the IDKit `connectorURI`) as a QR plus a "open in World App" link, with `userCode` as a short reference. The URI carries the bridge key, so render it **only** on the owner-authenticated dashboard and never log it. Deny/expire/cancel come back as `PayDecision` statuses (2026-11-06)
- [ ] B → A: vault pay() calls `getOwner(labelhash)` on the team UserRegistry; `ens.sepolia.json` needs per-agent `labelhash` (uint256 of keccak(label)) + `registry` + `wallet` for `set-agents` (2026-11-06)
- [x] B → A: `config/app.json` needs `payments.eip712 {name, version}` for the vault domain (vault takes them as constructor args) (2026-11-06) → done: `{ "name": "BrainVault", "version": "1" }` (matches your tests), zod-validated as `config.app.payments.eip712`
- [x] A → B, C: **S0 pushed: B and C can pull** (1f0390c, 2026-11-06 04:42). Notes for you:
  - Import types/interfaces from `@supabrain/shared` (browser-safe). Node config loader: `@supabrain/shared/config` (`loadConfig()`, `requireEnv()`). Fakes: `@supabrain/shared/testing` (`FakeEns`, `FakeGraph`, `FakeArkivWriter`), unit tests only.
  - Run the doctor as `pnpm run doctor`: plain `pnpm doctor` is a pnpm built-in and prints nothing.
  - B: `packages/payments/src/index.ts` exports a throwing `createPayments` stub for you to fill. `contracts/` keeps your Foundry setup (my `.gitkeep` is harmless; delete it if you like). `config/world.json` is yours; the loader accepts it loosely (`WorldFileSchema` in `config-schema.ts`), so tighten it via a Requests line.
  - C: `apps/web` is a bare Next 16 shell (no Tailwind/shadcn yet); `transpilePackages` already includes `@supabrain/shared`. Port 3000; the server is on 3001.
  - `pnpm build` = `tsc` typecheck per package + `next build`. The server runs TS directly with `tsx` (`pnpm --filter @supabrain/server dev|start`).

## Hand-offs (when a Claude account hits its limit)
<!-- ### <time> · <lane> · state / next step / open questions -->

## Asks received (names only, never values)
<!-- - <time> · <lane> · ASK <NAME>: received, validated (<public detail>) -->

---

## Log: Lane A (Brain)
<!-- newest first; format in CLAUDE.md §3.4 -->

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
<!-- newest first -->

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
<!-- newest first -->
