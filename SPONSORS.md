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
### Feature → file:line → what the user sees
### Requirement checklist

## World: World ID Agent Pass
### What breaks without it
### Feature → file:line → what the user sees
### Requirement checklist
