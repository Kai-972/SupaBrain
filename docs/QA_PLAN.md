# QA plan (Supabrain · ETHGlobal Mumbai 2026)

Owner: Lane B (Srijit), with Srijit as the human in the loop. This plan says what we test, how, against what, and what "ready for judging" means. Results go into `docs/PROGRESS.md` (Lane B log), each with proof links.

## 1. Scope and environments

| Layer | What | Where it runs |
|---|---|---|
| Unit | policy, engine, attestation, World validation, graph, lineage, tokens, store fakes | `pnpm test` (vitest, no network) |
| Contract | BrainVault (47 unit + 12 review regressions) | `cd contracts && forge test` |
| Integration (local chain) | TS signer + vault client + payments engine against the compiled vault | `packages/payments/src/vault/vault.anvil.test.ts` (anvil; skips without Foundry) |
| Fork | the vault against the REAL `supabrain.eth` registry + Circle USDC | `SEPOLIA_RPC_URL=… forge test --match-contract BrainVaultForkTest` |
| Live (read-only) | doctor, ENS status, vault status, server health, `/api/graph`, `/api/payments` | `pnpm run doctor`, `pnpm ens:status`, `pnpm vault:status`, curl |
| Live (writes) | seed, P1, revoke, P3 (World), deny, cancel, on-chain refusals, kill | local server; **each Sepolia/Arkiv write needs Srijit's "go"** |

**Rules for live runs:**
- One server writes with the shared wallets at a time. Check Kai's tunnel `/healthz` before starting.
- Use a fresh `SUPABRAIN_APP_NAMESPACE` per rehearsal.
- No `PUBLIC_BASE_URL` for local runs.
- Never print secrets.

## 2. Entry and exit criteria

**Entry**, before every QA cycle:
- `git pull --rebase` and `pnpm i`.
- `pnpm test` is green. `it.fails` is allowed only for documented open findings.
- `pnpm lint:hardcode` and `pnpm check:secrets` are clean.
- `pnpm run doctor` shows no hard failures: vault USDC ≥ 6, guardian ETH > 0, tGLM on every Arkiv signer.

**Exit (ready for judging):**
- All P0 rows below PASS with proof links.
- There are no `it.fails` tests for P0 behaviour (none left after this cycle).
- One full rehearsal of `docs/DEMO_SCRIPT.md` runs without manual fixes.
- The fallbacks `pnpm demo:step blocked|approve` and `demo:step-kill` each pass once on the rehearsal namespace.

## 3. Test matrix (P0 = demo-critical)

| # | Pri | Behaviour | How | Status (2026-11-06) |
|---|---|---|---|---|
| M1 | P0 | Agents share one graph across vendors; trust = min(parents); lineage recorded | unit (`engine/*`), `pnpm e2e:memory`, live seed | PASS (seed: 9 memories, trust/lineage match the fixture) |
| M2 | P0 | Lineage survives reads (`ancestors()`, `pay`) and restarts | `engine/graph-walk.repro.test.ts`, `payments/lineage-repro.test.ts`, live `/api/graph` after P1 | PASS: fixed d5299ce (graph.walk drained `parents`); 3 regression tests; live restart shows all 7 edges |
| M3 | P0 | Revoke a source → exact cascade, notices, re-ask answer changes | unit (`memory/undo.test.ts`), `pnpm e2e:undo`, live revoke | PASS (6 quarantined, 3 untouched, notices to 3 agents) |
| M4 | P1 | Keep / Correct this / Add context | unit, `pnpm e2e:undo` | PASS (A's harness, 14 checks) |
| P1 | P0 | ENS-mismatch payee is BLOCKED from a real MCP client | `policy.test.ts`, `demo:step blocked` | PASS live |
| P2 | P0 | Outside-content / new payee → World approval; deny → nothing moves | `engine.test.ts`, `humanApproval.test.ts`, live deny | PASS live |
| P3 | P0 | Over-cap → World approve → PAID on Sepolia with `humanApproved=true` | `demo:step approve` | PASS live (tx 0x7b98…7528) |
| P4 | P0 | Revoke reaches the vault; revoked lineage is refused **on chain** | `vault.anvil.test.ts`, live `revokeRoot` + `pay-proof --expect-revert RootRevoked` | PASS live |
| P5 | P0 | Unregistered agent can't pay **on chain** | fork test, `demo:step-kill` | PASS live (`AgentNotRegistered`) |
| P6 | P1 | Team-controlled payees never paid (`PROTECTED_PAYEE`); concurrent spend can't beat the daily limit | V3 red-team tests | PASS (unit, mutation-checked) |
| P7 | P1 | Payment history (`/api/payments`) survives a server restart | `payments/history.test.ts`; live restart + `/api/payments` | PASS: fixed 606f216; live: 4 decisions (blocked, paid, denied, cancelled) listed after a restart |
| P8 | P2 | Expired approval → nothing moves | unit (bridge timeout, our clock, late approval) | PASS (unit only; live wait-out not run) |
| S1 | P0 | MCP auth: bad/expired/unknown token → 401; path token never logged; Host allowlist; 503 unconfigured | `auth/tokens.test.ts`, `mcp/*.test.ts`, `security-review.test.ts` | PASS (F1–F3 fixed by A) |
| S2 | P1 | Secrets never in commits/logs/bundle | `check:secrets` pre-commit, grep of `apps/web/.next` | PASS (each commit) |
| D1 | P1 | Demo fallbacks don't depend on a model | `demo:step blocked|approve`, `demo:step-kill` | PASS live |
| D2 | P1 | Seed output doesn't clobber another namespace's | `scripts/demo/seed-file.test.ts` | PASS: fixed 0a80472 (`demo-seed.<namespace>.json`, steps read the server's namespace) |
| U1 | P0 | Dashboard renders graph, cascade, approval QR (owner-only), payments | Lane C manual run against the local server | Lane C (UI session) |

## 4. Known risks and accepted gaps

| Risk | Mitigation |
|---|---|
| Two servers on the shared wallets (nonce / Arkiv write races) | Check Kai's `/healthz` first; one server per rehearsal |
| World approval link valid ~5 min | The QR is shown instantly on the owner card; whoever runs the demo has World App open |
| Public Sepolia RPC is slow (~5 s reads) | A keyed RPC (Alchemy/Infura) in `.env.local` before judging (needs a human to create the account) |
| Arkiv memories expire after 2 days | Seed within 2 days of judging; Keep the demo memories |
| Tokens aren't bound to a deployment (review D2) | **Accepted for the event:** changing the MAC would invalidate every paired client the night before judging. Use a distinct `TOKEN_SIGNING_SECRET` per server. Fix after the event |
| "Paid before" isn't rebuilt after a restart | Fails safe: `NEW_PAYEE` fires again, so a human sees it |
| Custodial agent/policy/guardian keys on the server | Bounded by vault ceilings, guardian tighten-only, owner kill switch (`SECURITY.md` §3) |

## 5. Rehearsal runbook (each step logged with proof)

1. Check for Kai's server and stop it if it's up. Set `SUPABRAIN_APP_NAMESPACE=supabrain-mumbai26-<run>`, then `pnpm run doctor`.
2. Start the server: `NODE_NO_WARNINGS=1 pnpm --filter @supabrain/server start`. Expect "rebuilt from Arkiv" and "payments enabled".
3. Run `pnpm demo:seed --base http://localhost:3001` (go). Check `/api/graph`: 9 nodes, 6 edges.
4. Run `pnpm demo:step blocked` (go). It should come back BLOCKED with `ENS_MISMATCH`, and `/api/graph` should still have 6 edges (M2).
5. Run the owner dry run, then revoke `email:acme-0611` (go). Expect 6 quarantined, `vaultTxUrl`, and `revokedRoot = true`.
6. Run `pnpm demo:step approve` (go), then approve in World App. Expect PAID and a Sepolia tx, plus a `payment` memory in `/api/graph`.
7. Do a deny run (go) and a cancel run (go). The vault balance should not change.
8. Optional: `pnpm demo:step-kill gem-research --yes --revive` (go).
9. Restart the server. `/api/graph` should be unchanged and `/api/payments` should still list every decision (P7).

## 6. QA cycle log

**2026-11-06 (Lane B, at Srijit's request: "make a proper QA plan, research, fix what Kai needs to do")**
- **Research:** open B → A requests; `it.fails` tests; every in-place array mutation on the server.
- **Found:** M2 (graph lineage drained by `ancestors()`), P7 (payment history lost on restart), D2 (seed output shared across namespaces). Review D2 on token binding was accepted with a mitigation, matching A's decision in DECISIONS.md.
- **Fixed, tests first:**
  - M2: `63b8e43` + `d5299ce`, plus defensive copies of node arrays;
  - P7: `b7e449b` + `606f216`;
  - D2: `cc60d66` + `0a80472`.
- **Verified:**
  - 383 vitest pass with 0 expected-fail;
  - typecheck clean in 7 packages;
  - forge 47 tests, plus the fork test 4/4 on live Sepolia;
  - `lint:hardcode` and `check:secrets` clean;
  - live read-only smoke on the restarted local server: rebuild, 7 edges, 4 payment decisions reloaded.
- **Not re-run live after the M2 fix:** a new `pay` (it writes to Arkiv). Covered by the seed → P1 regression test through the real payments engine.
