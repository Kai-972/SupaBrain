# CLAUDE.md: Supabrain build brief (ETHGlobal Mumbai, Nov 5–7, 2026)

> **Every Claude session in this repo:**
> 1. Read this whole file once. It is the shared context, rules, contracts and stage plan.
> 2. Then read **only your lane file**:
>    - **Lane A, Brain** (Kai, Claude #1): `docs/lanes/A-BRAIN.md`. Covers the MCP server, memory engine, Arkiv and **ENS**.
>    - **Lane B, Money & Security** (Srijit, Claude #3): `docs/lanes/B-MONEY.md`. Covers the payment policy, BrainVault, World and the security docs.
>    - **Lane C, Face** (Kai, Claude #2): `docs/lanes/C-UI.md`. Covers the dashboard, onboarding UI and demo visuals.
> 3. Run `/start` (or the routine in §3.3) before your first action.
>
> - **Why we build it, the pitch, sponsor strategy and sources:** `PROJECT.md`.
> - **The idea in plain words:** `docs/IDEA.md`.
> - **Shared progress tracker:** `docs/PROGRESS.md`.
> - **Decision log:** `docs/DECISIONS.md`.
> - `docs/CLAUDE.srijit-original.md` is the earlier full brief. Use it only as reference. This file wins where they differ.

**Status:** revised Nov 6, 2026, 03:40 IST. It merges Srijit's brief with Kai's memory-first plan and Arkiv's feedback.

**Tags used in this file:**
- **CONFIRMED:** Kai decided it.
- **DEFAULT:** this brief chose it; a human may change it (log the change in `DECISIONS.md`).
- **VERIFY:** check against the live source before relying on it.
- **ASK:** stop and get the value from a human (§3.5).

**Submission deadline:** Sat Nov 7, 09:00 IST (VERIFY on the ETHGlobal hacker dashboard). Classic track, everything built at the event.

---

## 0. What we're building (60 seconds)

**Supabrain is a shared memory for a team's AIs that remembers where every fact came from. When a fact turns out wrong, you take it back from every AI at once, and no money moves on a lie.**

- **One memory, every vendor.** Claude Code, the Claude app and Antigravity (Gemini) all connect to **one remote MCP URL**. Gemini CLI is a snippet; ChatGPT is stretch.
- **It works like git.** Every memory records:
  - its author (an ENS-named agent);
  - its parents (what the agent read before writing it, recorded by the server);
  - a trust level (human 3, agent 2, evidence 1), equal to the **minimum** of its parents.
- **Undo.** "This is wrong" on a source gives a dry run ("1 source · 6 memories · 3 agents · 3 vendors"), then a revoke. Everything derived from that source is quarantined across all vendors, every agent that wrote or read it gets a retraction notice, and the next answer is correct. Good work stays, so it is surgical, not a rollback.
- **ENSv2 = identity + rules + kill switch.** Each agent is `<agent>.<team>.eth`, with role, folder scope, pay cap and a lease as records only the owner can change. Unregister the name and the agent can't write, and on chain it can't spend.
- **Arkiv = the shared store.** Memories, edges, revocations, notices and payment decisions are Arkiv entities **signed by the agent's own wallet**.
  - Memories expire after **2 days** unless a human clicks **Keep**. Quarantined memories are never extended, so lies die on their own.
  - Confidential content never goes on chain. A memory holds a **pointer** (GitHub private repo / Notion page) that only AIs with access can open.
- **Money is the second pillar.** `pay` traces where the payee address came from:
  - Outside content can't authorize money.
  - An address that disagrees with the vendor's own ENS record is blocked.
  - A new or over-cap payee needs a **World ID Agent Pass** human approval.
  - Real Circle test USDC moves through **BrainVault** on Sepolia, which checks the agent's ENS name on chain.

---

## 1. Decisions

| Topic | Decision | Tag |
|---|---|---|
| Story order | **Memory first** (shared brain + lineage + undo). Money is the second pillar and the stakes | CONFIRMED |
| Sponsors (3 picks) | **ENS** (Best Use of ENSv2) · **Arkiv** (Build on Arkiv from scratch, Swarm bonus as stretch) · **World** (World ID Agent Pass) | CONFIRMED |
| Lanes | Kai: Lane A (Brain + **ENS**) and Lane C (Face). Srijit: Lane B (Money & Security). 3 Claude sessions | CONFIRMED |
| Lead demo story | "Bank details changed": a vendor's wallet "changed" by email. It spreads through memory, then hits a payment | DEFAULT |
| Memory lifetime | Memory and evidence expire after 2 days. **Keep** extends (owner only). Quarantined memories are never extended. Revocations last the maximum (~182 d) and always outlive what they revoke | CONFIRMED (Kai told Arkiv) |
| Confidential data | Never on Arkiv. Memories hold a `ref` pointer (GitHub private repo pinned to a commit, or a Notion page) plus a non-secret label | CONFIRMED |
| Beyond-crypto integration | **Notion**: `notion:` pointers in the MVP; importing Notion memories as revocable roots is stretch | CONFIRMED (stretch level DEFAULT) |
| Chains | ENSv2 + BrainVault + USDC on **Ethereum Sepolia (11155111)**. Arkiv **Rabdi (7794095)** | DEFAULT |
| Custody | The server holds agent, team, policy-signer and guardian keys (disclosed). The owner key stays on dev machines only (Kai + Srijit), never on the host | DEFAULT |
| Read-sets | One per agent, keyed by the bearer token's agent label, no thread argument. Reset after `remember`, 30-min TTL, purged on revoke. Plus a separate **read log** (memory → readers), so the dry run shows who read a memory | DEFAULT |
| Human trust (3) | Only through the dashboard (owner-authenticated): **Add context** or **Correct this** | DEFAULT |
| ENS mismatch | A memory-claimed address that differs from the vendor's ENS address is a **hard block** with no override | DEFAULT |
| World deny path | Shown in the booth demo and the video. The 3-minute stage pitch may show only approve | DEFAULT |
| MCP SDK | `@modelcontextprotocol/sdk` v1.32.x, stateless Streamable HTTP | DEFAULT |
| Arkiv SDK | `@arkiv-network/sdk` 1.0.x (`defineSchema`, `select().from().where()`, `executeBatch`) | DEFAULT |
| Web | Next.js App Router, Tailwind, shadcn/ui, `@xyflow/react` + dagre, SSE | DEFAULT |
| Names | Agents `lead-claude` (Claude, lead), `gem-research` (Gemini, worker), `gpt-writer` (OpenAI, worker). Vendor `acme`. Human `owner`. Team label: ASK | DEFAULT |
| Later (on hold) | GitHub-style public memory: publish a branch others can pull. `/advisories` is the first step | CONFIRMED |

---

## 2. Ground rules (non-negotiable)

### 2.1 Real, not simulated
- Every demo claim uses real chains and real signatures (Sepolia, Arkiv Rabdi, World Agent Pass). Testnets are fine.
- Mocks are allowed only in unit tests and in the UI's `?mock=1` fixture mode, which must show a visible **MOCK DATA** banner.
- If a sponsor integration can't be made real, **stop and report it in `PROGRESS.md`**. Never fake it.

### 2.2 Nothing hard-coded
- Chain IDs, addresses, RPC URLs, token addresses, ENS names, caps, expiries, text keys and snippets come from one of:
  - `config/*.json`, validated with zod in `packages/shared/src/config.ts`;
  - generated `config/deployments/*.json`;
  - live discovery (viem Universal Resolver, `getSubregistry`);
  - env (secrets only).
- Hand-copied config values carry `"source"` and `"verifiedAt"`.
- `pnpm lint:hardcode` must pass before every commit.
- At startup, check that `eth_chainId` matches the config and that `getCode` is non-empty for every configured contract. Fail closed.

### 2.3 Secrets
- Secrets go only in `.env.local` (gitignored) or the host's secret store.
- Never put a secret in commits, logs, the browser bundle (`NEXT_PUBLIC_*` is public), chat, Arkiv, or `PROGRESS.md`.
- Never print a secret. Print its name and a derived public value, such as an address.
- Redact RPC URLs everywhere: the Arkiv key rides in the URL path.
- Share `.env.local` values between Kai and Srijit privately, never in the repo or a group chat.
- Run `pnpm check:secrets` before every push.

### 2.4 Working style
- Be dense and direct. Ask, don't guess.
- Work stage by stage (§8). **No time estimates.**
- Write failing tests first for every money or authority check: trust calc, quarantine, policy engine, vault, token validation, ENS authority.
- Use boring libraries: viem, zod, express, jose, Foundry, Next.js. Don't add a dependency for anything under 30 lines.
- Every status shown in the UI has a text label, never color alone.

---

## 3. Lanes, ownership and the session routine

### 3.1 Who owns what

| Lane | Person / Claude | Owns (only edit these) | First stage |
|---|---|---|---|
| **A: Brain** | Kai / Claude #1 | `apps/server`, `packages/shared` (types + config owner), `packages/ens`, `scripts/ens`, `scripts/keys`, `scripts/demo/seed.ts`, `scripts/notion`, `arkiv/`, `config/` (except `world.json`) | S0 scaffold, then S1 ENS, S2 Arkiv, S3 MCP |
| **B: Money & Security** | Srijit / Claude #3 | `packages/payments`, `contracts/`, `scripts/vault`, `scripts/demo/step-kill.ts`, `config/world.json`, `SECURITY.md`, `WORLD_DEBRIEF.md` | S4 World, S5 vault (unit tests first) |
| **C: Face** | Kai / Claude #2 | `apps/web`, `docs/DEMO_SCRIPT.md`, `README.md` (visuals and structure; addresses table generated by A's script), video | UI on fixtures from S0 |

**Shared files, any lane may append:**
- `docs/PROGRESS.md`: your own lane's sections only.
- `docs/DECISIONS.md`: append only.
- `arkiv/friction.md`: anyone who hits an Arkiv snag.

### 3.2 Rules
- Lane A pushes the scaffold (S0) first. B and C `git pull`, then work in parallel.
- **Interfaces first.** The contracts in §6 are written in S0. Change them only with a note under **Requests** in `PROGRESS.md`, and tell the other lanes.
- Need something from another lane? Write it under **Requests** in `PROGRESS.md`. Don't edit their files.
- **B depends on A** for:
  - `config/deployments/ens.sepolia.json` (agent labelhashes, team registry, vendor names);
  - the `EnsAuthority` implementation;
  - the `GraphView` / `ArkivWriter` adapters.

  Until those land, B uses the in-memory fakes in `packages/shared/src/testing/` **for unit tests only**.
- **C depends on A** for the dashboard API (§6.4). C builds against `apps/web/fixtures/demo.json` until A's Stage 2 is done.
- **Claude Pro quota hygiene:**
  - One session per lane.
  - `/clear` between stages.
  - Read only your lane file.
  - Summarize logs; don't paste them.
  - Use subagents only as §13 says.
  - Near the limit, run `/handoff`.

### 3.3 Session start routine (`/start`)
1. `git pull --rebase`.
2. Read `docs/PROGRESS.md` (the Board, your lane's checklist, open Requests addressed to you) and the last 10 entries of `docs/DECISIONS.md`.
3. Run `pnpm doctor` once it exists. It reports missing env names, balances and chain checks.
4. Post a 5-line status:
   - lane;
   - current stage/step;
   - what's green;
   - what's blocked;
   - next step.
5. Update your row on the Board, then start.

### 3.4 Progress logging (`/log`)
After every finished step or failed attempt, append an entry under **your lane's log** in `docs/PROGRESS.md` (newest first):
```
### 2026-11-06 14:05 IST · A · Stage 1 / S1 step 3
- did: registered <team>.eth; deployed team UserRegistry
- proof: <etherscan url> <arkiv explorer url>
- result: PASS | FAIL (<why>)
- commit: 3f2a9c1
- next: S1 step 4 (agent resolver)
- asks/blockers: none
```
Then tick the matching checkbox in the stage checklist and commit with `docs(progress): …`.

### 3.5 ASK protocol (credentials, money, names, irreversible actions)
Stop and print exactly this, then wait:
```
🛑 NEED INPUT: <short name>
Why: <what's blocked>
How to get it: <steps / URL>
Where it goes: .env.local → <VAR_NAME>   (paste it into the file yourself and reply "done";
               if you paste it in chat I will write it to .env.local and never repeat it)
Fallback if skipped: <what happens instead, or "none, stage blocked">
```
- Once you have the value, validate it (derive the address, check the chain or balance) and log `ASK <name>: received, validated (<public detail>)`. **Never log the value.**
- For interactive logins, ask the human to run the command themselves with the `!` prefix, e.g. `! railway login`.
- Every on-chain broadcast needs an ASK "go". Show the to-address, function, args and value first.

---

## 4. Repo layout (Lane A creates it in S0)

```
supabrain/
├─ CLAUDE.md                ← this file
├─ PROJECT.md               ← pitch, problem, sponsors, sources
├─ README.md                ← judges' entry point (C structure, A generates the address table)
├─ SPONSORS.md              ← per sponsor: why core, feature → file:line, requirement checklist
├─ SECURITY.md              ← threat model + controls (B)
├─ AI_USAGE.md              ← how AI was used (all lanes append)
├─ WORLD_DEBRIEF.md         ← World prize debrief (B)
├─ LICENSE                  ← MIT
├─ .claude/commands/        ← /start /log /handoff
├─ arkiv/                   ← schema.md why-arkiv.md how-you-use-arkiv.md reach.md friction.md [swarm.md]
├─ docs/
│  ├─ PROGRESS.md  DECISIONS.md  IDEA.md  DEMO_SCRIPT.md  ARCHITECTURE.md
│  └─ lanes/A-BRAIN.md  B-MONEY.md  C-UI.md
├─ config/
│  ├─ app.json networks.json ens.sepolia.json tokens.sepolia.json world.json demo-scenario.json
│  └─ deployments/          ← GENERATED by scripts, committed: ens.sepolia.json vault.sepolia.json
├─ packages/
│  ├─ shared/               ← config loader (zod), types, interfaces, test fakes (A owns)
│  ├─ ens/                  ← ENS reads, authority check, watcher (A)
│  └─ payments/             ← decidePayment, intents, attestation, vault client, World client (B)
├─ apps/
│  ├─ server/               ← MCP + engine + Arkiv adapter + dashboard API/SSE (A)
│  └─ web/                  ← dashboard (C)
├─ contracts/               ← Foundry: BrainVault.sol + tests + deploy (B)
├─ scripts/
│  ├─ keys-new.ts doctor.ts check-hardcode.mjs check-secrets.mjs   (A)
│  ├─ ens/   verify-deployments register-team deploy-team-registry add-agent add-vendor set-records unregister (A)
│  ├─ vault/ deploy set-agents fund-check (B)
│  ├─ notion/import.ts (A, stretch)
│  └─ demo/  seed.ts reset-team.ts (A) · step-kill.ts (B)
├─ .env.example  .gitignore
```

---

## 5. Config and environment

### 5.1 `config/app.json` (shape; zod-validated)
```jsonc
{
  "appNamespace": "supabrain-mumbai26",        // Arkiv `app` attribute on every entity + every query
  "team": { "id": "team1", "displayName": "Demo Team" },
  "ens": {
    "teamLabel": "<ASK>", "leaseDays": 7, "teamNameDurationDays": 28,
    "textKeys": { "role": "sb.role", "scope": "sb.scope", "payCap": "sb.pay.cap", "payDaily": "sb.pay.daily",
                  "status": "sb.status", "memoryHead": "sb.memory.head", "vendor": "sb.vendor",
                  "agentContext": "agent-context", "agentEndpointMcp": "agent-endpoint[mcp]" }
  },
  "agents": [
    { "label": "lead-claude",  "vendor": "claude", "role": "lead",   "scope": "*",        "payCapUsdc": "4", "payDailyUsdc": "30", "vaultDailyCeilingUsdc": "30" },
    { "label": "gem-research", "vendor": "gemini", "role": "worker", "scope": "research", "payCapUsdc": "2", "payDailyUsdc": "4",  "vaultDailyCeilingUsdc": "4" },
    { "label": "gpt-writer",   "vendor": "openai", "role": "worker", "scope": "comms",    "payCapUsdc": "0", "payDailyUsdc": "0",  "vaultDailyCeilingUsdc": "0" }
  ],
  "vendors": [ { "label": "acme", "displayName": "Acme Studio" } ],
  "trust": { "human": 3, "agent": 2, "evidence": 1 },
  "readSet": { "ttlSec": 1800 },
  "keep": { "defaultDays": 7, "maxDays": 30 },
  "payments": { "intentTtlSec": 900, "attestationTtlSec": 300, "maxRootsPerAttestation": 8 },
  "arkivExpirySec": {
    "memory": 172800, "evidence": 172800,         // 2 days (CONFIRMED)
    "edge": "follow-child", "taint": "follow-memory",
    "notice": 172800, "paymentIntent": 900, "paymentDecision": 2592000,
    "revocation": "max"                            // ExpirationTime.max() (~182 d); must outlive keep.maxDays
  },
  "refs": { "allowedKinds": ["github", "notion", "url"] }
}
```
- Caps in `app.json` only **seed** ENS during setup. At runtime the server reads caps **from ENS records**.
- Lead's `payCapUsdc` of 4 is deliberate: the demo's 5 USDC invoice hits `OVER_CAP`, which exercises the World approve path.

### 5.2 Other config
- **`networks.json`:**
  - `sepolia`: chainId 11155111, explorer tx template.
  - `rabdi`: chainId 7794095, rpc `https://rpc.rabdi.db-chain.testnet.arkiv.network`, explorer `https://rabdi.explorer.arkiv.network`, faucet.
  - Both need `source` + `verifiedAt`.
- **`ens.sepolia.json`:** ENSv2 Sepolia addresses copied **only** from `https://docs.ens.domains/learn/deployments/` (Sepolia v2 section).
  - VERIFY the redeploy date. Srijit's research says 2026-10-01, commit `07e55a05`; older notes said 2026-09-15. Older hackathon repos are stale.
- **`tokens.sepolia.json`:** Circle USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (source: developers.circle.com). Verify `decimals()==6` at startup.
- **`world.json`** (B): `issuer` (ASK at the booth), `scope: "openid"`, `requireEnrolledSub: false`, `approvalTtlSec`. Endpoints come only from discovery.
- **`demo-scenario.json`:** email text, invoice text, budget, amounts, source IDs. It's content, kept out of code.

### 5.3 `.env.example`
```
SEPOLIA_RPC_URL=
ARKIV_ACCESS_KEY=
OWNER_PRIVATE_KEY=                # dev machines only, NEVER on the host
TEAM_PRIVATE_KEY=
AGENT_LEAD_CLAUDE_PRIVATE_KEY=
AGENT_GEM_RESEARCH_PRIVATE_KEY=
AGENT_GPT_WRITER_PRIVATE_KEY=
VENDOR_ACME_PRIVATE_KEY=          # honest vendor's own wallet (owns acme's resolver + payout addr)
POLICY_SIGNER_PRIVATE_KEY=        # B
GUARDIAN_PRIVATE_KEY=             # B
WORLD_CLIENT_ID=                  # B
WORLD_CLIENT_SECRET=              # B
WORLD_APPROVER_SUB_HASH=          # B, stretch
NOTION_TOKEN=                     # A, stretch (Notion import)
PUBLIC_BASE_URL=
TOKEN_SIGNING_SECRET=
DASHBOARD_ADMIN_PASSPHRASE=
NEXT_PUBLIC_SERVER_URL=           # public, not secret
```
Agent key env names derive from labels: `AGENT_${LABEL.toUpperCase().replace(/-/g,'_')}_PRIVATE_KEY`.

### 5.4 Guard scripts (S0, Lane A)
- **`check-hardcode.mjs`:**
  - Flags 0x40-hex and 64-hex literals, `http(s)://` literals, and the chain IDs `11155111` / `7794095` in `apps/**`, `packages/**`, `contracts/src/**` and `scripts/**`.
  - Ignores `config/**`, tests, `**/fixtures/**`, `docs/**`, `*.md`, and lines tagged `// hardcode-ok: <reason>`.
- **`check-secrets.mjs`:** fails on staged `PRIVATE_KEY=0x…64hex`, long `ARKIV_ACCESS_KEY` values, a `WORLD_CLIENT_SECRET=` value or `NOTION_TOKEN=secret_…`. Also greps `apps/web/.next` for env values.
- **`doctor.ts`:** reports env names present/missing, derived addresses, chain IDs, balances (Sepolia ETH, vault USDC, tGLM), Arkiv RPC check and World discovery reachability.
- Root scripts: `lint:hardcode`, `check:secrets`, `doctor`, `test`, `dev`, `build`. Add a pre-commit hook running both guards.

---

## 6. Cross-lane contracts (written in S0 in `packages/shared`; change only with a Requests note)

### 6.1 Types (`packages/shared/src/types.ts`)
```ts
export type Vendor = "claude" | "gemini" | "openai" | "human";
export type Trust = 1 | 2 | 3;                                   // evidence | agent | human
export type Role = "owner" | "lead" | "worker" | "observer";
export type MemoryKind = "fact" | "decision" | "plan" | "address" | "evidence" | "payment" | "ref";
export type Status = "active" | "quarantined" | "stale" | "expired" | "proposal" | "restored";

export interface SourceRef { type: "email" | "web" | "file" | "tool" | "chat" | "notion" | "github"; id: string; url?: string; swarmRef?: string }
// Private content stays off chain; Arkiv only holds this pointer + a non-secret label.
export interface PrivateRef { kind: "github" | "notion" | "url"; locator: string; version?: string; label: string }
//   github: locator "owner/repo:path", version = commit SHA (required for github)
//   notion: locator = page id or URL

export interface MemoryNode {
  key: `0x${string}`; text: string; kind: MemoryKind; folder: string; trust: Trust;
  agent: string; vendor: Vendor; seq: number; createdAt: number; expiresAt: number; kept?: boolean;
  parents: string[]; roots: string[];                           // roots = source ids + human-root memory keys
  subject?: string;                                             // ENS name it's about (acme.<team>.eth)
  address?: `0x${string}`;                                      // kind=address
  source?: SourceRef;                                           // kind=evidence
  ref?: PrivateRef;                                             // kind=ref (or any memory pointing at private content)
  supersedes?: string;                                          // set by "Correct this"
  status: Status; pending?: boolean; proofUrl?: string; creator?: `0x${string}`;
}
export interface Edge { parent: string; child: string; tainted?: boolean }

export type RevocationTarget = { type: "source" | "agent" | "memory"; id: string };
export interface DryRun {
  target: RevocationTarget; memories: string[]; agents: string[]; vendors: Vendor[];
  readers: string[];                                            // agents that READ affected memories (read log)
  pendingPayments: string[]; roots: `0x${string}`[];
}

export interface AgentView { label: string; ens: string; vendor: Vendor; role: Role; scope: string; wallet: `0x${string}`;
  registered: boolean; leaseExpiresAt: number; status: "active" | "quarantined" | "unregistered" | "expired";
  payCap: string; payDaily: string; lastWriteAt?: number; connectedClient?: string }

export type PayReason =
  | { code: "QUARANTINED_LINEAGE"; revoked: string[] }
  | { code: "ENS_MISMATCH"; ensName: string; ensAddress: string; claimedAddress: string }
  | { code: "OUTSIDE_CONTENT_PAYEE"; sources: string[] }
  | { code: "UNKNOWN_PAYEE" } | { code: "NEW_PAYEE" }
  | { code: "OVER_CAP"; cap: string; amount: string } | { code: "OVER_DAILY"; daily: string; spentToday: string }
  | { code: "AGENT_NOT_AUTHORIZED"; detail: string };

export type PayDecision =
  | { status: "paid"; txHash: `0x${string}`; txUrl: string; intentId: string }
  | { status: "blocked"; reasons: PayReason[]; path: string[]; intentId: string }
  | { status: "pending_human"; reasons: PayReason[]; approval: ApprovalView; intentId: string }
  | { status: "denied" | "expired" | "cancelled"; intentId: string }
  | { status: "failed"; error: string; intentId: string };

export interface ApprovalView { id: string; intentId: string; agent: string; payee: `0x${string}`; payeeEns?: string; amount: string;
  reasons: PayReason[]; userCode: string; verificationUri: string; verificationUriComplete?: string; expiresAt: number }

export interface Payment { intentId: string; agent: string; payee: `0x${string}`; payeeEns?: string; amount: string; memo: string;
  decision: PayDecision; createdAt: number; lineage: string[] }

export type StreamEvent =
  | { t: "memory"; node: MemoryNode; edges: Edge[] } | { t: "confirmed"; key: string; proofUrl: string }
  | { t: "revocation"; target: RevocationTarget; affected: string[]; arkivUrl?: string; vaultTxUrl?: string; ensTxUrl?: string }
  | { t: "notice"; toAgent: string; count: number }
  | { t: "kept"; key: string; expiresAt: number } | { t: "expired"; key: string }
  | { t: "connected"; agent: string; client?: string }            // first whoami from a client
  | { t: "payment"; payment: Payment } | { t: "approval"; approval: ApprovalView }
  | { t: "agent"; agent: AgentView };
```

### 6.2 `EnsAuthority` (`packages/ens`, Lane A implements; the server and Lane B consume it)
```ts
export interface EnsAuthority {
  getAgentAuthority(label: string): Promise<AgentView & { recordsOk: boolean }>; // live getOwner(labelhash) + text records via UR; short cache
  resolveEns(name: string): Promise<`0x${string}` | null>;                        // viem getEnsAddress (Universal Resolver)
  findVendorEns(address: `0x${string}`): Promise<string | null>;                  // reverse-lookup among configured team vendor names
  teamVendors(): string[];                                                        // full ENS names of team vendors
  agentRegistryRef(label: string): { registry: `0x${string}`; labelhash: `0x${string}` }; // for vault setAgent
  watch?(onEvent: (e: { type: "unregistered" | "expiry" | "roles" | "records"; label: string; txHash: string }) => void): () => void; // SHOULD
}
```
If any ENS read fails, **fail closed**: authority is unknown, so writes and payments pause, and the UI says so.

### 6.3 `Payments` (`packages/payments`, Lane B implements; Lane A calls it from the server)
```ts
export interface GraphView {                      // A provides (read-only view of the in-memory graph)
  memoriesByAddress(addr: `0x${string}`): MemoryNode[];   // includes quarantined
  memoriesBySubject(ensName: string): MemoryNode[];
  ancestors(key: string): MemoryNode[];
  status(key: string): Status;
}
export interface ArkivWriter {                    // A provides (serialised per signer)
  writePayment(p: Payment): Promise<{ key: string; proofUrl: string }>;
}
export interface PaymentsDeps { ens: EnsAuthority; graph: GraphView; arkiv: ArkivWriter; emit: (e: StreamEvent) => void; config: AppConfig }

export interface Payments {
  pay(agentLabel: string, input: { payee: string; amount: string; memo: string; cites?: string[] }): Promise<PayDecision>;
  status(intentId: string): Promise<PayDecision>;
  onRevoke(dry: DryRun, target: RevocationTarget): Promise<{ vaultTxUrl?: string; cancelled: string[]; error?: string }>;
  pauseAgent(label: string): Promise<{ txUrl?: string; error?: string }>;
  list(): Payment[];
  approvals(): ApprovalView[];
  cancel(approvalId: string): Promise<void>;
}
export function createPayments(deps: PaymentsDeps): Payments;
```
Until Lane B delivers, the server mounts `createPaymentsDisabled()`. It returns `{status:"failed", error:"payments not enabled yet"}`, which is honest, not faked, and the UI hides the payments nav.

### 6.4 Dashboard API (Lane A serves, Lane C consumes; admin = owner passphrase cookie)
```
GET  /api/team                              → { team, agents: AgentView[], vendors, counts }
GET  /api/graph?since=<seq>                 → { nodes: MemoryNode[], edges: Edge[], seq }
GET  /api/memory/:key                       → MemoryNode & { lineage: string[][]; readers: string[] }
POST /api/memory/human   {text, kind, folder, subject?, ref?}   → MemoryNode (trust 3)            (admin)  "Add context"
POST /api/memory/:key/keep    {days?}       → { expiresAt }  (refused if quarantined)              (admin)
POST /api/memory/:key/correct {text}        → { revocationKey, newKey }  (revoke + human memory)   (admin)
POST /api/dryrun         {target}           → DryRun                                               (admin)
POST /api/revoke         {target, mode?}    → { revocationKey, arkivUrl, vaultTxUrl?, ensTxUrl?, affected } (admin)
POST /api/restore        {key}              → { status } | { approvalRequired: ApprovalView }      (admin, stretch)
GET  /api/recall-log?agent=&q=              → [{ at, agent, query, results:[{key,status}] }]  (before/after panel)
GET  /api/payments                          → Payment[]
GET  /api/approvals                         → ApprovalView[]
POST /api/approvals/:id/cancel              → 204                                                  (admin)
POST /api/pair           {label, client?}   → { token, snippets: Record<Client,string>, qrPayload, expiresAt } (admin)
GET  /api/advisories?payee=&source=         → public revocations, read LIVE from Arkiv             (public)
GET  /api/stream?since=<seq>                (SSE) → StreamEvent
POST /api/admin/login    {passphrase}       → httpOnly cookie
```
`Client = "claude-code" | "claude-ai" | "antigravity" | "gemini-cli" | "chatgpt"`.

---

## 7. Engine rules (summary; full detail in A-BRAIN.md; B relies on 1–4)

1. **Trust:**
   - Evidence is 1, with `roots=[source.id]`.
   - A human memory is 3 (dashboard only), with `roots=[ownKey]`.
   - An agent memory is `min(parents)`, or 2 when it has no parents. Its roots are the union of its parents' roots.
   - An agent can never produce 3.
2. **Lineage:**
   - The parents are the non-empty `cites` (each must be in the agent's read-set), or else the full read-set. The read-set is reset after each write.
   - Quarantined items never enter a read-set.
   - The **read log** keeps `memory → readers` for the dry run and notices.
3. **Quarantine is lazy.** `status(m)` is quarantined if `m` or any ancestor:
   - is a revoked memory;
   - has a root in the revoked sources; or
   - was authored by a revoked agent.

   `expired` means it's gone from Arkiv (the graph shows a ghost). `stale` means an evidence ancestor has expired.
4. **Recall** returns quarantined items flagged `QUARANTINED` with a `why`, never as facts. Every tool result carries unread notices inline.
5. **Revoke** (in order):
   1. Write the Arkiv revocation (team wallet).
   2. Call `payments.onRevoke` (vault `revokeRoot` + cancel intents).
   3. Purge affected keys from read-sets.
   4. Create notices for authors and readers.
   5. Send SSE events.

   Every step reports a proof URL. A failed vault step shows a red "retry" but doesn't undo the revoke.
6. **Keep:** an owner-only extend of the memory **plus its edges and taint rows**, capped at `keep.maxDays`. Refused for quarantined memories.
7. **Correct this** = revoke `memory:<key>`, then create a human memory with `supersedes: key`.
8. **ENS check** on every `whoami`, `remember` and `pay`: `getOwner(labelhash)` must be the agent's wallet, the status active, and the folder within `sb.scope`.
9. **Payment policy:** B-MONEY.md §3 (`decidePayment`). It uses the **whole team graph** for payee lineage, never the read-set.

---

## 8. Stages (the repo-wide plan; do them in order; parallel within a stage)

Tick each item in `docs/PROGRESS.md` with proof. A failing spike means **STOP**: log it, ask the team and choose the fallback.

| Stage | Lane A (Kai #1) | Lane B (Srijit #3) | Lane C (Kai #2) | Done when |
|---|---|---|---|---|
| **S0 Scaffold** | Monorepo, config + zod, types + interfaces (§6), test fakes, guard scripts, `.env.example`, PROGRESS/DECISIONS seeded, MIT, first push | Pull. Read B-MONEY.md. Set up Foundry in `contracts/` | Pull. Next.js app, tokens, fixture loader, `?mock=1` banner | Everyone builds from `main`; `pnpm lint:hardcode` green |
| **S1 Spikes** | **S1 ENS** (team name, registry, agent + resolver, scoped record, unregister) · **S2 Arkiv** (batch, ownership, query, watch, readonly-extend test) · **S3 MCP** (public host, 3 clients) | **S4 World** device flow (approve, deny, expire) · **S5 Vault** unit tests with a mock registry, then a fork test after A's S1 handoff | Static graph on fixtures with all visual encodings + list view | All spike criteria ticked, or a fallback chosen and logged |
| **S2 Memory core** | `whoami`/`recall`/`remember`/`explain`, lineage, trust, Arkiv batch writes, startup rebuild, ENS check per call, SSE, `/api/team`, `/api/graph`, `/api/memory/:key` | Vault deployed, one real 1-USDC pay, `step-kill` revert proven. `decidePayment` table tests | Drawer, agents rail, live feed (fixture timeline), then switch to the real `/api/graph` + SSE | Claude Code and Antigravity write to the same graph; the UI shows it live |
| **S3 Undo** ⭐ | Dry run, revoke, quarantine, read log, notices, Keep/expiry, Correct this, Add context, `ref` pointers, recall log | `onRevoke` (`revokeRoot`, cancel intents) and `pauseAgent` | Dry-run modal + cascade, Keep, Correct this, Add context, pointer chip, before/after panel | **Checkpoint: the memory-first product works end to end without money.** Rehearse it once |
| **S4 Onboarding** | `/api/pair`, tokens, per-client snippets, `connected` event, path-token route | – (security review of the token design, §B6) | `/connect` page with QR, snippets, "waiting for your AI…" | A stranger's AI connects from the QR and appears in the graph |
| **S5 Money** | Mount `createPayments`, wire the `pay`/`pay_status` MCP tools, set up the `acme` vendor ENS, write the deployments json | `createPayments` complete: policy → intent → attestation → vault; ENS-mismatch block | Payments page (fixture, then real) | P1 BLOCKED (ENS mismatch) from a real MCP client; P3-style paid tx on Etherscan |
| **S6 Human** | – | World approve → paid; deny/expire → nothing moves; Arkiv decision entities | Approval card (code, QR, intent summary, cancel) | Both World paths work live |
| **S7 Extras** (in cut order) | ENS watcher, Notion import, public "ETHMumbai brain" team, `/api/advisories` | Restore-with-World, `SECURITY.md` polish | Rules page, advisories page, landing, mobile pass | Whatever fits |
| **S8 Ship** | `seed.ts` on a fresh team, Arkiv docs, README address table, `AI_USAGE.md` | `WORLD_DEBRIEF.md`, `SECURITY.md`, V1 contract review | `DEMO_SCRIPT.md`, video, README structure, Vercel | 3 full rehearsals, V2 sponsor audit, submitted. **Feature freeze well before the deadline; agree the cutoff together** |

---

## 9. Demo (memory first; full runbook in `docs/DEMO_SCRIPT.md`, Lane C)

**Prep:**
- `pnpm demo:reset && pnpm demo:seed`. It makes real MCP calls as each agent, so the lineage is real.
- Fund the vault with at least 10 USDC.
- Open Claude Code + Antigravity on the laptop, World App on a phone, and the dashboard on the projector.
- Bring our own hotspot, a backup video, and the labelled `?mock=1` as a last resort.
- The seed must run within 2 days of judging (memory lease).

**Script, about 4 minutes:**
1. **Hook.** "Our AIs share memory. One email said our designer's wallet changed. All three believed it."
2. **Live switch.** "I've been building in Claude Code." Open Antigravity, paste one line, and Gemini says "I'm gem-research.<team>.eth, I write to research", already knowing the project. The agents rail shows it as connected.
3. **The lie spreading.** The graph shows email → Gemini → Claude → GPT, across 3 vendors.
4. **Blocked.** "Pay Acme's invoice" in Claude Code returns **BLOCKED**: the email says 0xBAD, `acme.<team>.eth` says 0x9F2. The path is highlighted. (Fallback: `pnpm demo:step blocked`. Never depend on a model being fooled live.)
5. **Undo.** Click the email, choose "This is wrong", and the dry run shows "1 source · 6 memories · 3 agents · 3 vendors · read by 3". Revoke. Red cascades, the human budget stays green, and the Arkiv and vault proof links appear.
6. **The AIs fix themselves.** Ask Gemini again: it reports the retraction and gives the ENS-verified address. Show the before/after panel.
7. **Human + money.** Claude pays `acme.<team>.eth` 5 USDC, which is over its cap of 4, so the payment goes to PENDING HUMAN. Approve in World App. PAID, with the Etherscan link. (Booth and video version: also show the attacker's "partner" address being denied.)
8. **Kill** (if time allows, otherwise in Q&A or the video). Unregister `gem-research`. A direct vault call reverts with `AgentNotRegistered` on chain.
9. **Close.** "Every AI company is racing to make AI remember more. We built the part that lets you take it back."

---

## 10. Required documents (skeletons in S0, fill as you go)

| Doc | Owner | Must contain |
|---|---|---|
| `README.md` | C (A generates the addresses) | Pitch, video, live link + `/connect`, diagram, **address table** (ENS names, registry, resolvers, vault, USDC, Arkiv writer wallets), **one runnable Arkiv query**, proof links, setup, honest limits, license, AI note |
| `SPONSORS.md` | C, with A/B pointers | Per sponsor: what breaks without it, feature → file:line → what the user sees, requirement checklist with evidence, video timestamp |
| `arkiv/*.md` | A | `schema.md`, `why-arkiv.md` (what Postgres loses; what we kept off chain: private content, transcripts, tokens), `how-you-use-arkiv.md`, `reach.md` (live agent/vendor counts from `$creator`), **`friction.md` written as things happen** |
| `SECURITY.md` | B | Threat model, controls, key custody, Binance lessons (without overclaiming), known gaps |
| `WORLD_DEBRIEF.md` | B | Time to first success, friction, missing action binding, backend validation, where the deny/expire paths are |
| `AI_USAGE.md` | all | Tools, what AI drafted vs what humans designed/decided/reviewed, how output was verified, one line per stage |

---

## 11. Cut order and never-cut

**Cut first → last:**
1. ChatGPT + Gemini CLI testing
2. Swarm
3. Notion import (keep `notion:` pointers)
4. Restore
5. Observer proposals
6. Public "ETHMumbai brain"
7. `/advisories` page (keep the README query)
8. ENS watcher (keep the per-call `getOwner` check)
9. Vault `revokeRoot`
10. On-chain kill revert (keep the server-side ENS check)

**Never cut:**
- the live switch Claude → Gemini on one memory;
- the cross-vendor revoke cascade with dry run;
- the re-ask answer changing;
- the ENS check on every call;
- Arkiv as the store the UI reads from;
- `arkiv/friction.md`;
- `pay` BLOCKED by ENS mismatch;
- World approve **and** deny paths;
- a real USDC payment (vault preferred; a direct `transfer` fallback only as a logged team decision);
- an honest README.

---

## 12. Git
- Commit small and often with conventional messages (`feat(server): …`, `test(vault): …`, `docs(progress): …`). Push after every green step.
- `git pull --rebase` before pushing. **Never force-push or rewrite history.**
- Work on `main` inside your own lane's dirs. Use a short branch + PR only for `packages/shared` changes.
- Never commit `.env*` (except `.example`), keys or tokens. **Do** commit `config/deployments/*.json` and Foundry `broadcast/` for Sepolia: they're proof.

---

## 13. Subagents (verification only; give each one a self-contained brief)

| ID | When | Brief |
|---|---|---|
| V1 Contract review | Before deploying BrainVault (B) | Adversarial audit: owner vs guardian (tighten only), EIP-712 domain and replay, revoked-root bounds, `getOwner` semantics, daily roll, SafeERC20, reentrancy. Run `forge test -vvv`; report by severity |
| V2 Sponsor audit | Before S8 submission (C) | For each prize requirement (PROJECT.md §6), find evidence (file:line, tx, query). Table: PASS/GAP/fix |
| V3 Policy red team | After S5 (B) | Build inputs that get a bad payment ALLOWED; write each as a failing vitest case |
| V4 Fact check | When docs, SDK and notes disagree (any) | Official sources only; CONFIRMED/WRONG + URL + exact signature |
| V5 Secrets sweep | Before every deploy (A) | Run both guards, grep the web bundle, check git history for `.env` |
| V6 E2E rehearsal | S8 (A) | Seed a fresh team; run the DEMO_SCRIPT steps; PASS/FAIL with proof URLs |

A subagent never broadcasts transactions or touches secrets.

---

## 14. Known gotchas
- **ENSv2:**
  - Use the deployments page only (Sepolia was redeployed).
  - Admin roles can be set only at registration.
  - Token IDs are mutable, so key by labelhash.
  - Setter grants cover every name a resolver serves, so use **one resolver per agent**.
  - Setters take a DNS-encoded name.
  - Read through the Universal Resolver (viem ≥ 2.35). Direct `text()` on the resolver can revert.
  - `ens-cli` is experimental.
- **Arkiv:**
  - SDK 1.0 renamed everything.
  - No `!=` / `NOT`.
  - **Don't rely on ORDER BY:** sources disagree on whether Rabdi supports it, so sort on the client.
  - The `getLogs` window is about 1,000 blocks, so start the watcher, then query.
  - Expiry emits no event, so the server checks `expiresAt` and emits `expired` itself.
  - Always set nonce, gas and gasPrice explicitly, and serialize writes per signer.
  - Keyless RPC returns 429s.
  - The access key never goes in a browser or wallet.
  - Anyone can write entities with our attributes, so **always filter by known `$creator` wallets**.
  - Max lifetime is about 182 days.
- **Expiry:** extending a memory must also extend its edges and taint rows, or the lineage breaks. A kept child whose parent expired still has its `roots` in its body, so revoke still works.
- **World:**
  - Discovery only.
  - `client_secret_basic`.
  - HTTPS redirect URI even for the device grant.
  - We bind approval to the intent hash on our server.
- **USDC:** 6 decimals (`parseUnits(x, 6)`). The faucet gives 20 USDC per 2 h per address, so fund early.
- **MCP:**
  - The 2026-07-28 spec is stateless, so key read-sets by the agent token.
  - Chat clients skip tools, so keep descriptions imperative and ship the prompt.
  - The Gemini consumer app is likely unavailable in India; use Antigravity / Gemini CLI.
  - ChatGPT Plus may be read-only.
- **Demo safety:** never depend on a model being fooled live. The scripted `step-*` fallbacks use the same tools and identities.
