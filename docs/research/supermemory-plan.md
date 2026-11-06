# What we take from Supermemory: the decision (2026-11-06)

**Process:** a research agent wrote `docs/research/supermemory.md`. A decision agent ranked upgrades from it, a review agent checked them against the code (file:line), and a critique agent played a skeptical finalist judge plus sponsor engineer. This page is the merged result. Lane B builds it with tests first.

**Positioning** (critique): *Supermemory helps AI remember better. Supabrain makes what AI remembers accountable: who wrote it, what it came from, and how to take it back.* Supabrain is the accountability layer underneath memory products, not a rival recall engine.

## Build now (in order)

| # | Upgrade | Steal / beat | Why (judging lift) | Guard rails from review and critique |
|---|---|---|---|---|
| 1 | **Payee found through memory text.** The ENS hard block also fires when the attacker address is only in a vendor-tagged memory's text, and such a memory no longer "supports" the honest payee (it was pulling the email root into honest attestations) | beat | Protects the never-cut "BLOCKED by ENS" beat with live models, which often skip the `address` field | Only memories with an explicit vendor `subject` count (no subject inferred from text), so the partner-deny beat stays a World deny. Match exactly 40-hex (`\b`) so 64-hex keys and tx hashes never match. Mixed case is fine |
| 2 | **"Disputed by ENS"** on memories that claim an address for a team vendor that differs from the vendor's live ENS record | beat (answers latest-wins) | ENS becomes the source of truth at write time as well as pay time. Visible in Claude Code and Antigravity with no UI work | **Computed on read** (survives restart and sync). Team vendors only. ENS down → `unverified`, never an error, never blocks the write. Quarantined wins over disputed. Payment memories skipped. No new StreamEvent, no shared-type change. **Machines flag, humans retract** |
| 3 | **Arkiv docs:** `arkiv/why-arkiv.md` and `arkiv/reach.md` with live counts by `$creator` | – | Each is 25% of the Arkiv judging and both were empty | Real numbers from read-only queries; no inflated claims |
| 4 | **Public verifier `pnpm verify:memory <key>`:** using only Arkiv and ENS, check that a memory's `$creator` is the wallet ENS says owns the agent's name now, and list team-signed revocations | beat (unsigned authorship) | The "you don't have to trust our server" proof that Postgres can't give (Arkiv, ENS, technicality) | Word it as "registered now", not "at write time". Owner memories are signed by the team wallet. Cap concurrency, document 429s |
| 5 | **Comparison and pitch:** Supermemory vs Supabrain table, use cases, why-now opener | – | Answers Kartik's question directly | Kept to safe claims only (below) |

**If time allows:** a `GET /api/review` queue (disputed memories plus outside-content addresses with no ENS backing, grouped by evidence source, ordered by blast radius), and only if Lane C renders it. Also "say, don't build" answers for World Q&A.

## Cut (and why)
- **Dry-run hash binding:** judges can't see it, and a recall between the preview and the click would return 409 mid-demo.
- **Embeddings or semantic recall:** big, adds a new key, can reorder scripted queries, and we'd lose a recall comparison anyway.
- **Per-fact `forgetAfter`:** fragile date parsing, edges and taint rows would need re-expiry, and it's invisible. Our 2-day lease plus Keep covers the idea.
- **Typed relations as a new field:** parents already cover derives/extends, and `supersedes` (Correct this) is our human-only "updates". We say so in the comparison.
- **Connectors (Gmail, Drive):** auto-importing mail is the attack itself. Pointers stay.
- **MCP widgets, a new owner-alert SSE event, memory-vs-memory conflicts:** shared-contract changes, demo risk, and no ground truth for which memory is right without ENS.

## Safe and unsafe comparison claims (critique)
- **Say:**
  - "Supermemory resolves conflicting facts latest-wins: right for preferences, wrong for payout addresses."
  - "Their memories don't carry a signed author; ours are signed by each agent's own wallet under its ENS name."
  - "They don't do payments or human approval; it's not their product."
- **Never say:**
  - "they shut down team memory" (they retired the Company Brain Slack bot; the API still does spaces);
  - "their deletes don't cascade" (deleting a document forgets what was derived from it; the restatement gap is our inference);
  - anything about their old v1 MCP auth;
  - any recall-quality comparison;
  - "we detect lies" (we flag addresses that disagree with ENS);
  - the "over $30M involved AI" figure (unverified).

## Why-now opener (for the pitch)
"Shared memory across AIs is arriving: memory APIs like Supermemory already serve 100k+ organisations (self-reported). Meanwhile 'our bank details changed' cost US businesses $3.05B last year (FBI IC3 2025), and in lab tests, queries alone plant a false agent memory 98% of the time (MINJA)."
