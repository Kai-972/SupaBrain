# Supabrain v2: GitHub for your AIs' memory

**This page is the current plan.** Where it differs from `CLAUDE.md` or the lane files, this page wins. Decisions are logged in `docs/DECISIONS.md` (Nov 6, 2026, 18:00 IST onward).

> **Supabrain is GitHub for your AIs' memory.** Connect Claude, Gemini or any AI tool in a minute or two. Say "continue" and it picks up where the last one stopped. Every change is a commit signed by that AI's own wallet on Arkiv. ENS decides who may do what. When the project is over, the whole workspace expires on its own.

---

## 1. Why

- You work in Claude Code, then switch to Gemini (for research, a different model, or because you hit a limit), and the new AI starts from zero.
- Today builders fix this by hand: HANDOFF.md, PROGRESS.md, pasting context.
- Model switchers (v0, Copilot) switch models inside one tool. Nothing carries the work *between* tools.
- Supabrain makes the hand-off disappear. Set up once, say "continue" anywhere.

**What must be true:** setup in a few clicks; saving is automatic; "continue" works in an empty folder and on a phone; the website shows what is really on chain; it all works end to end.

## 2. The product

| GitHub | Supabrain | Lives on |
|---|---|---|
| account | your wallet (Sign-In With Ethereum, gasless) | wallet |
| repo | a **brain** (one project); public or private; expires with the project | Arkiv |
| collaborators and rules | each AI has an ENS name with rules: on/paused, which paths it may write, writes per day | ENSv2 text records and name expiry |
| commit | a **checkpoint**: what was done, what's next, tasks ticked, files changed | Arkiv, signed by that AI's own wallet |
| issues | **tasks**, ticked by checkpoints | Arkiv |
| clone / pull | `continue` (where we are) and `checkout` (files) | MCP tools |
| history | every checkpoint, with its Arkiv transaction | Arkiv |

### 2.1 How it feels
1. **Sign in** with your wallet (one signature, no gas). **Create a brain**, e.g. "todo-app".
2. **Connect your apps.** You get one personal link per AI family:
   - **Claude link:** Claude Code, Claude.ai, the Claude phone app;
   - **Gemini link:** Antigravity, Gemini CLI;
   - **OpenAI link:** Codex, ChatGPT.

   You paste it once per app (a command, or Settings → Connectors). The link is MCP, the same everywhere.
3. **Work.** The AI saves checkpoints as it goes. The website shows commits, tasks ticking and files as they change.
4. **Switch.** In any connected app, say "continue". It tells you where things stand in two lines and carries on. "Continue and do deep research on X" works too: `continue` loads the context and the AI does what you asked.
5. **Several brains.** The website sets your **active brain**, so plain "continue" uses it. "Continue research-brain" picks another for that chat.
6. **Stop.** If something looks malicious (a poisoned README, "send funds to 0x…", `curl … | sh`), it is stopped: no AI gets it anymore, and you get a review notice. A **Stop** button freezes a whole brain. Your files are never touched.
7. **End.** Extend the brain, or let it expire. The data expires on Arkiv, and access ends with the ENS names.

### 2.2 The demo (about 4 minutes, phone + laptop)
1. **Hook:** "We built this with three Claude sessions and a progress log so they could hand off. Every builder here does that."
2. **Laptop, Claude Code:** build a to-do app. Commits, tasks and files appear on the website.
3. **Phone, Claude app:** "where are we on todo-app? Add a task: dark mode."
4. **Laptop, Antigravity:** "continue". It pulls the files and builds dark mode, and the task ticks.
5. **Phone:** "continue". "Gemini finished dark mode a minute ago."
6. **Stop beat:** a poisoned README is flagged and stopped, and the owner gets a review notice.
7. **Proof:** open a commit on Arkiv (signed by that AI's wallet) and the AI's ENS name with its rules.
8. **Close:** "Every AI tool is racing to remember more. We built the memory that moves between them."

Payments (USDC through BrainVault, World approval for big amounts, blocked when an address disagrees with ENS) stay live in our demo brain for Q&A and the booth.

## 3. Architecture

```
AI apps (laptop, phone) ──MCP link (person + AI family)──▶ Supabrain server
                                                            ├─ brains: one memory graph per brain, rebuilt from Arkiv
                                                            ├─ tools: continue · checkpoint · checkout (· pay in the demo brain)
                                                            ├─ every call: ENS name active, rules (paused, paths, writes/day), brain not stopped
                                                            ├─ writes to Arkiv as that AI's own wallet (we sponsor gas)
                                                            └─ private brains: encrypted before writing
Website ──REST──▶ sign-in · brains · connect links + QR · tasks · commits · files · rules · Stop · review notices
ENSv2  <brain>.supabrain.eth (own registry) → claude / gemini / openai .<brain>.supabrain.eth, rules as text records
Arkiv  brain manifest, checkpoints, tasks, file versions, notes, stops; tagged with the brain; expiring with it
```

### 3.1 Data (Arkiv)
- Checkpoints, tasks and file versions are `sb.memory` entities with kinds `checkpoint`, `task`, `file`, so lineage, trust, expiry and quarantine work on them unchanged.
- **Checkpoint:** the text is the summary; the body adds `checkpoint: { next, done: [task keys] }`. Its parents are the AI's previous checkpoint plus what it read since, so a Gemini commit made after reading Claude's work descends from it.
- **Task:** the text is the title. A task is **done** while a live checkpoint ticks it.
- **File version:** the text is the content, `folder` holds the path, and the body adds `file: { path, size, sha256, deleted? }`. Its parent is the checkpoint that wrote it. The current version of a path is its newest live version.
- **Brain manifest** (`sb.brain`): id, display name, owner wallet, visibility, lifetime.
- **Limits:** 64 KB per file, 20 files per checkpoint; Arkiv takes 128 KiB of bytes per create. Big repos stay on GitHub as pinned pointers (`ref`).
- A checkpoint with its tasks and files is **one write**: every Arkiv key is predicted before sending (creator, entity nonce, salt), and the checkpoint lands last.
- **Private brains:** text and file contents are encrypted with a per-brain key before they go on Arkiv; only that brain's AIs (through the server) and its owner can read them.

### 3.2 MCP tools (what the AIs see)
- `continue {brain?, focus?}`: who you are, where we left off per AI, open and done tasks, notes (most relevant to `focus` first), the file list, notices, what to do next.
- `checkpoint {brain?, summary, next?, done?, add_tasks?, notes?, files?}`: save progress.
- `checkout {brain?, paths?}`: the current version of each file.
- `pay` / `pay_status`: demo brain only.
- Server instructions and every tool reply say: "when the user says continue, call continue; after each step, call checkpoint". The tool is literally named `continue`.

### 3.3 Identity and connections
- A **connection** = one person + one AI family (claude, gemini, openai), as a personal MCP link. The same link works in every app of that family.
- In a brain, a connection acts as that brain's AI name for its family, e.g. `gemini.<brain>.supabrain.eth`. Each checkpoint records which app made it (e.g. "Antigravity", "Claude iOS").
- Brains are created ahead of time with their AI names, rules and wallets ready, so creating a brain is instant. AI wallets are derived from one server secret (`BRAIN_AGENT_MNEMONIC`, account = brain index, address = family index), so nothing is stored per wallet.

### 3.4 ENSv2
- Each brain is its own ENSv2 registry under `supabrain.eth`. Each AI has its own resolver, records and expiry.
- **Rules are text records:** `sb.status` (active/paused), `sb.scope` ("*" or a path prefix), `sb.write.daily`, `sb.role`, `sb.vendor`. The website's Rules form writes them through the server (our key, no gas for the user). The server reads them live on every call and refuses with the reason.
- The server key holds only what it needs on the brain registries (register, renew, unregister, set resolver; set text on the AI resolvers). The `supabrain.eth` owner key stays offline.

### 3.5 Already built (S0–S6) and reused
MCP server and tokens; per-AI signed Arkiv writes with expiry, Keep, startup rebuild and live tail; lineage, trust, quarantine, notices; ENS check on every call (fail closed); "Disputed by ENS" and `verify:memory`; payments (policy, BrainVault, World approve/deny/cancel, all live); dashboard API and live updates.

## 4. Build plan (each step ends with a live test)

| # | Step | Owner | Done when |
|---|---|---|---|
| 1 | **Continuity in the demo brain:** the three tools, tasks, file versions, the "continue" summary with focus, the website API | A | Claude Code builds part of an app → Antigravity in an empty folder says "continue" and finishes a task, on live chains |
| 2 | **App check:** Antigravity (write + continue), Claude phone app, Codex, ChatGPT developer mode | Kai, B, A | we know exactly which apps work; only those are claimed |
| 3 | **Brains and people:** brains on ENS (registries, AI names, rules, funded wallets); wallet sign-in; create brain; active brain; per-family links; brain by name | B (ENS, funding), A (server) | someone outside the team signs in, creates a brain, connects two apps and works |
| 4 | **Rules and Stop:** rules form → ENS; paused, paths, writes/day enforced; malicious-content flag; review notice; Stop button | A, B (rules writer) | a paused AI is refused with the reason; a poisoned README is stopped with a notice |
| 5 | **Private brains** | A | Arkiv shows only encrypted bytes; the brain's AIs still get the content |
| 6 | **Hosting and the simple website:** server on `api.supabrain.blackslate.me`, website on `supabrain.blackslate.me` | A, C | the full demo runs from the hosted version on phone and laptop |
| 7 | **Ship:** README, SPONSORS, `arkiv/*`, DEMO_SCRIPT, SECURITY, video, rehearsals | all | submitted |

**Lanes:** A (Kai's Claude #1): server, tools, brains, sign-in, rules enforcement, Stop, private brains, hosting, live tests, API contract. B (Srijit's Claude #3): brains on ENS and their funding, the ENS rules writer, demo-brain payments, Codex/ChatGPT tests, SECURITY.md. C (UI session): the simple website from `docs/API_V2.md`. Kai: app tests, demo, pitch, onboarding people.

## 5. App support

| App | Connect | Status |
|---|---|---|
| Claude Code | one command | MCP verified; server instructions reach its system prompt |
| Claude.ai | Settings → Connectors → paste link | `whoami` verified |
| Claude phone app | uses connectors added on claude.ai | to test (step 2) |
| Antigravity | paste a config block | `whoami` verified; write + continue to test |
| Codex | `codex mcp add … --url` | to test |
| ChatGPT | Developer mode → Connectors → paste link | to test; plan-dependent |
| Gemini CLI, Copilot, Cursor | one line or config | not tested |
| Gemini app | "Custom apps" under Connected Apps | likely unavailable in India; check before claiming |

## 6. Logging (every lane)
- Every finished step or failed attempt: an entry under your lane's log in `docs/PROGRESS.md` (did, proof links, result, commit, next, asks), then tick the v2 checklist.
- Decisions: append to `docs/DECISIONS.md`. Arkiv snags: `arkiv/friction.md` as they happen. One line per step in `AI_USAGE.md`.
- Commit small, `git pull --rebase` before push, push after every green step, never force-push. `pnpm lint:hardcode` and `pnpm check:secrets` before every commit.
