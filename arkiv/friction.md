# Arkiv friction log

Written as things happen (25% of the Arkiv score). Newest first. Format:

```
### <YYYY-MM-DD HH:MM IST> · <short title>
- expected:
- got:
- repro:
- workaround:
```

<!-- entries below -->
### 2026-11-06 09:16 IST · Write latency is dominated by viem's 4 s receipt polling, not by Arkiv
- expected: a write on a 2 s-block chain confirms in about 2 to 4 s; `watchEntityEvents` already defaults to half a block, so the SDK looks tuned for the chain
- got: the SDK wallet client (`createWalletClient`) inherits viem's default `pollingInterval` of 4 s, so `executeBatch` returned 7.2 to 7.7 s after submit even though the gas estimate took ~0.2 s and the block landed within one or two blocks
- repro: `pnpm arkiv:spike --only s2 --yes` before and after passing `pollingInterval: 1000` to `createWalletClient` (7.7 s → 5.7 s per write)
- workaround: set `pollingInterval: 1000` on the wallet client (done in `packages/arkiv/src/writer.ts`). A Rabdi-aware default in the SDK wallet client would save every app this step

### 2026-11-06 09:16 IST · `watchEntityEvents` is chain-wide, and events lag the receipt by a few seconds
- expected: events for our own writes only, or at least a way to scope the watcher
- got: it delivers every Arkiv event on the chain: 6 events in 14 s while we wrote one create + one transfer; the other 4 were for entities we did not write in that window. Our two events arrived ~11 s after submit (tx receipt at ~7 s, polling 1 s). `EntityCreated` carries `entityKey`, `owner`, `expiresAt`, flags but not attributes
- repro: `pnpm arkiv:spike --only s6 --yes`
- workaround: the server fetches each created key (`$key = …`) and keeps it only if `app`, `team` and `$creator` match, as already planned for the startup rebuild. Treat SSE `confirmed` as "event seen or receipt seen, whichever first"

### 2026-11-06 09:16 IST · Node 26 prints `ExperimentalWarning: localStorage is not available` from the SDK
- expected: a silent server-side SDK
- got: on Node 26.11 the first SDK query prints the warning once (it comes from the SDK's debug logger probing a browser global; importing the package alone does not trigger it). Harmless
- repro: `pnpm arkiv:spike --only s1` on Node 26
- workaround: `NODE_NO_WARNINGS=1` for scripts. Nothing to fix on our side

### 2026-11-06 09:16 IST · "Execution error without revert data" hides a refusal that the node did explain
- expected: when a batch is refused the SDK error names the engine error (`NotOwner`, `ReadOnlyEntity`)
- got: the raw node does return it. `eth_estimateGas` and `eth_call` both answer `code 3 "execution reverted"` with full revert data (`NotOwner(entityKey, caller, owner)`). The SDK's catch-all in `sendArkivTransaction` turns any other error thrown during a send (for us: a guard that refuses before signing) into `Transaction failed: Execution error without revert data` and keeps the real error only in `cause`. Found with `scripts/arkiv/revert-probe.ts`
- repro: `pnpm tsx scripts/arkiv/revert-probe.ts` (needs the spike lineage)
- workaround: walk the `cause` chain for our own error (`findCause`) and decode revert data with a local copy of the engine's error ABI (the SDK's decoder is not exported). Verified for `NotOwner`, `ReadOnlyEntity`, `ExpiryNotExtended`

### 2026-11-06 09:16 IST · Confirmed as documented (kept here so the feedback is balanced)
- `readonly` is exactly what the docs say: the owner can extend it, nobody can patch it (`ReadOnlyEntity`), the creator can no longer extend or take it back after `changeOwnership` (`NotOwner`)
- `changeOwnership` works in the SAME batch as the `create` (operations apply in order, atomically), so `$creator` ≠ `$owner` costs no extra transaction. Cost: ~75 to 110k gas per operation (a 2-op create+transfer used 194 to 217k, about 0.0002 tGLM at 1 gwei)
- an extension SETS a new expiry (resolved from the landing block); it does not add. The `ExtendEntityParameters` doc says so plainly, which saved us a wrong assumption
- expiry is a block condition and it is exact: a 60-second memory (30 blocks) was gone from queries at the head block equal to its `$expiresAt` (275572). The watcher emitted no event at expiry (only `EntityCreated` and `OwnershipTransferred` for that key), so the server must emit `expired` itself, as the brief says
- `predictEntityKeys` + a per-create `salt` lets edges and taint rows reference a memory created in the same batch. Keys came out exactly as predicted in an 18-entity, two-batch run

### 2026-11-06 09:06 IST · `createPublicClient` types hide viem actions that exist at runtime
- expected: the SDK public client behaves like a viem public client plus Arkiv actions (it does at runtime: `client.extend(publicActions).extend(publicArkivActions)` in `createPublicClient.ts`), so `estimateGas`, `getGasPrice`, `getCode` and `sendRawTransaction` type-check, as the official quickstart adapter uses them
- got: TypeScript says `Property 'estimateGas' does not exist on type '{ getBalance: ...; watchEntityEvents: ... }'`. The returned type is `PublicArkivClient`, whose action list is a narrowed subset, while the runtime object has all of viem's public actions
- repro: `const c = createPublicClient({ chain: rabdi({ accessKey }), transport: http() }); await c.estimateGas(...)` under `tsc` (TypeScript 7)
- workaround: keep two clients on one chain config: the SDK client for entity queries/watch/predict, and a plain viem `createPublicClient` for raw RPC and `sendRawTransaction`. Cleaner than casting

### 2026-11-06 09:06 IST · `eth_getCode` at the Arkiv registry address is empty
- expected: a deployed contract at the address the SDK sends every write to (`0x4400...0044`), so a startup `getCode` check can confirm the address is right
- got: `0x` (it is a chain-native address, not a normal contract). Our own rule "getCode must be non-empty for every configured contract" cannot apply to it
- repro: `eth_getCode(0x4400000000000000000000000000000000000044, "latest")` on Rabdi
- workaround: the address lives in `config/networks.json` with its source; correctness is verified by a successful `eth_estimateGas` of `execute([...])` against it (done before every signature), plus `eth_chainId`

### 2026-11-06 08:58 IST · Attribute names `by` and `key` are reserved, and the docs don't say so up front
- expected: the schema in our brief (`sb.revocation.by`) just works; `by` is a normal English word and a natural column for "who did this"
- got: `defineSchema` throws `InvalidAttributeNameError: "by" is reserved by the query language, so an attribute with this name could never be queried`. Same for `key`. The reserved set (and, or, not, true, false, between, startswith, exists, typeof, order, by, asc, desc, bool, i32, u64, u256, dec, bytes, str, addr, key) lives in `sdk/src/schema/names.ts`, not in the quickstart
- repro: `defineSchema("probe", { app: str().indexed(), by: str().indexed() })` with `@arkiv-network/sdk@1.0.1`
- workaround: renamed to `revokedBy`. Good that it fails at definition time instead of silently writing an unqueryable column; a list of reserved names on the schema docs page would save the detour

