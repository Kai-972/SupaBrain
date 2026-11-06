# How we used AI

<!-- All lanes append. One line per stage: what AI drafted vs what humans designed/decided/reviewed, and how output was verified. -->

## Tools
## What AI drafted vs what humans decided
## How we verified AI output
## Per-stage log
- S0 (Lane A): Claude Code drafted the monorepo scaffold, zod config loader, shared types/interfaces (copied from the human-written brief), test fakes and guard scripts. Kai set the plan and decisions. Verified by `pnpm build`, `pnpm test`, `pnpm lint:hardcode`, `pnpm check:secrets` and a live Rabdi `eth_chainId` check in `pnpm run doctor`.
- S1 ENS (Lane A): Claude Code read the ENSv2 docs, wrote the registration/registry/agent/proof/kill scripts, the tx runner and the `EnsAuthority` (14 tests written before the implementation). Kai decided the design and approved funding. Verified on chain: every step was dry-run with `eth_call` simulation first, post-checked from chain state, and the agent boundary and kill switch were proven with the agent's own key and mined reverts.
