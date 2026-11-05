# Start here (for Kai and Srijit, not for Claude)

## 1. Put this pack in the repo
1. Create an empty GitHub repo `supabrain` (public, MIT). Clone it.
2. Copy everything from this pack into the repo root, **including the hidden `.claude/` folder**. Commit it as `docs: build brief and lane plans`, then push.
3. Each person creates `.env.local` locally. It's gitignored. Share values only through a private channel.

> **Naming:** the product is **Supabrain**. Code names are `supabrain` (repo, MCP server), `BrainVault` (contract), `sb.*` (ENS text keys, Arkiv schemas) and `supabrain-mumbai26` (Arkiv namespace). Srijit's old brief in `docs/` still uses the old names; Claude #3 should map them.

## 2. Open the three Claude Code sessions (one per lane, from the repo root)

**Claude #1, Kai, Lane A (Brain).** Paste:
```
You are Lane A (Brain) for this repo. Read CLAUDE.md fully, then docs/lanes/A-BRAIN.md. Run /start. Then do Stage S0 (scaffold) step by step: show me the plan for S0 first, and wait for my "go". Log every finished step with /log.
```

**Claude #2, Kai, Lane C (Face).** Start it right away, so it can design on fixtures while A scaffolds. Paste:
```
You are Lane C (Face) for this repo. Read CLAUDE.md fully, then docs/lanes/C-UI.md. Run /start. Lane A is pushing the scaffold; until it lands, propose the screen layouts and the design tokens for /t (no code outside apps/web). After the pull, do your S0 and S1 on fixtures. Log every step with /log.
```

**Claude #3, Srijit, Lane B (Money & Security).** Paste:
```
You are Lane B (Money & Security) for this repo. Read CLAUDE.md fully, then docs/lanes/B-MONEY.md (your earlier brief is docs/CLAUDE.srijit-original.md, for reference only; CLAUDE.md wins). Run /start. After Lane A's S0 push, set up Foundry and start S1: the World spike, and the vault tests against a mock registry. Log every step with /log.
```

## 3. How we stay in sync
- **One tracker:** `docs/PROGRESS.md`. Check the Board and the Requests before asking each other.
- **Slash commands:** `/start` at the start of every session, `/log` after every step, `/handoff` when a Claude account is about to hit its limit.
- **Interface changes** to `packages/shared` go through a Requests line. Tell the other person in person too.
- **Arkiv snags** go into `arkiv/friction.md` straight away. They're 25% of the Arkiv score.
- **Checkpoint after S3:** the memory-first product works end to end without money. Rehearse it once before moving on.

## 4. Files in this pack

| File | For | What it is |
|---|---|---|
| `CLAUDE.md` | All Claude sessions | Shared brief: decisions, rules, contracts, stages, demo, cut order |
| `docs/lanes/A-BRAIN.md` | Claude #1 (Kai) | Server, memory engine, Arkiv, ENS: step by step |
| `docs/lanes/C-UI.md` | Claude #2 (Kai) | Dashboard spec, design system, fixture, UI stages |
| `docs/lanes/B-MONEY.md` | Claude #3 (Srijit) | Payment policy, vault, World, security docs |
| `docs/PROGRESS.md` | Everyone | Board, stage checklist, requests, hand-offs, logs |
| `docs/DECISIONS.md` | Everyone | What we decided and why (append only) |
| `docs/IDEA.md` | Humans, judges' prep | Plain-words idea, Arkiv answers, pitch, Q&A |
| `PROJECT.md` | Humans, sponsor docs | Problem, sponsors, competition, sources (Srijit's, updated) |
| `docs/CLAUDE.srijit-original.md` | Reference | Srijit's original full brief |
| `.claude/commands/*.md` | Claude Code | `/start`, `/log`, `/handoff` |
