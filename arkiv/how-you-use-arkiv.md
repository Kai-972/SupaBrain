# How we use Arkiv

Status after the S1 spike (real Rabdi transactions; details and proof in [`config/deployments/arkiv.rabdi.json`](../config/deployments/arkiv.rabdi.json)). The server wiring (S2) fills the "reads" table with live user-facing features.

## Feature → what the user sees
The write path and queries behind every row are proven live in the S1 spike. The product features themselves are built in S2/S3 (⏳) and this table is updated with file:line then.

| Feature | Arkiv entities | What the user sees |
|---|---|---|
| ⏳ An AI remembers something | `sb.memory` + `sb.edge` ×parents + `sb.taint` ×roots, one batch | the node appears in the graph with a proof link to the Rabdi transaction |
| ⏳ Lineage ("why does the AI believe this?") | `sb.edge`, `sb.taint` | clicking a node shows its ancestors and roots |
| ⏳ Keep | `extendEntity` on memory + edges + taints, one owner-signed batch | a node stops fading; its expiry date moves out |
| ✅ Memories fade after 2 days | entity expiry | a lie nobody kept disappears from the shared store by itself (proven: a 60 s memory was gone from queries at exactly its expiry block; no event is emitted, the server emits `expired` itself) |
| ⏳ Undo ("this source is wrong") | `sb.revocation` (max lifetime), `sb.notice` | cascade of red nodes, retraction notices in every vendor's next answer |
| ⏳ Public advisories | `sb.revocation` read live | the README query and `/advisories` list real revocations |

## Writes (who signs what)
- **Agent wallets sign** their own memories, so `$creator` is the agent and it is on chain who wrote what.
- In the **same batch** the agent hands each entity to the **team wallet** (`changeOwnership`), so `$owner` is the team. Verified in a single transaction: `$creator` 0x6c57…590c (gem-research) ≠ `$owner` 0x4eA7…5A56 (team).
- Everything is created `readonly`: no one can edit a memory. The team (owner) can still extend it, which is what Keep does. After the handover the agent cannot extend it or take it back (`NotOwner`), and the team cannot patch it (`ReadOnlyEntity`). Each refusal was simulated against the live chain and named by the engine's error.
- One `executeBatch` per `remember`: memory + edges + taint(s) + transfers. Measured: 8 ops 670k gas (~7 s with 4 s receipt polling), 10 ops 742k gas (~5 s). At 1 gwei that is ~0.0007 tGLM per remember.
- Every write goes through one guarded path ([`packages/arkiv/src/guarded-send.ts`](../packages/arkiv/src/guarded-send.ts)): chain id check, plain `execute()` to the Arkiv registry only, estimate first (a revert stops us before signing), `gas = max(1,000,000 + 400,000×(ops−1), 2×estimate)` within half the block gas limit, balance covers the worst case, nonce unchanged, returned hash equals the signed one. One write queue per signer. No automatic retry.

## Reads (which user-facing features read from Arkiv)
Design (built in S2): the dashboard and the MCP tools read from an in-memory graph that is **rebuilt from Arkiv at startup** and kept current by `watchEntityEvents` (start the watcher first, then query; events carry no attributes, so each created key is fetched and kept only if `app`, `team` and `$creator` match); `/api/advisories` and the README query read **live** from Arkiv. Query patterns proven live in the spike (340 to 810 ms each):

- memories by `app + team + folder`
- `sb.taint` by `root = X` (returns exactly the memories derived from X, the revoke set)
- `sb.edge` by `parent = X`
- `createdBy(wallet)` / `ownedBy(wallet)` filters, typed `i32` filters (`trust = 1`)

## Runnable query
Needs only `ARKIV_ACCESS_KEY` in `.env.local` (a free key from the Arkiv Hub). Lists live memories for the app from the known writer wallets, newest sequence last, with time left before they fade:

```sh
pnpm arkiv:query            # the real namespace
pnpm arkiv:query --spike    # the S1 spike data (supabrain-mumbai26-spike)
pnpm arkiv:query --folder research
```

Example output from the spike (kept memory shows 336 h, unkept ones 48 h):

```
app "supabrain-mumbai26-spike" · team "team1" · 5 live memories · head block 275479
#3 evidence trust 1 gem-research  0x3060c72a… expires in 47.9 h · spike evidence: web page lists the vendor address
#4 fact     trust 1 gem-research  0xc82273f0… expires in 336.0 h · spike: vendor wallet changed (derived from the email and the web page)
```

The query is `client.select(...).from(Memory).where(and(eq("app", app), eq("team", team))).createdBy(wallet).fetch()` with `@arkiv-network/sdk` 1.0.1; the source is [`scripts/arkiv/query.ts`](../scripts/arkiv/query.ts).
