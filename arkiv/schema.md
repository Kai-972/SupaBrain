# Arkiv schema

Lane A. Source of truth: [`packages/arkiv/src/schemas.ts`](../packages/arkiv/src/schemas.ts). Every schema indexes `app` and `team` (every query filters by both); `body` is JSON bytes (stored and selectable, never indexed). Only columns a query filters on are indexed.

- `app` = `supabrain-mumbai26` (`config/app.json` `appNamespace`); the S1 spike wrote under `supabrain-mumbai26-spike` so it never mixes with the real graph.
- `team` = `team1` (`config/app.json` `team.id`).
- Attribute names avoid the SDK's reserved words (`by`, `key`, `addr`, …): see [friction.md](friction.md).
- All entities are created with `flags: { readonly: true }` and handed to the team wallet in the same batch (see [Ownership model](#ownership-model)).

## sb.memory
| Column | Type | Indexed | Notes |
|---|---|---|---|
| app, team | str | yes | namespace |
| kind | str | yes | fact · decision · plan · address · evidence · payment · ref |
| folder | str | yes | checked against the agent's `sb.scope` ENS record |
| trust | i32 | yes | 1 evidence · 2 agent · 3 human |
| agent, vendor | str | yes | agent label, vendor |
| seq | u64 | yes | server-assigned monotonic order (queries sort on the client) |
| source, subject | str | yes, optional | evidence source id; ENS name the memory is about |
| address | addr | yes, optional | kind = address |
| refKind | str | yes, optional | github · notion · url |
| body | bytes | no | `{ text, parents[], roots[], ref?, supersedes? }` |

## sb.edge
`app`, `team`, `parent` (key, indexed), `child` (key, indexed). No body. Expiry follows the child.

## sb.taint
`app`, `team`, `root` (str ≤ 128 bytes, indexed: a source id or a human-root memory key), `memory` (key, indexed). Expiry follows the memory. This is the row revoke queries: `root = X` returns every memory derived from X.

## sb.revocation
`app`, `team`, `targetType` (source · agent · memory), `target`, `revokedBy` (indexed, not `by`), `seq`, `body` (`{ reason, dryRun incl. readers, vaultTx?, ensTx? }`). Expiry `ExpirationTime.max()` (~182.5 days).

## sb.notice
`app`, `team`, `toAgent`, `revocation` (key), `body` (`{ text, affected[] }`). Expiry 2 days.

## sb.payment
`app`, `team`, `agent`, `payee` (addr), `status`, `intent`, `seq`, `body` (`{ amount, memo, reasons, path, txHash, approval }`). Expiry: intent 15 min, decision 30 days.

## Ownership model
Verified live on Rabdi (see `config/deployments/arkiv.rabdi.json`, [how-you-use-arkiv.md](how-you-use-arkiv.md)):

- The **agent wallet signs** the create, so `$creator` is the agent. The same batch ends with `changeOwnership` to the **team wallet**, so `$owner` is the team. One transaction, no second step.
- `readonly: true`: nobody can patch the entity, ever. The **owner can extend** it (Keep). After the handover the creator can neither extend nor take it back (`NotOwner`).
- **Keep** = one owner-signed batch extending the memory, its edges and its taint rows together.
- Because anyone can write entities with our attributes, every read filters by **known `$creator` wallets** (the agents and the team wallet), never by `app` alone.

## Expiry policy
From `config/app.json` `arkivExpirySec`; Rabdi blocks are 2 s; the chain caps a lifetime at 7,884,000 blocks (~182.5 d) counted from the landing block of the create or extension.

| Entity | Lifetime | Why |
|---|---|---|
| memory, evidence | 172,800 s = 86,400 blocks (2 days) | unverified facts should fade unless a human clicks Keep |
| edge, taint | follows its memory | lineage must not break; Keep extends all three |
| notice | 2 days | a retraction only needs to outlive the readers' next recall |
| revocation | `ExpirationTime.max()` (~182.5 d) | must always outlive anything it revokes (`keep.maxDays` = 30 < 182) |
| payment intent / decision | 15 min / 30 days | audit trail |

## Known creators (writer wallets)
Read from the committed `config/deployments/arkiv.rabdi.json` (`knownCreators`), derived from the agent and team keys; a query result is trusted only if `$creator` is in this set.

| Role | Address |
|---|---|
| team (owner of every entity) | `0x4eA717986244B28B8af633f698FdDf8308D35A56` |
| lead-claude | `0xEd4ae94521A00BE3e432173F00009AFB90641bfC` |
| gem-research | `0x6c57ACAA7116c8b539EbA60698B7b644C6b4590c` |
| gpt-writer | `0x4B35c28ad6A77A49d63c052E9c35AdC7A47E14fA` |
