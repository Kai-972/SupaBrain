// Cross-lane contract (CLAUDE.md §6.1). Change only with a Requests note in docs/PROGRESS.md.

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
  | { t: "agent"; agent: AgentView }
  | { t: "write_failed"; key: string; error: string };          // an optimistic (pending) memory did not land on Arkiv: drop it

// Dashboard API client ids (CLAUDE.md §6.4).
export type Client = "claude-code" | "claude-ai" | "antigravity" | "gemini-cli" | "chatgpt";
