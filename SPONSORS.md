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
- [ ] `arkiv/why-arkiv.md`, `arkiv/reach.md` (S8, from real data)
- [ ] README wallet-address table (S8, generated from `config/deployments/arkiv.rabdi.json`)
- [ ] Server reads the UI's data from Arkiv (S2)
- [ ] Video timestamp

## World: World ID Agent Pass
### What breaks without it
### Feature → file:line → what the user sees
### Requirement checklist
