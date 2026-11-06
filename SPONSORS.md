# Sponsors

<!-- Per sponsor: what breaks without it · feature → file:line → what the user sees · requirement checklist with evidence · video timestamp. -->

## ENS: Best Use of ENSv2
### What breaks without it
Without ENS the server cannot tell who an agent is or what it may spend (caps are read live from ENS records), vendor payout addresses fall back to whatever an email says, and BrainVault has no kill switch (`getOwner(labelhash)` on the team registry).
### Feature → file → what the user sees
| ENSv2 feature | Where | What the user sees |
|---|---|---|
| Own subname registry (UserRegistry via VerifiableFactory, `setSubregistry`) | `scripts/ens/deploy-team-registry.ts` · `config/deployments/ens.sepolia.json` `teamRegistry` | `lead-claude.supabrain.eth`, `gem-research.supabrain.eth`, `gpt-writer.supabrain.eth` in the agents rail |
| Per-agent Permissioned Resolver with setter-scoped grants | `scripts/ens/add-agent.ts` (`grantSetterRoles`) · `packages/ens/src/roles.ts` | An agent can set exactly one key (`sb.memory.head`); raising its own `sb.pay.cap` **reverts on chain** (proof tx in `config/deployments/ens.sepolia.json` → `gem-research.txs.proofSetPayCapReverted`) |
| Expiring, non-transferable, revocable names | `scripts/ens/add-agent.ts` (lease, roleBitmap 0) · `scripts/ens/unregister.ts` | Lease countdown; **unregister → `getOwner = 0x0`, name resolves to null** (throwaway proof: `test-agent.txs.unregister`) |
| Enhanced Access Control roles | `packages/ens/src/roles.ts` · `scripts/ens/deploy-team-registry.ts` | Owner holds register/renew/unregister/set-resolver; agents hold none |
| Rules as records, read live | `packages/ens/src/authority.ts` (`createEnsAuthority`) · `scripts/ens/status.ts` | Agent card shows "pay cap 4 USDC · from ENS"; changing the record changes behaviour with no redeploy |
| ENSIP-26 `agent-context` (`agent-endpoint[mcp]` once hosted) | `scripts/ens/add-agent.ts`, `scripts/ens/set-records.ts` | Any ENS client can discover the agent |
| On-chain composability | `contracts/src/BrainVault.sol` (Lane B) calls `getOwner(labelhash)` | Unregister an agent and its next payment reverts on chain |
### Requirement checklist
- [x] Built on ENSv2 on Sepolia (config from the official deployments page, verified on chain: `pnpm run ens:verify`)
- [x] ENSv2 central, not cosmetic (identity, rules and the kill switch are ENS)
- [x] No hard-coded values (`pnpm lint:hardcode`; addresses/keys/caps from config, deployments file and live reads)
- [x] Open source repo
- [ ] Live demo link (needs hosting)
- [ ] Video timestamp

### ENS × money: BrainVault checks ENS on chain (Lane B)
The vault, not our server, decides whether an agent may still spend: every `pay` asks the team's ENSv2 registry who owns the agent's name.

| Feature | Code (file:line) | What the user sees · proof |
|---|---|---|
| Live ENS ownership on every payment: `getOwner(labelhash) == msg.sender` | [`contracts/src/BrainVault.sol:146`](contracts/src/BrainVault.sol#L146) | Unregister an agent and its very next payment reverts. Sepolia: unregister [0xe89f…6fc7](https://sepolia.etherscan.io/tx/0xe89f464acea50e816ca326308f0d3c5206eb9cb43ea6c92daa343adb9e126fc7) → **`AgentNotRegistered` mined revert** [0x516b…4579](https://sepolia.etherscan.io/tx/0x516b96da3c4df023563178a2a2f71cb6d351b48abcc945d8d09d3380d53e4579) (`scripts/demo/step-kill.ts`) |
| Each vault agent = `(team UserRegistry, labelhash)` from the ENS deployment file | [`scripts/vault/set-agents.ts:28–41`](scripts/vault/set-agents.ts#L28) | 3 `setAgent` txs on Sepolia, e.g. lead-claude [0x3990…0134](https://sepolia.etherscan.io/tx/0x399031897064938351af533681476bf3d561f09f490d2e75f5cc6c604bf40134); `pnpm vault:status` shows "ENS getOwner = wallet ✓" |
| Per-payment caps read live from ENS records (`sb.pay.cap`, `sb.pay.daily`), not config | [`packages/payments/src/policy.ts:110`](packages/payments/src/policy.ts#L110), [`:193`](packages/payments/src/policy.ts#L193) | Over-cap → "PENDING HUMAN · OVER_CAP cap 4 (from ENS)"; change the record, behaviour changes with no redeploy |
| Vendor payout address from ENS beats any address in memory | [`policy.ts:148–155`](packages/payments/src/policy.ts#L148) | `pay(0xBAD…)` → **BLOCKED · ENS_MISMATCH** with the email → memory → plan path highlighted |
| Fork test against the real `supabrain.eth` registry | [`contracts/test/BrainVaultFork.t.sol`](contracts/test/BrainVaultFork.t.sol) | 4/4 on live Sepolia state: owners match, registered agent pays, unregistered `test-agent` and an impostor revert |
| Revoke reaches the vault: `onRevoke` → guardian `revokeRoot`, and a payment carrying that lineage is refused **on chain** | [`engine.ts:279–296`](packages/payments/src/engine.ts#L279), [`BrainVault.sol:156`](contracts/src/BrainVault.sol#L156) | Revoke `email:acme-0611` → [revokeRoot tx](https://sepolia.etherscan.io/tx/0x7083d77c6266ac8afb64021d1899eb1ac7f6dd94298fafcff8153659fd983137). A valid policy-signed pay carrying that root → [`RootRevoked` mined revert](https://sepolia.etherscan.io/tx/0x7e589a3ce39efbf3bb0f964c6f13a1cfc3d852a29e7b0a337c9521e77a70ddd4) |
| World-approved payment, live | [`engine.ts:189–209`](packages/payments/src/engine.ts#L189) | [P3 PAID: 5 USDC to `acme.supabrain.eth`](https://sepolia.etherscan.io/tx/0x7b983ad5aafadce22a1fdd98da09a3710be64be673f96c39602c5663de517528), `humanApproved=true` |
| **Disputed by ENS** (answers Supermemory's latest-wins): a memory that claims an address for a team vendor that differs from the vendor's own ENS record is flagged on read | [`apps/server/src/engine/conflict.ts`](apps/server/src/engine/conflict.ts), surfaced in `recall`/`remember` text and `/api/graph` + `/api/memory/:key` (`dispute`) | Gemini saves the email's address and is told at once: "DISPUTED by ENS: acme.supabrain.eth's own ENS record says 0xf15f…". Live on the `-b` namespace: E1 and M1 disputed after a rebuild from Arkiv |
| Deployed vault | [`config/deployments/vault.sepolia.json`](config/deployments/vault.sepolia.json) | [`0x2da7…0ec8`](https://sepolia.etherscan.io/address/0x2da794b8dd00afc970b372d7cf960ecd1f190ec8), first real 1-USDC payment [0x9ab2…06ae](https://sepolia.etherscan.io/tx/0x9ab200485f3fbf0c5f39a832d9c19a00e31cfaab0b04d1d52009f6c7f2a806ae) |

### v2: brains as ENSv2 subname registries (Lane B, 2026-11-06)
| ENSv2 feature | Our use | Code | Proof |
|---|---|---|---|
| **A subname registry per project** | Each brain is its own `UserRegistry` under `supabrain.eth` (`otter.supabrain.eth` … `tundra.supabrain.eth`, 10 live). Inside it, one name per AI family: `claude` / `gemini` / `openai.<brain>.supabrain.eth` | `scripts/ens/provision-brains.ts`, `packages/ens/src/brains.ts` | 111 Sepolia txs in `config/deployments/brains.sepolia.json`; `pnpm ens:brains-status` ✓ 10 brains / 30 names |
| **Enhanced Access Control, set only at registration** | On each brain registry, the server's team key holds register, renew, unregister and set resolver (+ admins), and so does the offline owner. On the brain name, the team key holds renew only. The AIs hold no roles | `BRAIN_REGISTRY_ROLES`, `BRAIN_TOKEN_ROLES` (pinned by tests) | `checkBrainOnChain` reads every bitmap back |
| **A per-name Permissioned Resolver with scoped setters** | One resolver per AI. The team key may set text (rules); the AI's own wallet may set only `sb.memory.head` | `packages/ens/src/brains-chain.ts` | status check: "AI can set only its memory head" |
| **Text records as live rules** | `sb.status` (active/paused), `sb.scope` (path prefix), `sb.write.daily`, `sb.role`, read on **every** MCP call. A broken rule is refused with the rule named (`SCOPE`, `RATE_LIMIT`, `NOT_AUTHORIZED`) | `packages/ens/src/authority.ts`, `apps/server/src/memory/continuity-service.ts` | `apps/server/src/memory/guard.test.ts`; live: `openai.otter` paused + scoped and restored (Sepolia `0x5f46ebed…`, `0x4bdc5a01…`) |
| **Rules written from the website (sponsored gas)** | `POST /api/brains/:id/rules` → `createRulesWriter`: finds the resolver live, writes only the changed keys in one multicall, waits for the receipt | `packages/ens/src/rules.ts` | 25 tests; `pnpm ens:brain-rules` |
| **Refs on ENS, objects on Arkiv** | After each confirmed commit, the AI's ENS name gets `sb.memory.head = <Arkiv entity key>`. Anyone can resolve `claude.otter.supabrain.eth` → the newest commit → walk its lineage on Arkiv without our server | `apps/server/src/ens-heads.ts`, `GET /api/brains/:id/heads` | `apps/server/src/ens-heads.test.ts` |
| **`addr(60)` = the AI's signing wallet** | The Arkiv `$creator` of every commit must equal the address ENS gives for that AI. `pnpm verify:memory` checks this with no server | `scripts/arkiv/verify-lib.ts` | |

## Arkiv: Build on Arkiv from scratch
### What breaks without it
Supabrain's whole point is that a team's AIs share one memory they can all read and nobody can quietly edit. Arkiv is that store: entities signed by each agent's own wallet (`$creator`), owned by the team wallet (`$owner`), readonly so nobody can rewrite a memory, and expiring on their own so an unconfirmed lie fades. Without Arkiv we would need a database we run and everyone has to trust, and "who wrote this" would be a column we could change.

### Feature → file:line → what the user sees
| Feature | Code | Proof so far (S1 spike, real Rabdi txs) |
|---|---|---|
| Agent-signed write, then handover to the team in one tx | [`packages/arkiv/src/writer.ts`](packages/arkiv/src/writer.ts), [`scripts/arkiv/spike.ts`](scripts/arkiv/spike.ts) `s2` | [tx](https://rabdi.explorer.arkiv.network/tx/0xbb26837a9202ef13184f19dd96e54d84ea5fd7353979723dafa51a0ebc023626): `$creator` gem-research ≠ `$owner` team |
| Memory + 2 edges + 2 taints in one atomic batch | `spike.ts` `s3`, [`schemas.ts`](packages/arkiv/src/schemas.ts) | [tx](https://rabdi.explorer.arkiv.network/tx/0x2eebd1878ee1b2076b20e8fec0b49559fcc2b4238c71d0c998f1294fe8c8ee34): 10 ops, 742k gas |
| Revoke lookup: `taint.root = X` | `spike.ts` `s4` | returns exactly the memories derived from X |
| Keep (owner extends a readonly memory + its edges and taints) | `spike.ts` `s5` | [tx](https://rabdi.explorer.arkiv.network/tx/0x3853419d2c1adc070e93d22b373402e5764291557e6790c4a70bd77ef3f81224): 5 rows extended in one batch |
| Lies fade by themselves | `spike.ts` `s7` | [tx](https://rabdi.explorer.arkiv.network/tx/0x73c0ea659ab06f5bd2130b04c2d8859fd517ca00a0f72600a18e9fd35b58df98): gone from queries at its exact expiry block |
| Live watcher | `spike.ts` `s6` | create + transfer events received |

### Requirement checklist
- [x] Built on Arkiv from scratch, SDK `@arkiv-network/sdk` 1.0.1, Rabdi chain 7794095 (new `packages/arkiv`)
- [x] `arkiv/friction.md` written as things happened (8 entries so far: reserved attribute names, hidden SDK types, empty registry code, receipt-polling latency, chain-wide watcher, a Node warning, an unhelpful catch-all error, plus what was confirmed as documented)
- [x] `arkiv/schema.md`, `arkiv/how-you-use-arkiv.md` (with a runnable query: `pnpm arkiv:query`)
- [x] `arkiv/why-arkiv.md`, `arkiv/reach.md` (live counts via `pnpm arkiv:reach`: 4 signing wallets across 3 AI vendors, 67 + 38 live entities on 2026-11-06)
- [x] Verify without us: `pnpm verify:memory <key>` checks a memory's whole lineage against Arkiv `$creator` + ENSv2 `getOwner` only (live: 5/5 hops verified, 4 revoked)
- [ ] README wallet-address table (S8, generated from `config/deployments/arkiv.rabdi.json`)
- [x] Server reads the UI's data from Arkiv: the graph is rebuilt from Arkiv at startup and kept current by `watchEntityEvents` (`apps/server/src/memory/sync.ts`, `arkiv/store.ts`); a restart rebuilt everything from the chain alone
- [ ] Video timestamp

### v2: commits, stops and funding on Arkiv (Lane B, 2026-11-06)
| Arkiv feature | Our use | Code |
|---|---|---|
| `$creator` per write | Every brain commit is signed by that AI's **own derived wallet** (30 wallets funded with 0.33 tGLM each from a separate funder; cost measured from real receipts: ≈ 52k + 77.5 gas per byte) | `scripts/brains/write-cost.ts`, `scripts/brains/fund-brains.ts`, `apps/server/src/brain-mode.ts` |
| Attributes + queries | Arkiv `team` = the brain label, so each brain is its own queryable history; the server rebuilds each brain from Arkiv at startup | `apps/server/src/arkiv/store.ts` |
| Team-signed, long-lived revocations | A relayed prompt injection is **saved as evidence** (signed by the AI that relayed it) and **revoked at once** by the team wallet: it and everything under it is stopped for every AI, and the revocation outlives it | `apps/server/src/engine/guard.ts`, `apps/server/src/app.ts` (`onStop` → `undo.revoke`) |
| Expiry | Brain data expires with the project (2-day lease unless kept); quarantined data is never extended | `config/app.json` `arkivExpirySec` |

## World: World ID (human approval for agent payments)
### What breaks without it
"A human approved this payment" would be a button: anyone with dashboard access, or a compromised agent driving the dashboard, could click it. With World, money that needs a human moves only after a **real, unique human** proves it in World App for **that exact payment**. The proof is checked on our backend and by World's verify API, and bound to the payment's intent hash. Our policy decides when a human is needed: a payee from outside content, a new payee, or an amount over the agent's ENS cap. The agent can't skip it or trigger it itself.

**How we integrate:** World ID 4 through IDKit core (`@worldcoin/idkit-core@4.6.0`), following World's Human-in-the-loop pattern for agents. The OIDC device flow at auth.world.org is also built and tested as a fallback, but its portal needs an enterprise Google Workspace account (see `WORLD_DEBRIEF.md`).

### Feature → file:line → what the user sees
| Feature | Code (file:line) | What the user sees · proof |
|---|---|---|
| **Action = the payment.** Each intent gets its own action `supabrain-pay:<intentHash>`; the server signs the RP context for it | [`world/humanApproval.ts:106`](packages/payments/src/world/humanApproval.ts#L106), [`:120`](packages/payments/src/world/humanApproval.ts#L120), [`world/idkitAdapter.ts:10`](packages/payments/src/world/idkitAdapter.ts#L10) | One approval can never be reused for another payment (fresh nullifier per intent) |
| Intent hash binds agent, payee, amount, lineage roots, intent id, expiry | [`vault/attestation.ts:51`](packages/payments/src/vault/attestation.ts#L51), [`engine.ts:236`](packages/payments/src/engine.ts#L236) | The approval card shows payee ENS name + resolved address + amount |
| World App link/QR from a Node backend, polled server-side | [`idkitAdapter.ts:16`](packages/payments/src/world/idkitAdapter.ts#L16), [`humanApproval.ts:247`](packages/payments/src/world/humanApproval.ts#L247) | "PENDING HUMAN" card with QR; MCP `pay` returns `pending_human` at once |
| **Backend validation, fail closed:** action, our nonce, pinned environment, `signal_hash == hash(intent)`, allowed credential, then `POST /api/v4/verify/{rp_id}`, then the nullifier consumed once | [`humanApproval.ts:165–235`](packages/payments/src/world/humanApproval.ts#L165) | A proof for another payment, a staging proof or a replay is rejected (46 tests; mutants on action/signal/replay all caught) |
| After approval, every hard check runs again live, then a fresh EIP-712 attestation with `humanApproved=true` | [`engine.ts:189–209`](packages/payments/src/engine.ts#L189), [`:147`](packages/payments/src/engine.ts#L147) | Re-pointed vendor ENS or a killed agent still blocks after approval; `Paid` event carries `humanApproved=true` (anvil e2e) |
| **Deny / expire / cancel → nothing moves** | [`humanApproval.ts:282–284`](packages/payments/src/world/humanApproval.ts#L282), [`engine.ts:173–179`](packages/payments/src/engine.ts#L173) | Live: reject in World App → `DENIED` (`verification_rejected`); app-side cancel → `CANCELLED` |

**Live runs** (production World App, `pnpm --filter @supabrain/payments world:spike`, 2026-11-06): approve ×3 (111 s, 85 s, 99 s; `proof_of_human`, verified by World), deny (`verification_rejected`, 46 s), cancel (45 s). Logged in `WORLD_DEBRIEF.md` and `docs/PROGRESS.md`.

### Requirement checklist (PROJECT.md §6.3)
- [x] Integrate World's official human-verification product. World ID 4 / IDKit, Human-in-the-loop pattern. The name "Agent Pass" is not in World's public docs, so we asked the booth which product the prize means.
- [x] Full journey **request → user completes → validated result**: live, 3 approvals verified by World.
- [x] Full journey **→ protected action on Sepolia**, through the server's `pay` MCP tool: P3 `pay(acme.supabrain.eth, 5 USDC)`. Over the 4 USDC ENS cap → World App approve → [PAID on Sepolia](https://sepolia.etherscan.io/tx/0x7b983ad5aafadce22a1fdd98da09a3710be64be673f96c39602c5663de517528) (on-chain `Paid` event: `humanApproved=true`, roots = the owner's invoice only). 85 s from pending to paid.
- [x] **Denied** path where the action does not happen: live through the server, reject in World App → `DENIED`, vault unchanged ([Arkiv decision](https://rabdi.explorer.arkiv.network/tx/0xc272dd7fa0e51ad5ea40c64a06cb1255bc70ad7f4546c2a8dc0c8e8708a8aa39)). **Cancelled**: owner `POST /api/approvals/:id/cancel` → `CANCELLED` ([Arkiv](https://rabdi.explorer.arkiv.network/tx/0x926cd6ffe99f47e3efc53db12ad2debf94e39cb32864ad5d2cc46afa8eba1128)). **Expired**: unit tests (bridge timeout and our clock).
- [x] Validate on the backend: `verifyApprovalResult` plus World's `/api/v4/verify`, fail closed.
- [x] A meaningful action, not a login: the protected action is **moving money** that the policy flagged by provenance (outside content), not just amount.
- [x] Debrief: [`WORLD_DEBRIEF.md`](WORLD_DEBRIEF.md)
- [ ] Video timestamp
