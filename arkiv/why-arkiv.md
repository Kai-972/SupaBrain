# Why Arkiv

Supabrain is a shared memory for a team's AIs (Claude, Gemini, ChatGPT) that remembers where every fact came from and can take a fact back from every AI at once. That only works if three things hold that no single company's database can promise:
1. Each memory was **really written by that AI**.
2. **Nobody**, us included, quietly edited or deleted it.
3. Anyone can check a retraction without asking us.

Arkiv gives us all three as properties of the store, not as promises in our code.

## What Postgres would lose
| With Arkiv | With our own Postgres |
|---|---|
| **Authorship is on chain.** Each memory is created by the agent's own wallet (`$creator`) and handed to the team wallet in the same batch (`$owner`). One transaction proves Gemini wrote it, not "the server". | Authorship is a column we could change. "Gemini said this" means "trust our database". |
| **Records can't be edited.** Memories, edges and decisions are `readonly`. The team (owner) can extend a memory, which is Keep, but can't patch it, and the agent can't take it back. Both refusals were simulated against the live chain and named by the engine (`ReadOnlyEntity`, `NotOwner`). | An admin, a bug or an attacker with DB access can rewrite history, and nobody outside can tell. |
| **Lies fade by themselves.** Memories and evidence expire after 2 days unless a human clicks Keep, and the network enforces it: a test memory was gone from queries at its exact expiry block. A quarantined memory is never extended. | Expiry is a cron job nobody can audit. Poisoned memories persist: Unit 42 showed a webpage poisoning an agent's memory that was kept **up to 365 days** (`docs/research/supermemory.md` §5). |
| **Retractions are public.** A revocation is a team-signed entity with maximum lifetime. Another team's agent can check "is source X or payee Y revoked?" straight from Arkiv, without trusting us. | Revocations are rows in our database; others have to ask us and trust the answer. |
| **One shared truth across vendors.** Claude Code, Claude.ai and Antigravity read the same entities through one server, and the server rebuilds its graph from Arkiv at every start. | Each vendor's memory is its own silo, or our server is the only source of truth. |

**It saved us during QA.** On 2026-11-06 a bug in our server erased memory links in its in-memory graph after a payment. Because Arkiv held the true record, a restart rebuilt every link. That is how we found and fixed the bug (`docs/QA_PLAN.md`, M2). With our own database as the only copy, the lineage would simply have been gone.

## What we keep off chain
- **Confidential content** (private docs, pricing, contracts). A memory holds only a pointer (a GitHub file pinned to a commit, or a Notion page) and a non-secret label. Only AIs with access can open it, and lineage and revocation still work on the pointer.
- **Raw chat transcripts** and per-call read logs. The read log lives in server memory and feeds the dry run.
- **Bearer tokens and keys,** and the Arkiv access key, which never reaches a browser or wallet.
- **Real personal data.** The demo data is synthetic.

## What breaks without Arkiv
- **"Who wrote this?"** becomes our word against yours.
- **"Take it back everywhere"** becomes "delete rows in our database", which nobody else can verify, and which an attacker with DB access could undo.
- **The payment safety story loses its anchor.** The vault checks revoked roots on chain, and the human reviewing a payment checks lineage that lives on Arkiv. Without a tamper-evident lineage, the provenance check is only as trustworthy as our server.

## How we checked
- **Live counts:** `pnpm arkiv:reach` (read-only; see `arkiv/reach.md`).
- **The README's runnable query:** `pnpm arkiv:query`.
- **Write-path proofs:** in `config/deployments/arkiv.rabdi.json` (S1 spike transactions).
