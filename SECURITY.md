# Security

Supabrain lets several AIs share one memory and spend from one team budget. This file covers the money and identity side: what we defend against, who holds which key, which code enforces each control, and what we do **not** protect. Everything here runs on testnets (Ethereum Sepolia, Arkiv Rabdi) with test USDC.

Line numbers refer to the commit that last updated this file.

## 0. v2 MVP: brains ("GitHub for your AIs' memory"), added 2026-11-06

v2 adds brains: projects where several AIs save checkpoints and pick up each other's work (`docs/PLAN.md`). The money controls below (§1–§7) still guard the demo brain, which is the only brain where `pay` exists. Pre-made brains are provisioned with `pay.cap = 0`. This is MVP-level security, so here is what it does and doesn't do.

| Control | How it works | What it doesn't cover |
|---|---|---|
| **Sponsored gas** | Users sign in with a wallet (one gasless signature) and never send a transaction. The server pays for and signs every Arkiv write and every ENS rule change | A compromised server can write as any brain AI and change any brain's rules until the owner steps in |
| **Server-held, derived AI wallets** | Each brain AI's wallet derives from one server secret, `BRAIN_AGENT_MNEMONIC` (account = brain index, address = family index; `packages/ens/src/brains.ts`). Nothing is stored per wallet. Each wallet holds only ~0.35 tGLM on Rabdi and no money | The mnemonic is a single point of failure: a leak exposes every brain AI identity. The fix is to provision new brains from a new mnemonic. Agent custody stays with the server, as in v1 |
| **What the server's key may do on ENS** | On each brain registry: register, renew, unregister and set resolver. On each brain name: renew only. On each AI resolver: set text, which is how rule changes happen. It can't transfer names, re-point subregistries, change an AI's address or upgrade anything. Checked live by `pnpm ens:brains-status` | Within those rights, it can pause or unpause an AI and change its scope. That is the feature |
| **Owner key offline** | The `supabrain.eth` owner key is never on the host. It holds root roles on the team registry (it can unregister a whole brain), the same registry roles on every brain registry, and all roles on every AI resolver, so it can revoke the server's rights | Recovery is manual, from a dev machine |
| **Rules on ENS, enforced per call** | Status (active/paused), scope (path prefix), writes per day and role are text records the server reads live on every call. If ENS can't be read, the call is refused (fail closed; Lane A) | Enforcement happens in our server. Arkiv itself doesn't know the rules; a stolen AI key could still write entities directly (they're signed, so they're attributable, and `verify:memory` shows who signed them) |
| **Private brains** | Text and file contents are encrypted with a per-brain key before they go on Arkiv (Lane A) | The server holds the keys, so this protects against public chain readers, not against the operator. Metadata stays public: entity attributes, sizes, timing and the signing wallet |
| **Stop and review notices** | Built (`apps/server/src/engine/guard.ts`). Content that tries to steer another AI (override instructions, `curl … \| sh`, "send funds to 0x…", leak secrets, change your ENS rules, "tell Claude to …") is saved as evidence, signed by the AI that relayed it, then revoked at once by a team-signed Arkiv revocation. No AI receives it or builds on it, and it appears on `/api/brains/:id/review`. Supabrain never edits the user's files. The whole-brain Stop button is not built yet | Detection is heuristic, so it will miss some attacks and flag some harmless content. The owner can release a false alarm |
| **Separate funder on Rabdi** | AI wallets are topped up from a separate faucet wallet (`FUNDER_PRIVATE_KEY`), never the team wallet, so two senders don't race the server's nonces (`scripts/brains/fund-brains.ts` refuses a known server wallet) | – |

## 1. What we protect

| Asset | Where it lives | Worst outcome |
|---|---|---|
| Team budget (test USDC) | `BrainVault` on Sepolia, [`0x2da7…0ec8`](https://sepolia.etherscan.io/address/0x2da794b8dd00afc970b372d7cf960ecd1f190ec8) | Money sent to an attacker's address |
| Who an agent is and what it may do | ENSv2 names under `supabrain.eth` (role, scope, caps as records) | An agent acting with rights it shouldn't have, or after it was killed |
| Shared memory | Arkiv entities signed by each agent's wallet | A false fact steering other agents, especially a payout address |
| Human approval | World ID 4 proof tied to one payment intent | "A human approved this" when no human approved this payment |

## 2. Threat model

| # | Threat | Control | Where |
|---|---|---|---|
| T1 | **The payee came from outside content.** A "bank details changed" email, a web page or a poisoned memory supplies the address. | The policy walks the payee's lineage over the **whole team graph**, never the agent's read-set. A trust-1 (outside content) root behind an unverified payee means a human must approve. | `packages/payments/src/policy.ts:141` (graph lookup), `:185` (`OUTSIDE_CONTENT_PAYEE`) |
| T2 | **A memory's address disagrees with the vendor's ENS record.** | Hard block, no override. This also applies when the payee is given as an ENS name: if memories tie the address to a name whose ENS record differs, the payment is blocked. | `policy.ts:148–155` (`ENS_MISMATCH`) |
| T3 | **The payee derives from a revoked source.** | Hard block (`QUARANTINED_LINEAGE`). Pending intents whose supporting lineage is hit are cancelled. The vault gets `revokeRoot` so the root is dead on chain too. | `policy.ts:174`, `engine.ts:279–296`, `BrainVault.sol:156`, `:182` |
| T4 | **New payee, over the per-payment cap, or over the daily limit.** | A fresh World ID approval, bound to this exact intent. Caps are read live from ENS records, never from config. | `policy.ts:189–195`, `engine.ts:236` (`intentHash`), `world/humanApproval.ts:106` (action = intent) |
| T5 | **A compromised server or a skipped workflow** (the Binance lesson: the policy lived in a workflow the attacker skipped). | Agents never hold the budget. The only way to move it is `BrainVault.pay`, which checks on chain: the caller owns its live ENS name, a fresh policy-signer attestation covers this exact payment, no root is revoked, the intent is unused, and the owner-set daily ceiling holds. | `BrainVault.sol:140–175` |
| T6 | **A killed agent keeps spending.** | `pay` calls `getOwner(labelhash)` on the team's ENSv2 registry on every call. Unregister the name and the next payment reverts. Proven on Sepolia: [`AgentNotRegistered` revert](https://sepolia.etherscan.io/tx/0x516b96da3c4df023563178a2a2f71cb6d351b48abcc945d8d09d3380d53e4579). The server re-checks ENS authority on every payment and again after a human approves. | `BrainVault.sol:146`, `policy.ts:115`, `engine.ts:189–209` |
| T7 | **Replay or a stale approval.** | The vault burns `intentId` and enforces `deadline`. The EIP-712 domain includes `chainId` and `verifyingContract`. High-s signatures are rejected. World proofs are one-time per `(action, nullifier)`, pinned to the configured environment and our signed nonce. An approval that arrives after the intent expired counts as expired. | `BrainVault.sol:150–161`, `humanApproval.ts:179–193`, `:233`, `engine.ts:180` |
| T8 | **The vendor's ENS changes while a human is approving.** | After approval every hard check runs again, live. If the payee now resolves to a different address than the one the human approved, the payment is blocked. | `engine.ts:200` |
| T9 | **A cancel races an in-flight payment.** | Once the attestation is signed and the vault call is in flight, the intent can't be cancelled, so the record always matches the chain. | `engine.ts:139` |
| T10 | **The agent's key isn't the wallet ENS says it is.** | Blocked (`AGENT_NOT_AUTHORIZED`), and the vault would revert anyway. | `engine.ts:132`, `BrainVault.sol:146` |
| T11 | **ENS, the vault RPC or World is unreachable.** | Fail closed. Unknown authority blocks. A failed vault read fails the payment. A World failure is never an approval. At startup the server checks chain ID, contract code, USDC decimals, and that the vault's policy signer is our key, before the first payment. | `policy.ts:96`, `engine.ts:124`, `humanApproval.ts:208–231`, `runtime.ts:99–110` |
| T12 | **Prompt injection through memory.** An email tells an agent to pay someone. | Outside content can't authorize money: it can only make a human look (T1). Retrieved memory is framed to agents as information, not instructions (Lane A's MCP prompt). | `policy.ts:185` |
| T13 | **Secrets leak** (keys, RPC keys, the World signing key). | Secrets only in `.env.local` (gitignored, mode 600). The pre-commit hook runs `pnpm lint:hardcode` and `pnpm check:secrets`. Scripts print names and public addresses only, and RPC URLs are redacted in errors. | `.githooks/pre-commit`, `scripts/check-secrets.mjs`, `runtime.ts` (`redactUrls`) |
| T14 | **Paying a team-controlled wallet** (V3 red team R1/R2). Money sent to an agent's own server-held wallet, the guardian or policy signer, the vault or the token leaves every vault control. Before the fix, one human approval plus a clean memory made later payments there **allowed**. | Hard block `PROTECTED_PAYEE {label}`, no approval overrides it: every agent wallet in the ENS deployment, the vault, USDC, the policy signer, the guardian and the zero address are never payees. The owner stays payable for refunds. | `policy.ts:136–139`, `runtime.ts:88` |
| T15 | **Concurrent payments race the daily limit** (V3 red team R3). Eight concurrent 4 USDC payments all read `spentToday` before any landed, so all passed a 30 USDC ENS daily limit. | evaluate → execute is serialised per agent, so each payment sees the previous one's spend. Waiting for a human happens outside the lock. The vault's on-chain ceiling is the backstop. | `engine.ts:83` |

**Proven live on Sepolia (2026-11-06, through the server's own `pay` tool):**
- **T2:** P1 is BLOCKED by `ENS_MISMATCH` ([Arkiv decision](https://rabdi.explorer.arkiv.network/tx/0xe5783a4e5849d5c1588c791f776cfaa29c1ba389c841ba29a045a7b540e2a11a)).
- **T3:** revoking `email:acme-0611` quarantines exactly the 6 derived memories and calls `revokeRoot` on the vault ([tx](https://sepolia.etherscan.io/tx/0x7083d77c6266ac8afb64021d1899eb1ac7f6dd94298fafcff8153659fd983137)). A valid policy-signed attestation carrying that root is then **refused on chain**: [`RootRevoked` mined revert](https://sepolia.etherscan.io/tx/0x7e589a3ce39efbf3bb0f964c6f13a1cfc3d852a29e7b0a337c9521e77a70ddd4).
- **T4:** the over-cap P3 needs World. Approved in World App → [PAID](https://sepolia.etherscan.io/tx/0x7b983ad5aafadce22a1fdd98da09a3710be64be673f96c39602c5663de517528) with `humanApproved=true`. Denied → nothing moved ([Arkiv](https://rabdi.explorer.arkiv.network/tx/0xc272dd7fa0e51ad5ea40c64a06cb1255bc70ad7f4546c2a8dc0c8e8708a8aa39)). Owner cancel → nothing moved ([Arkiv](https://rabdi.explorer.arkiv.network/tx/0x926cd6ffe99f47e3efc53db12ad2debf94e39cb32864ad5d2cc46afa8eba1128)).
- **T6:** [`AgentNotRegistered` mined revert](https://sepolia.etherscan.io/tx/0x516b96da3c4df023563178a2a2f71cb6d351b48abcc945d8d09d3380d53e4579).

**Address in text (Supermemory review, 2026-11-06):** live models often state an address only in a memory's text. A memory explicitly tagged with a team vendor that names an address in its text now ties that address to the vendor, so `ENS_MISMATCH` fires, and such a memory never counts as lineage for the honest payee. **Trade-off:** a vendor-tagged memory naming a third party's address hard-blocks payments to that address. That is the "pay our partner instead" attack, and the block fails safe. Untagged memories are not matched, so the partner beat stays a World approval. `packages/payments/src/policy.ts` (`mentioned`, `supports`).

### 2.1 V3 policy red team (2026-11-06)
Goal: find inputs that get a **bad payment allowed**. Each attack was written as a failing test first (`packages/payments/src/policy.test.ts`, `engine.test.ts`, commit b228947), then fixed (1c8ae65). Each fix was then disabled on purpose to confirm its test fails without it.

**Broke, now fixed:**
- **R1:** paying an agent's own wallet, or its ENS name. **R2:** paying the vault, the token or the zero address. Both were allowed after one approval (T14).
- **R3:** concurrent payments beating the daily limit (T15).

**Held (already tested):**
- an email-supplied `attacker.eth`;
- a cleared read-set or empty `cites`;
- citing human memories to launder an outside-content payee;
- an observer agent, an unregistered agent, a quarantined or expired agent;
- inconsistent ENS records, `payCap` 0, an ENS outage;
- over the daily limit;
- a quarantined ancestor behind an active-looking memory;
- too many lineage roots (an error, never silent truncation);
- a vendor address that another memory ties to a different team name;
- malformed amounts or payees;
- phishing memories about the vendor polluting the honest payment's roots.

**Accepted by design:** a payee that is already paid, verified, and clean of outside content can be paid again under the caps without a human. That's the "known payee" path, and the vault ceiling still bounds it.

## 3. Key custody

| Key | Address | Held by | Can do | Can't do |
|---|---|---|---|---|
| **Owner** | `0xFcf0…E198` | Dev machines only (Kai, Srijit). **Never on the server.** | Register and unregister agent names (the kill switch). Set ENS records and caps. Vault: set agents, unpause, unrevoke, change signer or guardian, withdraw. | Nothing is above it. It is the root of trust. |
| **Policy signer** | `0x4F24…26d0` | Server | Sign payment attestations | Move money on its own (needs an agent caller with a live ENS name). Exceed the owner's daily ceilings. |
| **Guardian** | `0x2782…4D51` | Server | `revokeRoot`, `pauseAgent`, `cancelIntent`: **tighten only** | Unpause, unrevoke, withdraw or change roles |
| **Agent wallets** | lead-claude `0xEd4a…1bfC`, gem-research `0x6c57…590c`, gpt-writer `0x4B35…14fA` | Server (custodial, disclosed) | Call `pay` with a valid attestation, and write memories | Hold the budget. Pay without an attestation. Pay after unregister. Raise their own caps (the setter role covers one key, `sb.memory.head`; a cap write reverts on chain). |
| **World RP signing key** | signer `0x03c3…b479` | Server | Sign World ID 4 requests for our relying party | Produce a proof; only World App can |
| **Team wallet (Arkiv)** | `0x4eA7…5A56` (`config/deployments/arkiv.rabdi.json`) | Server | Own Arkiv entities, write revocations | Rewrite an agent-signed memory (entities are readonly) |

**Worst case: every server key stolen** (agents + policy signer + guardian). Loss is bounded by the owner-set vault ceilings: at most `sum(dailyCeiling)` per UTC day, currently 30 + 4 + 0 = 34 test USDC. Up to twice that can move across a UTC midnight, because the ceiling resets at midnight rather than over a rolling 24 h window (`BrainVault.sol:20`). The owner stops it from a dev machine with `pauseAgent`, `removeAgent` or `setPolicySigner`, or by unregistering the names.

**A stolen guardian key alone** can only deny service (pause agents, revoke roots, burn intents). Recovery: the owner calls `setGuardian(0)`, then `unpauseAgent` / `unrevokeRoot` (`BrainVault.sol:226`, `:244`; regression test `test_recoverFromStolenGuardian`).

## 4. The vault, in one paragraph

`BrainVault.pay` (`BrainVault.sol:140`) checks, in this order:
1. the caller is the agent named in the payment;
2. the agent is known;
3. **`getOwner(labelhash) == msg.sender`** on the live ENSv2 registry;
4. the agent isn't paused;
5. amount and payee are non-zero;
6. the deadline hasn't passed;
7. the intent is unused;
8. at most `MAX_ROOTS` roots, none revoked;
9. the EIP-712 attestation recovers to the policy signer;
10. the daily ceiling holds, in a form that can't overflow.

Then the effects, then `safeTransfer`, under `nonReentrant`. The contract was reviewed adversarially before deploy (V1: no critical, high or medium findings; the low and info findings became regression tests in `contracts/test/BrainVaultReview.t.sol`). Tests: 47 unit tests, plus 4 fork tests against the real `supabrain.eth` registry. The TypeScript signer reproduces a cast-signed EIP-712 vector byte for byte (`packages/payments/src/vault/attestation.test.ts`).

## 5. Lessons from the Binance hot-wallet drain (Oct 29, 2026)

We do **not** claim Supabrain would have stopped that attack. It was an access-control breach (malware, a stolen deploy token, a signer that checked who was asking but not what it was signing), not an agent choosing a bad payee. We applied its lessons to agent payments:

| Lesson | What we did |
|---|---|
| The policy lived in a workflow the attacker skipped | The policy sits **at the money**: `BrainVault.pay` re-checks identity, attestation, revocations and ceilings on chain. Skipping our server gains nothing. |
| An AI tool became the attacker's hands | Every agent is its own revocable principal (one ENSv2 name, one resolver, one wallet, its own caps). The owner key never touches the server. |
| On-chain authority outlived the pause, and revocation was improvised | Revocation is one call, rehearsed on Sepolia: unregister → `AgentNotRegistered`; `revokeRoot` kills a source's lineage on chain. |
| New destination plus a large amount means danger | A new payee or an over-cap amount needs a fresh human approval tied to that exact intent. |
| "What you see isn't what you sign" | The approval binds `keccak256(agent, payee, amount, roots, intentId, expiry)`, and the vault attestation is signed only after the approval, with the same payee and amount. |

## 6. Known gaps (said plainly, also in the README)

- **Custodial agent, policy and guardian keys.** The server holds them, so a server compromise is a real event. It is bounded by owner-set ceilings and the owner-only kill switch (§3), not prevented.
- **Lineage is server-recorded.** Agents sign their memories, but the parent links are recorded by our server, so a malicious server could lie about where an address came from. Signed lineage is roadmap.
- **Who may approve.** World ID 4 nullifiers are per action, and every payment is its own action, so we can't yet require "this specific human" across payments. Any verified human who sees the QR can approve. The QR is shown only on the owner-authenticated dashboard. Binding the approver with World session proofs is a stretch goal.
- **What the human sees.** World App shows our free-text description, not a typed payment. The binding is cryptographic (action = intent hash), but the human trusts the dashboard for amount and payee. See `WORLD_DEBRIEF.md`.
- **Pending state is in memory.** Pending intents, the World replay store and the "paid before" set live in the server process. A restart drops pending approvals (fails safe: nothing pays), forgets earlier payees (fails safe: `NEW_PAYEE` fires again), Every decision is on Arkiv as `sb.payment`, and since the QA cycle the server reloads them at startup, so `GET /api/payments` and `pay_status` survive a restart (a stale pending approval shows as expired). The "paid before" set is not rebuilt, which fails safe.
- **An Arkiv write failure doesn't block a payment.** The decision is still made and emitted, and the failure is logged. The audit trail can have a gap.
- **Vendor names live under our team name** for the demo, so the team owner could re-point them. In production, vendors bring their own `.eth`.
- **Shared testnet burners.** During the hackathon the owner and agent burner keys were shared between the two developers by hand. They are testnet-only and must never hold real value.
- **Out of scope:** malware on a developer laptop (the Binance way in), and a compromised owner key.

## 7. Token and pairing review (MCP agent tokens, reviewed 2026-11-06)

**Design.** Token = `base64url("<label>|<exp>|<hmac>")`, where `hmac = HMAC-SHA256(TOKEN_SIGNING_SECRET, "v1|<label>|<exp>")` (`apps/server/src/auth/tokens.ts:14–21`). It goes in `Authorization: Bearer` or, for clients that can't send headers, in the path `/mcp/t/<token>` (`mcp/routes.ts:54–55`). A token only authenticates the client. What the agent may *do* is decided live by ENS on every call.

**Verified OK:**
- **HMAC:** SHA-256 with a version and domain prefix (`v1|`).
- **Comparison:** constant-time (`timingSafeEqual` after a length check, `tokens.ts:32–34`).
- **Expiry:** inclusive, checked after the signature. Unknown agents are rejected after the signature too.
- **Input limits:** labels can't smuggle the `|` separator (`^[a-z0-9-]{1,63}$`). Input is base64url-only and capped at 512 chars.
- **Secret strength:** the server won't start with a secret under 32 chars (`readEnv` → `EnvSchema`).
- **Failure responses:** 401 with `WWW-Authenticate`, and the token is never echoed (`mcp/auth.ts:19–23`).
- **Host allowlist (DNS-rebinding):** only localhost plus the `PUBLIC_BASE_URL` host is accepted; anything else gets 403. MCP returns 503 when the secret or ENS isn't configured (`app.ts:34–40`).
- **`whoami` fails closed:** an ENS read error is an error, and a killed agent reports `canWrite: false` even with a valid token (`mcp/server.ts:39–54`).
- **Body limit:** JSON bodies are capped at 64 KB.

**Findings.** Each confirmed finding is a test in `apps/server/src/mcp/security-review.test.ts`, marked `it.fails` until it's fixed. All are filed under Requests (B → A).

| # | Severity | Finding | Fix suggested |
|---|---|---|---|
| F1 | **High** | **Path token leaks into the server log.** Express matches routes case-insensitively, so `/MCP/T/<token>` authenticates (200), but `redactTokenPath` only matches lowercase `/mcp/t/`, so the raw credential is logged. | Redact from the matched route (`req.params.token`) instead of a regex, or make the regex case-insensitive. Better: log `req.route.path` plus the agent label only. |
| F2 | Medium | **Unauthenticated stack trace.** A malformed JSON body returns Express's HTML error page with a stack trace and local file paths (`express.json` runs before auth). | Add an error handler after `express.json` that returns a JSON-RPC `-32700` parse error with no stack. Run with `NODE_ENV=production`. |
| F3 | Low | **Log forging.** `clientInfo.name` and `version` (authenticated client) go into the log line unsanitised, so a newline forges a second line. | Strip control characters and cap the length before logging and before storing for the dashboard. |

**Design notes** (no test; under Requests):
- **D1:** no per-token revocation. Tokens live 7 days, and the only kill switches are ENS unregister (stops writes and payments) or rotating the secret (kills every token). When `recall` lands, it must also check ENS status, or a leaked token can **read** team memory for up to 7 days.
- **D2:** tokens aren't bound to a deployment. Two servers sharing a secret accept each other's tokens. Suggested fix: MAC `v1|<appNamespace>|<label>|<exp>`. **Accepted for the event** (QA cycle 2026-11-06): changing the MAC now would invalidate every client already paired with Claude Code, Claude.ai and Antigravity the night before judging. Mitigation: a distinct `TOKEN_SIGNING_SECRET` per server. Fix after the event.
- **D3:** path tokens also live in tunnel request inspectors (the ngrok inspector records full URLs) and in client settings. Run ngrok with inspection off, and consider a shorter TTL for path tokens.
- **D4:** 401 descriptions distinguish `expired` from `bad_signature`, which confirms an old token was genuine. Minor; acceptable.

## 8. Reporting

This is a hackathon project on testnets. If you find a problem, open a private security advisory on the GitHub repository (Security → Report a vulnerability), or an issue that doesn't include exploit details. Please don't test against other people's funds or names.
