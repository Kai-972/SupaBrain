# DECISIONS (append only; newest at the bottom)

Format: `- <time IST> · <who> · <decision> · why · (replaces: …)`

- 2026-11-06 03:22 · Kai · **Memory first.** The shared brain + lineage + undo is the product; money is the second pillar · Arkiv/ENS judges' feedback
- 2026-11-06 03:22 · Kai · Sponsors: **ENS + Arkiv + World** (World ID Agent Pass as the third pick) · World fits the human approval for risky payments
- 2026-11-06 03:22 · Kai · **ENS setup owned by Kai (Lane A)**; Srijit owns payments, vault, World and security (Lane B); Kai also owns the UI (Lane C) · two people, three Claude sessions · (replaces: Srijit's Lane B "Money & Names")
- 2026-11-06 03:22 · Kai · Memory lifetime **2 days**; Keep extends; quarantined memories never extended; revocations at max lifetime · what Kai told the Arkiv judges · (replaces: 30-day memory expiry)
- 2026-11-06 03:22 · Kai · Confidential content stays off Arkiv; memories hold `ref` pointers (GitHub private repo pinned to a commit / Notion page) · what Kai told the Arkiv judges
- 2026-11-06 03:22 · Kai · Notion is the "beyond crypto" integration: `notion:` pointers in the MVP, Notion import as stretch
- 2026-11-06 03:22 · Kai · GitHub-style public memory (others pull your context) is **on hold** as a future improvement
- 2026-11-06 03:40 · brief · DEFAULT: lead demo story "bank details changed" (from Srijit's PROJECT.md)
- 2026-11-06 03:40 · brief · DEFAULT: a separate read log (memory → readers) feeds `DryRun.readers` and notices; the read-set still resets after `remember`
- 2026-11-06 03:40 · brief · DEFAULT: "Correct this" = revoke memory + human memory with `supersedes`
- 2026-11-06 03:40 · brief · DEFAULT: World deny path shown in the booth demo + video; the stage pitch may show only approve
- 2026-11-06 03:40 · brief · DEFAULT: `packages/payments` (B) consumes `EnsAuthority` (A) via dependency injection; the server mounts `createPaymentsDisabled()` until B delivers
- 2026-11-06 03:34 · Kai · **Product renamed Blast Radius → Supabrain** (Kai also floated "Super Mind"; going with Supabrain unless he says otherwise). Renames in docs: repo `supabrain`, MCP server name `supabrain`, Arkiv namespace `supabrain-mumbai26`, contract `BrainVault`, text keys and schemas `br.*` → `sb.*`, MCP prompt `supabrain_rules`. The lowercase term "blast radius" stays as the name of the dry-run preview. `docs/CLAUDE.srijit-original.md` is left unchanged as reference (it still says Blast Radius / BlastVault / `br.*`; map them as above) · (replaces: Blast Radius naming)
- 2026-11-06 03:38 · Kai · **Final name: Supabrain** (one word; replaces "Super Brain"). Code names: repo and MCP server `supabrain`, Arkiv namespace `supabrain-mumbai26`, MCP prompt `supabrain_rules`; `BrainVault` and `sb.*` keys stay · (replaces: Super Brain)
