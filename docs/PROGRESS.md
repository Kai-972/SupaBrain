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
| A: Brain (server, memory, Arkiv, ENS) | Kai | #1 | S0 ✅ → S1 ENS step 1 | 🔨 in progress | ASK: team label, SEPOLIA_RPC_URL, OWNER_PRIVATE_KEY, keygen OK |
| C: Face (dashboard, onboarding, demo) | Kai | #2 | S0 (A's scaffold is pushed: pull) | ⏳ | – |
| B: Money & Security (policy, vault, World) | Srijit | #3 | S1 · vault done; next World spike | 🔨 | A: S0 scaffold (for `packages/payments`), A: S1 `ens.sepolia.json` (for fork test + deploy) |

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
- [ ] B · S4 World: discovery logged · approve · deny · expire/cancel
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
- [ ] B: `createPayments` end to end
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

### 2026-11-06 04:42 IST · A · S0 / scaffold
- did: pnpm workspace (apps/server, apps/web shell, packages/{shared,ens,payments}, scripts, contracts/), zod config loader + §6 types/interfaces verbatim + fakes, config seeded with source/verifiedAt, guards (lint:hardcode, check:secrets, doctor) + pre-commit hook, server `/healthz` with `createPaymentsDisabled()`, skeleton docs, MIT, `.env.example`
- proof: fresh clone → `pnpm i --frozen-lockfile && pnpm build && pnpm test` (25/25) `&& pnpm lint:hardcode` all green; `pnpm run doctor` checked Rabdi `eth_chainId` live = 7794095; USDC address verified on developers.circle.com
- result: PASS
- commit: 1f0390c
- next: S1 ENS step 1 (`pnpm keys:new`, after the ASK)
- asks/blockers: team ENS label, SEPOLIA_RPC_URL, OWNER_PRIVATE_KEY (testnet burner), OK to generate keys. Tooling: installed the Arkiv plugin 0.5.4 (Mumbai MCP connected) and the Context7 MCP

## Log: Lane B (Money & Security)
<!-- newest first -->

### 2026-11-06 IST · B · S1 / S5 vault (mock registry) + V1 review
- did: Foundry in `contracts/` (pinned deps via `install-deps.sh`, lib/ gitignored); `BrainVault.sol` written test-first against a mock ENSv2 registry; V1 adversarial review; fixed L-2 (remove+re-add reset), L-3 (two-step ownership), L-4 (`cancelIntent`), I-4/I-6; documented 2x-at-UTC-midnight worst case (L-1)
- proof: `forge test` → 47 passed, 0 failed (incl. 512-run ceiling fuzz, cast-signed EIP-712 vector); ENSv2 `getOwner(uint256)` returns 0 when `block.timestamp >= expiry` (contracts-v2 07e55a05, verified in source)
- result: PASS
- commit: 6ef9e01, bae2df6, 33f9e9c, 34f9228
- next: S1 World device-flow spike (needs WORLD_CLIENT_ID/SECRET + issuer); then vault deploy script once config/ + `ens.sepolia.json` land
- asks/blockers: none for this step. Deploy needs SEPOLIA_RPC_URL, POLICY_SIGNER/GUARDIAN keys, A's `ens.sepolia.json`

## Log: Lane C (Face)
<!-- newest first -->
