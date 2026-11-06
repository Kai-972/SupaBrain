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
| A: Brain (server, memory, Arkiv, ENS) | Kai | #1 | S1 ENS ✅, S1 Arkiv ✅ → S1 MCP spike (needs a public host) | 🔨 in progress | host choice for the MCP spike (Render likely; ngrok fallback) |
| C: Face (dashboard, onboarding, demo) | Kai | #2 | S0 (A's scaffold is pushed: pull) | ⏳ | – |
| B: Money & Security (policy, vault, World) | Srijit | #3 | BrainVault live on Sepolia (0x2da7…0ec8), **S2 ✅ on Sepolia**: deployed, agents set, funded, real pay ✓, on-chain kill ✓. Next: guardian ETH, then S6 live World → paid | 🔨 | A: S0 scaffold (for `packages/payments`), A: S1 `ens.sepolia.json` (for fork test + deploy) |

Status icons: ⏳ not started · 🔨 in progress · ✅ done · 🛑 blocked · ⚠️ fallback taken

---

## Stage checklist (tick with a proof link or commit hash)

### S0: Scaffold
- [x] A: monorepo, config + zod, types + interfaces, fakes, guards, `.env.example`, MIT, first push (1f0390c)
- [ ] B: pulled; Foundry init; `packages/payments` skeleton builds
- [ ] C: pulled; Next app, tokens, fixture loader, `?mock=1` banner

### S1: Spikes
- [x] A · S1 ENS: team name + registry · agent + own resolver · `sb.memory.head` ✓ · `sb.pay.cap` revert tx · UR read-back · unregister → null · transfer revert · **handoff `ens.sepolia.json` to B** (cff14b9; proofs in the A log)
- [x] A · S2 Arkiv: batch ok · `$creator ≠ $owner` in ONE tx · queries ok · **extend-on-readonly: WORKS (owner extends; nobody patches; Keep = 1 batch)** · watcher fires · expiry exact · friction logged (8 entries) (proofs in the A log; `pnpm arkiv:query`)
- [ ] A · S3 MCP: public URL · Claude Code ✓ · Claude.ai ✓ · Antigravity ✓ · bad token 401
- [x] B · S4 World: IDKit 4 live: approve ×3 · deny (`verification_rejected`) · cancel (85c358a; runs logged in WORLD_DEBRIEF.md)
- [x] B · S5 Vault: `forge test` green (mock registry) · 47 passed · V1 review done (0 crit/high/med; L-2/L-3/L-4 fixed) · 34f9228
- [ ] C: static graph with all encodings + list view (screenshot)

### S2: Memory core
- [ ] A: whoami/recall/remember/explain · lineage + trust tests · Arkiv batch writes · startup rebuild · ENS check per call · SSE · `/api/team` `/api/graph` `/api/memory/:key`
- [ ] B: fork test vs the real team registry ✓ e4fcbf5 · V1 review ✓ · deployed ✓ [0x2da7…0ec8](https://sepolia.etherscan.io/address/0x2da794b8dd00afc970b372d7cf960ecd1f190ec8) · 1-USDC pay tx ✓ [0x9ab2…06ae](https://sepolia.etherscan.io/tx/0x9ab200485f3fbf0c5f39a832d9c19a00e31cfaab0b04d1d52009f6c7f2a806ae) · `step-kill` revert tx ✓ [0x516b…4579](https://sepolia.etherscan.io/tx/0x516b96da3c4df023563178a2a2f71cb6d351b48abcc945d8d09d3380d53e4579) · `decidePayment` table tests ✓ 202d16e
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
- [ ] B: `createPayments` end to end (policy ✓ 30f99b8 · attestation ✓ f59b6b9 · vault client ✓ 1973e38 · engine + pending-human ✓ 26d47f0 · createPayments ✓ 30a54e6 · Sepolia deploy ✓ 7c1429e)
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
- [ ] B: SECURITY.md ✓ cbb5549 · WORLD_DEBRIEF.md ✓ 7540d6e · SPONSORS World/Vault ✓ fdf684b · V3 red team
- [ ] C: DEMO_SCRIPT.md · video · README · Vercel · V2 sponsor audit
- [ ] Rehearsal 1 · Rehearsal 2 · Rehearsal 3 · **Submitted** (link: ___)

---

## Requests (cross-lane; format: `- [ ] FROM → TO: ask (time)`)
- [ ] B → A, C: `PROJECT.md` §6.3 "How we use it" and §10 are out of date for World: we use **World ID 4 via IDKit** (Human-in-the-loop pattern), not the OIDC device flow (its portal needs an enterprise Google account), and World proofs are **real, not mocked** (live approve/deny/cancel in WORLD_DEBRIEF.md). Action binding is native now (action = intent hash). Please update or point to SPONSORS.md#world (2026-11-06)
- [x] B → A (done by A, 2026-11-06): World moved to IDKit 4. Please add to `.env.example`: `WORLD_APP_ID=` (public), `WORLD_RP_ID=` (public), `WORLD_SIGNING_KEY=` (secret, B). `WORLD_CLIENT_ID/SECRET` stay as the OIDC fallback. Also make `check-secrets.mjs` flag a non-empty `WORLD_SIGNING_KEY=` value (2026-11-06)
- [ ] B → A (A replies 2026-11-06 08:28 IST: will mount in S5 together with the GraphView/ArkivWriter adapters, which do not exist yet; the try/catch-to-disabled pattern is accepted): **`createPayments` is ready** (30a54e6). In `apps/server/src/index.ts`, mount it instead of the disabled stub: `try { payments = createPayments(deps) } catch { payments = createPaymentsDisabled() }`. It throws until `config/deployments/vault.sepolia.json` exists (I write it at deploy), and every call fails closed with a clear error if the chain checks fail. Extra method for tests only: `createPaymentsEngine(...).settled(intentId)`. MCP `pay` returns `pending_human` immediately; `pay_status` = `payments.status(intentId)` (2026-11-06)
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
<!-- newest first; format in CLAUDE.md §3.4 -->

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
<!-- newest first -->

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
<!-- newest first -->
