// Cross-lane contract (CLAUDE.md §6.1). Change only with a Requests note in docs/PROGRESS.md.

export type Vendor = "claude" | "gemini" | "openai" | "human";
export type Trust = 1 | 2 | 3;                                   // evidence | agent | human
export type Role = "owner" | "lead" | "worker" | "observer";
export type MemoryKind = "fact" | "decision" | "plan" | "address" | "evidence" | "payment" | "ref"
  | "task" | "checkpoint" | "file";                              // continuity (pivot 2026-11-06): work items, commits, file versions
export type Status = "active" | "quarantined" | "stale" | "expired" | "proposal" | "restored";

export interface SourceRef { type: "email" | "web" | "file" | "tool" | "chat" | "notion" | "github"; id: string; url?: string; swarmRef?: string }
// Private content stays off chain; Arkiv only holds this pointer + a non-secret label.
export interface PrivateRef { kind: "github" | "notion" | "url"; locator: string; version?: string; label: string }
// A checkpoint is a commit: what the agent did (text), what comes next, and the task keys it ticked.
export interface CheckpointInfo { next?: string; done: string[]; client?: string }   // client = the app that made it, e.g. "claude-code 2.1"
// A file version (kind "file"): the content is the memory text; the parent is the checkpoint that wrote it.
export interface FileInfo { path: string; size: number; sha256: string; deleted?: boolean }
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
  checkpoint?: CheckpointInfo;                                  // kind=checkpoint
  file?: FileInfo;                                              // kind=file (text = content; the dashboard API strips it)
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
  registered: boolean; leaseExpiresAt: number; status: "active" | "paused" | "quarantined" | "unregistered" | "expired";
  payCap: string; payDaily: string; writeDaily?: string; lastWriteAt?: number; connectedClient?: string }

export type PayReason =
  | { code: "QUARANTINED_LINEAGE"; revoked: string[] }
  | { code: "ENS_MISMATCH"; ensName: string; ensAddress: string; claimedAddress: string }
  | { code: "OUTSIDE_CONTENT_PAYEE"; sources: string[] }
  | { code: "UNKNOWN_PAYEE" } | { code: "NEW_PAYEE" }
  | { code: "OVER_CAP"; cap: string; amount: string } | { code: "OVER_DAILY"; daily: string; spentToday: string }
  | { code: "AGENT_NOT_AUTHORIZED"; detail: string }
  | { code: "PROTECTED_PAYEE"; label: string };                       // a team-controlled wallet/contract (agent wallet, BrainVault, USDC token, zero address): never a payee

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
  | { t: "agent"; agent: AgentView }
  | { t: "write_failed"; key: string; error: string }           // an optimistic (pending) memory did not land on Arkiv: drop it
  | { t: "blocked"; block: BlockedEntry }                          // v2: an AI was refused by an ENS rule, or its content was stopped
  | { t: "head"; head: HeadView };                                 // v2: an AI's latest checkpoint was published to its ENS name (sb.memory.head)

/** v2: one refusal or stop, for the website's live "blocked" feed and the owner's review notices. */
export interface BlockedEntry {
  at: number; agent: string; ens?: string; tool: "continue" | "checkpoint" | "checkout" | "pay";
  code: string;                 // NOT_AUTHORIZED | SCOPE | RATE_LIMIT | STOPPED | KEY_MISMATCH | AUTHORITY_UNKNOWN | ...
  rule?: string;                // the ENS record or guard rule that decided it: sb.status, sb.scope, sb.write.daily, instruction-override, ...
  message: string;
  key?: string;                 // STOPPED: the saved (quarantined) checkpoint key, for review
  excerpt?: string;             // STOPPED: the matched text
  arkivUrl?: string;            // STOPPED: the team-signed revocation on Arkiv
}

/** v2: git-style ref. The newest checkpoint of an AI, as written to ENS (sb.memory.head) and as the server knows it. */
export interface HeadView { agent: string; ens: string; key: string; txUrl?: string; at: number; error?: string }

// Continuity views (dashboard API). A task is "done" while a live checkpoint ticks it: revoke that checkpoint and the
// task reopens. A file's current version is its newest version whose checkpoint is live (revoke rolls it back).
export interface TaskView { key: string; title: string; status: "open" | "done" | "quarantined"; createdBy: string; vendor: Vendor;
  trust: Trust; createdAt: number; doneBy?: string; doneAt?: number; doneIn?: string; why?: string }
export interface FileView { path: string; size: number; sha256: string; agent: string; vendor: Vendor; checkpoint: string;
  key: string; at: number; versions: number; proofUrl?: string }
export interface CheckpointView { key: string; agent: string; vendor: Vendor; summary: string; next?: string; done: string[];
  files: string[]; parents: string[]; trust: Trust; status: Status; createdAt: number; client?: string; pending?: boolean; proofUrl?: string; why?: string }

// Dashboard API client ids (CLAUDE.md §6.4).
export type Client = "claude-code" | "claude-ai" | "antigravity" | "gemini-cli" | "chatgpt";
