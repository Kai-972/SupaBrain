# Supermemory: competitive research (2026-11-06)

Research done for Supabrain after Kartik Talwar (ETHGlobal) suggested we look at Supermemory. Web sources only, checked 2026-11-06. **UNVERIFIED** marks claims we could not confirm.

## 1. What it is
- **Product:** a hosted memory and context layer for AI agents: an API, SDKs, plugins and an MCP server, with ChatGPT, Claude, Claude Code and Cursor integrations. It extracts facts from files, chats and URLs into a "vector-graph" store. https://supermemory.ai/
- **Business model:** usage-based credits. Free $0, Pro $19/mo, Max $100/mo, Scale $399/mo (SOC 2, HIPAA BAA, self-hosted), Enterprise custom. Ingest is about $0.005 per 1K tokens, and "operations" are metered on top. https://supermemory.ai/pricing · https://supermemory.ai/docs/overview/billing.md
- **Funding:** a seed round in Oct 2025, about $2.6–3M (Susa Ventures, Browder Capital, SF1.vc, with Jeff Dean among the angels). https://techcrunch.com/2025/10/06/a-19-year-old-nabs-backing-from-google-execs-for-his-ai-memory-startup-supermemory/
- **Traction (self-reported):** "1T+" tokens a month and 100k+ organizations. The repo has about 31.6k stars under an MIT license, but the engine itself is closed. https://github.com/supermemoryai/supermemory
- **They stepped back from team memory.** On 2026-09-09 they shut down "Company Brain", their Slack bot for teams, and the Nova app, keeping only the MCP server, plugins and engine. https://supermemory.ai/blog/an-update-to-supermemory

## 2. How it works
- **Pipeline:** queued → extracting → chunking (contextual) → embedding → indexing. Memories then form in a separate "dreaming" step. https://supermemory.ai/docs/concepts/how-it-works.md
- **Relations:** `updates` (the newer fact replaces the old one for search), `extends` (adds detail), `derives` (an inference). Contradictions resolve **latest-wins** via `isLatest`, and old versions are kept. https://supermemory.ai/docs/concepts/graph-memory.md
- **Version fields:** a version chain (`version`, `parentMemoryId`, `rootMemoryId`) and the flags `isLatest`, `isForgotten`, `isInference`, `forgetAfter`, plus `documentIds`. https://supermemory.ai/docs/api-reference/content-management/list-memory-entries-with-history.md
- **Forgetting:** time-based expiry, supersession, and noise decay. Forget-by-ID is a soft delete. Semantic forget needs `dryRun` and is capped at 100 per request. https://supermemory.ai/docs/recall/memory-operations.md
- **Review queue:** inferred memories are approved, declined or undone in a queue ordered by `parentCount`. https://supermemory.ai/docs/recall/memory-review.md
- **Isolation:** namespaces are the hard boundary; metadata is a soft filter. Profiles hold a static and a dynamic summary. https://supermemory.ai/docs/concepts/multi-tenancy.md
- **Connectors:** Notion, Google Drive, Gmail (whole threads from the chosen labels, with no untrusted-sender screening documented), OneDrive, S3, GitHub and Granola. https://supermemory.ai/docs/connectors/gmail.md
- **MCP:** `mcp.supermemory.ai/mcp` with OAuth, plus `memory-graph` and `guided-save` app widgets. https://supermemory.ai/docs/supermemory-mcp/mcp.md

## 3. Trust model
- **Writes:** anyone holding a key with write access to a namespace can write. "Scoping is not read-only access." https://supermemory.ai/docs/authentication.md
- **No author on a memory:** records carry only `orgId` and `spaceId`, with no signature and nothing about what the writer had read first. https://supermemory.ai/docs/v5/api-reference/content-management/get-memory.md
- **Deletion:** deleting a document forgets the memories derived from it. But a claim an agent restates through MCP `add_memory` becomes a new document with no link back to the source, so it would not cascade (our inference). https://supermemory.ai/docs/ingestion/document-operations.md
- **Security posture:** SOC 2 Type II, HIPAA BAA, AES-256 at rest. Audit logs are not documented. The v1 MCP had no auth ("the URL acted as an API key"). https://supermemory.ai/blog/the-ux-and-technicalities-of-awesome-mcps/

## 4. Flaws, from our angle
1. **Latest-wins is exactly what a "bank details changed" email exploits.** The newer attacker address becomes the current fact.
2. **Authorship isn't verifiable,** and trust sits with one central vendor.
3. **Nothing separates trusted from outside content:** Gmail threads and agent writes land in the same graph.
4. **Retraction doesn't cascade through what agents restated,** no agent is told a fact was retracted, and there's no preview of how far a lie spread.
5. **No action or payment safety.** Their own docs say transactional data doesn't belong in memory.
6. **Closed engine, metered "operations", and forgetting is a soft delete.**

## 5. Shared AI memory going wrong: real numbers
- **FBI IC3 2025:** $20.9B in total losses; business email compromise (BEC) $3.05B; over $30M of BEC losses involved AI-generated email or voice (secondary reports). https://securitypointbreak.com/2026/04/10/fraud-not-hacking-drove-2025-cyber-losses-fbi-crime-report
- **MINJA:** query-only memory injection, with a 98.2% injection rate and a 76.8% attack success rate. https://arxiv.org/abs/2503.03704
- **AgentPoison (NeurIPS 2024):** about 80% attack success with under 0.1% of memory poisoned. https://arxiv.org/abs/2407.12784
- **MemoryGraft:** 10 poisoned entries captured about 48% of retrievals; the authors propose cryptographic provenance as a defense. https://arxiv.org/abs/2512.16962
- **ChatGPT "SpAIware" (2024)** and **Gemini delayed tool invocation (2025):** both planted persistent false memories. https://embracethered.com/blog/posts/2024/chatgpt-macos-app-persistent-data-exfiltration/
- **Unit 42 (Oct 2025):** a webpage poisoned Amazon Bedrock agent memory (kept up to 365 days), which later exfiltrated data. https://unit42.paloaltonetworks.com/indirect-prompt-injection-poisons-ai-longterm-memory/
- **Microsoft (Feb 2026):** "AI Recommendation Poisoning": over 50 prompts from 31 companies telling assistants to "remember X as a trusted source". https://www.microsoft.com/en-us/security/blog/2026/02/10/ai-recommendation-poisoning/
- **OWASP Agentic Top 10:** ASI06 is Memory and Context Poisoning. https://www.promptfoo.dev/docs/red-team/owasp-agentic-ai/
- **2026 survey of five "Verifiable Memory Governance" primitives** (write authorization, provenance visibility, principal-scoped retrieval, rollbackability, verified forgetting). It names cross-principal propagation and post-deletion residue as open gaps. https://arxiv.org/abs/2604.16548

## 6. Worth borrowing (input to the decision)
- a review queue for low-trust or inferred memories;
- typed relations (updates/extends/derives);
- a dry run that binds to exactly the previewed set;
- per-fact expiry (`forgetAfter`);
- `guided-save` (draft before store) and a `memory-graph` MCP widget;
- an "Agents" page listing connected apps.
