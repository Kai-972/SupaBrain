# Reach

All numbers below are **live** on Arkiv Rabdi (chain 7794095). They count only entities created by our own known wallets (`config/deployments/arkiv.rabdi.json`), since anyone can write entities with our attributes, so we always filter by `$creator`. Expired entities are gone from Arkiv and don't count: these are what is alive right now.

Reproduce with `pnpm arkiv:reach` (read-only). It prints the same tables.

## Agents and vendors writing
**Four wallets sign entities:**
- the team wallet, for owner context, revocations, notices and payment decisions;
- one wallet per AI agent, each from a different AI company.

| Signer (`$creator`) | AI vendor | Wallet |
|---|---|---|
| team | (human owner via dashboard) | `0x4eA717986244B28B8af633f698FdDf8308D35A56` |
| lead-claude.supabrain.eth | Anthropic (Claude) | `0xEd4ae94521A00BE3e432173F00009AFB90641bfC` |
| gem-research.supabrain.eth | Google (Gemini) | `0x6c57ACAA7116c8b539EbA60698B7b644C6b4590c` |
| gpt-writer.supabrain.eth | OpenAI (ChatGPT) | `0x4B35c28ad6A77A49d63c052E9c35AdC7A47E14fA` |

**Live entities on 2026-11-06 at 09:26 UTC:**

`supabrain-mumbai26-dev` (Lane A's development namespace): **67 live entities**
| signer | memory | edge | taint | revocation | notice | payment | total |
|---|---:|---:|---:|---:|---:|---:|---:|
| team | 4 | 0 | 4 | 2 | 5 | 0 | 15 |
| lead-claude | 8 | 9 | 10 | 0 | 0 | 0 | 27 |
| gem-research | 5 | 1 | 5 | 0 | 0 | 0 | 11 |
| gpt-writer | 4 | 4 | 6 | 0 | 0 | 0 | 14 |

`supabrain-mumbai26-b` (Lane B's live money rehearsal: seed, P1 blocked, revoke, P3 World-approved PAID, deny, cancel): **38 live entities**
| signer | memory | edge | taint | revocation | notice | payment | total |
|---|---:|---:|---:|---:|---:|---:|---:|
| team | 2 | 0 | 2 | 1 | 3 | 5 | 13 |
| lead-claude | 5 | 5 | 6 | 0 | 0 | 0 | 16 |
| gem-research | 2 | 1 | 2 | 0 | 0 | 0 | 5 |
| gpt-writer | 1 | 1 | 2 | 0 | 0 | 0 | 4 |

**The demo namespace `supabrain-mumbai26`** is seeded fresh within 2 days of judging, because memories fade after 2 days. It reads 0 until then, by design.

## Teams connected
- **1 team** (`team1`, ENS `supabrain.eth`).
- **3 AI clients** connected to the same memory over one MCP URL: Claude Code, Claude.ai and Antigravity (Gemini), proven in Lane A's S1 MCP spike (`docs/PROGRESS.md`).
- **Other teams' agents** can read our public revocations without an account: see `arkiv/how-you-use-arkiv.md`.

## How we counted
- **Script:** `scripts/arkiv/reach.ts` runs one query per (namespace, schema, signer): `select().from(<schema>).where(app = <namespace> AND team = team1).createdBy(<wallet>)`, paged 100 at a time with client-side totals (ORDER BY is not relied on).
- **Schemas:** `sb.memory`, `sb.edge`, `sb.taint`, `sb.revocation`, `sb.notice`, `sb.payment` (`arkiv/schema.md`).
- **Why some payments are missing:** pending payment intents live 15 minutes, so only final decisions (blocked, paid, denied, cancelled) remain in the counts.
