# Supermemory vs Supabrain v2 (2026-11-06, final pass)

**Method:** a research agent read Supermemory's docs, changelog (through Nov 2, 2026), GitHub and v5 OpenAPI. These notes add to `supermemory.md` and `supermemory-plan.md`; they don't repeat them.

## What changed since our first look
Supermemory now sells "continue across tools" for coding agents.
- Their plugins tie one memory to a repo's Git remote, shared by Claude Code, Codex, Cursor, OpenCode and Muse Code ([coding agents](https://supermemory.ai/coding-agents/)).
- Members of the same organization share it ("Team memory").

**So continuity alone doesn't set us apart.** The pitch is **accountability for that shared memory**:
- every checkpoint is signed by the AI's own wallet;
- each AI's rules are public ENS records the server enforces;
- injected instructions are stopped before another AI receives them;
- anyone can check all of it on Arkiv and ENS without trusting our server.

## What we take, with our twist
| # | Their feature | Our version (built or briefed) |
|---|---|---|
| 1 | Connect flow per client, one-click install links ([Cursor install links](https://cursor.com/docs/context/mcp/install-links), [OAuth plugins](https://supermemory.ai/changelog/sign-in-to-plugins-and-the-cli-with-oauth/)) | `/connect` shows the AI's **identity first**: `claude.<brain>.supabrain.eth`, its wallet and its live ENS rules, then one snippet per client (Claude Code, claude.ai, Antigravity, Codex, Cursor deeplink). In the frontend brief |
| 2 | "Agents" page with read/write and scoped access ([MCP docs](https://supermemory.ai/docs/supermemory-mcp/mcp.md)) | **Rules page:** each row is an ENS name. Status, path scope and writes per day are text records; every change is a Sepolia tx by our server key (`POST /api/brains/:id/rules`), enforced on every call with the rule named. **Built** |
| 3 | Profile, static + dynamic, loaded at session start ([user profiles](https://supermemory.ai/docs/concepts/user-profiles.md)) | **`continue`** gives the brain card: who you are (ENS), rules, where each AI left off, open tasks, notes for the focus. **Built by Lane A**; every line links to its Arkiv tx |
| 4 | Session transcripts and history | **Signed `git log`:** each checkpoint shows its AI, ENS name, signer wallet (= Arkiv `$creator`), tx and parents; each file version shows who wrote it. API built, in the frontend brief |
| 5 | Memory graph component ([memory graph](https://supermemory.ai/docs/integrations/memory-graph.md)) | **Commit graph from Arkiv:** one lane per AI. Edges are recorded lineage (what the AI read), not similarity. Stopped nodes are labelled. In the frontend brief |
| 6 | Memory review: approve, decline, undo ([memory review](https://supermemory.ai/docs/recall/memory-review.md)) | **Stop + review:** flagged content is saved, signed by the AI that relayed it, then revoked on Arkiv at once by the team wallet, and listed on `GET /api/brains/:id/blocked` with the rule and excerpt. **Built** |
| 7 | `<private>` redaction in their Codex plugin | Server-side redaction with a sha256 placeholder. Later |

**Skipped:** connectors and mail import (that's the attack surface), embeddings, MCP widgets, benchmarks.

## Where we win (sourced)
- **No author on a memory.** Their v5 memory schema has no author, signer or signature field ([OpenAPI](https://api.supermemory.ai/v5/openapi)). Per-key attribution exists only as Enterprise usage analytics.
- **Prompt injection between agents.**
  - Their Claude Code plugin loads matching memories before each prompt with "no tool call, no permission prompt", and that memory is shared across the repo's coding agents.
  - Their security and rules pages describe no defense against poisoning ([security](https://supermemory.ai/docs/overview/security.md), [rules](https://supermemory.ai/docs/concepts/rules.md)).
  - *Inference:* a poisoned README summarised in Claude Code could reach Codex's next prompt automatically. Ours is stopped, with a tx.
- **Grants aren't public rules.** Their access grants live in their database. "Writable scoped keys can update and delete documents and forget memories" ([auth](https://supermemory.ai/docs/authentication.md)). Our rules are ENS records anyone can read, and our records can't be edited (Arkiv `readonly`).
- **Taking memories back.**
  - Their forgetting is a soft delete with no built-in audit trail ([memory operations](https://supermemory.ai/docs/recall/memory-operations.md)).
  - Conflicts resolve newest-wins.
  - Ours is a team-signed revocation that outlives what it revokes, and the dry run shows who read it.
- **Checking without trusting them.** Trust rests on SOC 2. Ours rests on `pnpm verify:memory` (Arkiv + ENS only) and on ENS heads (`sb.memory.head` = the newest commit's Arkiv key).

## Do not claim
- That we're first or only with shared memory or "continue" across Claude Code, Codex and Cursor.
- That they lack read-only mode, scoped spaces, connection expiry, version history, a review queue, a graph view or transcripts.
- That they gave up team memory (the MCP overview lists team spaces), or that they're cloud-only (Supermemory Local runs in Docker).
- "They have no prompt-injection defense." Say "their docs describe none."
- Any recall-quality or speed comparison.
- The third-party "HIGH risk" audit of a copy of their skill.

**One line for judges:** *"Supermemory makes your AIs remember. Supabrain makes what they remember accountable: every commit signed by the AI that wrote it, every AI's rules public on ENS, and injected instructions stopped before the next AI sees them, all checkable on Arkiv without trusting us."*
