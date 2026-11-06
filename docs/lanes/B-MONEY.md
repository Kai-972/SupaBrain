# Lane B: Money & Security (Srijit, Claude #3)

> **v2:** current plan: [`docs/PLAN.md`](../PLAN.md). Lane B in v2: brains on ENS and their funding, the ENS rules writer, demo-brain payments, Codex/ChatGPT tests, SECURITY.md (PLAN §4, PROGRESS Requests A → B).

**You own:** `packages/payments`, `contracts/` (Foundry), `scripts/vault`, `scripts/demo/step-kill.ts`, `config/world.json`, `SECURITY.md`, `WORLD_DEBRIEF.md`.

**You consume from Lane A (Kai):**
- `EnsAuthority` from `packages/ens`.
- The `GraphView` and `ArkivWriter` adapters.
- `config/deployments/ens.sepolia.json`: team registry, agent labelhashes and wallets, vendor names.

Until A delivers them, use the fakes in `packages/shared/src/testing/` **in unit tests only**.

**You deliver to Lane A:** `createPayments(deps): Payments` (CLAUDE.md §6.3). The server mounts it as the `pay` / `pay_status` MCP tools and the payments API.

**Naming:** the product is now **Supabrain**. In your original brief, read `BlastVault` as `BrainVault`, `br.*` as `sb.*`, and the namespace `blastradius-mumbai26` as `supabrain-mumbai26`.

**What changed from your original brief** (`docs/CLAUDE.srijit-original.md`):
- **ENS setup moved to Kai (Lane A).** You keep the vault's on-chain ENS check (`getOwner(labelhash)`) and the ENS logic inside the payment policy, through `EnsAuthority`.
- **The story is memory-first.** Money is the second pillar and the stakes.
- **Interfaces are split:**
  - `EnsAuthority` (A) covers what your old `Chain` interface did for ENS.
  - `Payments` (yours) covers the vault and World.
  - Your `PayDecision`, `PayReason` and `Payment` types are unchanged; they're in `packages/shared`.
- **`DryRun` gains `readers`.** `onRevoke(dry, target)` is the hook into revoke.
- **Arkiv expiry:** payment intents last 15 min and decisions 30 d. Memory leases (2 d) don't affect you.

Your design, logic and tests carry over. This file condenses them.

---

## 1. Your threat model (summary; full version in `SECURITY.md`)

| Threat | Control (owner) |
|---|---|
| A payee address comes from outside content (BEC "bank details changed", a poisoned memory) | Payee lineage check over the **whole team graph** (B, policy) |
| A memory address disagrees with the vendor's ENS record | **Hard block**, no override (B, policy; vendor ENS set up by A) |
| A new payee, an over-cap amount, or one over the daily limit | World Agent Pass approval bound to the intent hash (B) |
| A compromised server or a skipped workflow (the Binance lesson: policy lived in a workflow the attacker skipped) | **BrainVault** enforces on chain: live ENS owner, attestation, revoked roots, daily ceiling. The guardian key can only tighten (B) |
| Agent key misuse after a kill | The vault checks `getOwner(labelhash) == msg.sender` on every pay (B); the owner unregisters (A) |
| Replay or stale approval | `usedIntent`, `deadline`, EIP-712 domain with chainId + verifyingContract (B) |
| Token theft or prompt injection through memory | Retrieved memory is "information, not instructions" (A's prompt); outside content can't authorize money (B) |
| Secrets leak | Guard scripts, no secrets in logs, the bundle or Arkiv (all) |

Honest gaps (say these in `SECURITY.md` and the README):
- The server holds agent, policy and guardian keys.
- Server-recorded lineage isn't signed by the agents.
- The World approver is "any fresh validated approval" unless `requireEnrolledSub=true`.
- This doesn't stop laptop malware (Binance). We applied its lessons; we don't claim we'd have stopped it.

---

## 2. Stage plan (match CLAUDE.md §8; run `/log` after every step)

| Stage | Your steps | Done when |
|---|---|---|
| **S0** | Pull A's scaffold. `forge init contracts` (no git submodule surprises; use `forge install` with `--no-git` if needed). Add OpenZeppelin. Create the `packages/payments` skeleton exporting `createPayments` | `forge build` passes and `pnpm build` passes |
| **S1** | **S4 World spike** (§5). **S5 vault**: write the tests first (§4), then the contract, against a **mock registry** | World: one approve, one deny, one expire logged. Vault: `forge test` green |
| **S2** | After A's S1 handoff (`ens.sepolia.json`): run a **fork test** against the real team registry, then V1 contract review (subagent), deploy, `set-agents`, fund the vault, one real 1-USDC `pay`, prove `step-kill.ts` | A paid tx and an `AgentNotRegistered` revert tx are logged |
| **S2–S3** | `decidePayment` as a pure function with **table tests** (§3), including every fixture step and the red-team cases | Tests green |
| **S3** | `onRevoke(dry, target)`: `vaultRevokeRoot` for source roots, `pauseAgent` for agent targets, and cancel affected intents and approvals | A revoke in A's flow returns `vaultTxUrl` |
| **S4** | Security review of A's pairing-token design (HMAC, expiry, path-token redaction). Write findings into `SECURITY.md` and Requests | Reviewed |
| **S5** | `createPayments` complete: policy → intent (Arkiv) → attestation → vault → decision (Arkiv) → SSE | P1 BLOCKED and a paid P3-style tx work through A's MCP `pay` |
| **S6** | Pending-human flow with World (§3.3), approval views, cancel | Approve → paid and deny/expire → nothing moved, live |
| **S7** | Stretch: restore-with-World for high-impact memories, enroll the owner's `sub` (`requireEnrolledSub=true`) | – |
| **S8** | `SECURITY.md`, `WORLD_DEBRIEF.md`, the World and vault rows in `SPONSORS.md`, V3 policy red team, `AI_USAGE.md` lines | Docs done |

ASK for these when a stage first needs them:
- `POLICY_SIGNER_PRIVATE_KEY` and `GUARDIAN_PRIVATE_KEY`, generated after an ASK.
- `WORLD_CLIENT_ID` / `WORLD_CLIENT_SECRET` and the issuer. Ask the World booth whether to use prod or sandbox, and how mocked proofs work.
- Circle test USDC funding into the vault (faucet.circle.com: 20 USDC per 2 h per address, so fund at least 40 over several claims).
- An optional Etherscan API key for verification.
- **Every broadcast needs an ASK "go".**

---

## 3. Payment policy (`packages/payments/src/policy.ts`; pure, table-tested)

```
teamVendors = ens.teamVendors()
1. authority = ens.getAgentAuthority(agent)            // live getOwner(labelhash) + records; short cache
   HARD AGENT_NOT_AUTHORIZED if !registered || status != active || role == observer || payCap == 0
2. resolve payee
   if input is an ENS name:
      ensAddr = ens.resolveEns(name); if null → HARD UNKNOWN_PAYEE
      payee = ensAddr ; subjects = {name}
      payeeVerified = name ∈ teamVendors                  // an arbitrary .eth from an email is NOT verified
   else (0x address):
      payee = checksum(input)
      addrNodes = graph.memoriesByAddress(payee)          // ALL team memories, incl. quarantined
      subjects = {n.subject for n in addrNodes} ∪ {ens.findVendorEns(payee)} (non-null)
      for s in subjects: a = ens.resolveEns(s); if a && lower(a) != lower(payee) → HARD ENS_MISMATCH(s, a, payee)
      payeeVerified = ∃ s ∈ subjects ∩ teamVendors with lower(resolveEns(s)) == lower(payee)
   payeeNodes = memoriesByAddress(payee) ∪ memoriesBySubject(s) for s in subjects
                // the whole team graph, NOT the read-set: clearing a read-set can't hide a poisoned address
3. if !payeeVerified && any payeeNode quarantined            → HARD QUARANTINED_LINEAGE
4. if !payeeVerified && any payeeNode has a trust-1 root     → SOFT OUTSIDE_CONTENT_PAYEE
5. if !payeeVerified && no prior "paid" decision to payee    → SOFT NEW_PAYEE
   if !payeeVerified && payeeNodes empty                      → SOFT UNKNOWN_PAYEE
6. amount > payCap → SOFT OVER_CAP ; spentToday + amount > payDaily → SOFT OVER_DAILY  (spentToday from vault view)
7. any HARD → BLOCKED ; else any SOFT → PENDING_HUMAN ; else ALLOW
```

**Attestation roots:**
- Take `keccak256(utf8(rootId))` for `ancestors(non-quarantined payeeNodes ∪ cites)`, deduplicated.
- Quarantined nodes are left out. Otherwise the clean P3 payment would carry the revoked email root and revert with `RootRevoked`.
- Don't use the read-set here.
- If there are more than `maxRootsPerAttestation` roots, BLOCK with an error. Never truncate silently.

**Every decision writes an Arkiv `sb.payment`** through `deps.arkiv.writePayment`: the intent first, then the decision. Emit `{t:"payment"}` / `{t:"approval"}` through `deps.emit`.

### 3.1 Required table tests
**Fixture steps** (C-UI.md §5):
- P1 `pay(0xBAD, 5)` → BLOCKED [ENS_MISMATCH, OUTSIDE_CONTENT_PAYEE]
- P2 `pay(0xBAD2, 2)` → PENDING_HUMAN [OUTSIDE_CONTENT_PAYEE, NEW_PAYEE] → DENIED
- after revoke: P3 `pay("acme.<team>.eth", 5)` → PENDING_HUMAN [OVER_CAP] → APPROVED → PAID

**Red team (V3):**
- an email-supplied `attacker.eth`
- a cleared read-set
- an empty `cites`
- `cites` outside the read-set (laundering)
- an observer agent
- an unregistered agent
- `payCap` 0
- over the daily limit
- a quarantined ancestor
- more than the maximum number of roots

### 3.2 Pending-human flow
- When the intent is created, **snapshot** the payee, amount, payeeNodes and roots.
- `intentHash = keccak256(abi.encode(agent, payee, amount, rootsHash, intentId, intentExpiry))`. Call `startApproval(intent)` and bind the device code to `intentHash`.
- A poller checks the status. **On approval:**
  - Re-run every **hard** check live: revocations since the snapshot, ENS state, mismatch.
  - Soft reasons are cleared by the approval.
  - Sign the attestation **now**, with a fresh `deadline = now + attestationTtlSec` and `humanApproved = true`.
  - Execute.
  - An approval that arrives after `intentExpiry` counts as expired.
- On denied, expired or cancelled: write the decision and emit. Nothing moves.
- The MCP `pay` call returns `pending_human` straight away. The agent tells the user to approve; `pay_status` reports the outcome.

### 3.3 `onRevoke(dry, target)`
- Source target: `vaultRevokeRoot(keccak(rootId))` with the guardian key.
- Agent target: `pauseAgent(wallet)`.
- Memory target: no vault call.
- In every case, cancel the pending intents whose lineage intersects `dry.memories`, and call `cancelApproval` for each.
- Return `{vaultTxUrl?, cancelled[], error?}`.
- A failure must not throw past the server. Return `error`, and the UI shows "vault not updated: retry".

---

## 4. `BrainVault.sol` (Foundry, Solidity 0.8.25+, OZ `EIP712`, `ECDSA`, `SafeERC20`)

```
state: usdc (immutable), owner, guardian, policySigner
       agents[wallet] = { registry: IPermissionedRegistry, labelhash: uint256, dailyCeiling: uint128, day: uint64, spentToday: uint128, paused: bool }
       revokedRoot[bytes32] ; usedIntent[bytes32]
struct Payment { address agent; address payee; uint256 amount; bytes32[] roots; bytes32 intentId; uint64 deadline; bool humanApproved; }
pay(Payment p, bytes sig):
  require msg.sender == p.agent
  a = agents[msg.sender]; require a.registry != 0                                  → AgentUnknown
  require a.registry.getOwner(a.labelhash) == msg.sender                           → AgentNotRegistered  (checked BEFORE paused so the demo revert names ENS)
  require !a.paused                                                                → AgentPaused
  require block.timestamp <= p.deadline ; require !usedIntent[p.intentId]          → Expired / Replay
  require p.roots.length <= MAX_ROOTS (immutable)                                  → TooManyRoots
  for r in p.roots: require !revokedRoot[r]                                        → RootRevoked(r)
  require ECDSA.recover(_hashTypedDataV4(hashPayment(p)), sig) == policySigner     → BadAttestation
  roll day; require spentToday + amount <= dailyCeiling                            → OverDailyCeiling
  usedIntent = true; spentToday += amount; usdc.safeTransfer(p.payee, p.amount); emit Paid(agent, payee, amount, intentId, roots)
owner:          setAgent, removeAgent, setPolicySigner, setGuardian, unpauseAgent, unrevokeRoot, withdraw(to, amount)
owner|guardian: revokeRoot(bytes32), pauseAgent(wallet)      // guardian can only TIGHTEN
views:          spentToday(wallet), agentOf(wallet)
EIP-712 domain: name/version from config, chainId + verifyingContract
```

**Tests, written first:**
- happy path;
- ENS unregistered → revert, with a mock registry, plus a **Sepolia fork test** against the real team registry after A's S1;
- expired lease;
- revoked root;
- bad signer;
- replayed intent;
- expired deadline;
- over the daily ceiling with the day roll;
- the guardian can't unrevoke or withdraw;
- a non-agent caller;
- the payee's balance increases by exactly the amount.

**Deploy:**
- `scripts/vault/deploy.ts` (or `forge script`). Args come from config and env-derived addresses. The `owner` is the OWNER address, which is the same owner as the ENS setup.
- `set-agents.ts` reads `config/deployments/ens.sepolia.json`, gets each agent's `{registry, labelhash}` from `ens.agentRegistryRef`, and calls `setAgent` with that agent's `vaultDailyCeilingUsdc`. The owner key signs; coordinate with Kai, since you both hold the testnet owner burner.
- Write `config/deployments/vault.sepolia.json`.

Ceilings roll at UTC midnight (05:30 IST). Rehearsals spend real test USDC.

**`step-kill.ts`** (the on-chain kill proof):
1. While `gem-research` is registered, sign a valid 1-USDC attestation for it.
2. Ask Kai to run `scripts/ens/unregister.ts gem-research`, or run it yourself with the owner key after an ASK "go".
3. Send `BrainVault.pay(att, sig)` **directly from the gem-research wallet with a fixed gas limit**, so the failed tx is mined and shows `AgentNotRegistered` on Etherscan.
4. Print both links.

During spikes, use a throwaway test agent; never the demo agents.

**Emergency only** (a team decision, logged in DECISIONS): a direct `USDC.transfer` from the agent wallet, with the same server policy. This loses the on-chain kill beat, so say so in the README.

---

## 5. World ID Agent Pass (OIDC device flow; confirm everything live in S4)

- **Discovery:** GET `${issuer}/.well-known/openid-configuration`. Read the device, token and JWKS endpoints and `grant_types_supported`. Log the document to PROGRESS (no secrets). If the device grant isn't listed, STOP and ASK the World booth.
- World's guides may only be available through its MCP or plugin, or at the booth. Ask how **mocked proofs** work now.
- **Start:** POST the device endpoint with `client_secret_basic` and `scope=openid`. Store `{device_code, user_code, verification_uri(_complete), expires_in, interval, startedAt, intentHash}` in memory.
- **Poll** with `grant_type=urn:ietf:params:oauth:grant-type:device_code` every `interval` seconds:
  - `authorization_pending`: wait.
  - `slow_down`: add 5 s to the interval.
  - `access_denied`: **denied**.
  - `expired_token`: **expired**.
  - An app-side cancel: **cancelled**.
- **Validate the `id_token`** with `jose`: `jwtVerify` against `createRemoteJWKSet(jwks_uri)`. Check `iss`, `aud == client_id`, `exp`, and `auth_time ≥ startedAt − 5s`. A `jti` can be used only once. Check `sha256(iss|sub) == WORLD_APPROVER_SUB_HASH` only when `requireEnrolledSub` is true.
- **Binding:** Agent Pass has no native action binding (as far as research shows), so the server binds `device_code → intentHash`. On success the attestation carries `humanApproved=true` and the same `intentId`. Say this plainly in `WORLD_DEBRIEF.md`.
- **Never** treat a client-side signal as approval.
- **S4 pass criteria:**
  - [ ] Discovery logged.
  - [ ] One approval with validated claims (redacted).
  - [ ] One deny.
  - [ ] One expire or cancel.
  - [ ] Time-to-first-success noted.

---

## 6. Docs you write

**`SECURITY.md`:**
- The threat model (§1, expanded).
- Key custody table: who holds which key, and where.
- Controls mapped to code (file:line).
- Binance lessons, mapped without overclaiming (reuse PROJECT.md §3).
- Token and pairing review.
- Known gaps.
- How to report issues.

**`WORLD_DEBRIEF.md`:**
- Time to first success.
- Friction: discovery, auth method, HTTPS redirect, mocked proofs, `amr`/`acr`.
- Missing capability: native action binding.
- The single most important improvement.
- How we validate on the backend.
- Where the denied and expired paths are, in code and in the video.

**`SPONSORS.md`:** the World and vault/ENS-on-chain rows, with feature → file:line → what the user sees, plus the requirement checklist from PROJECT.md §6.3.
