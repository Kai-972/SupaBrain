// Cross-lane contracts (CLAUDE.md §6.2–6.3). Change only with a Requests note in docs/PROGRESS.md.
import type { AgentView, DryRun, MemoryNode, PayDecision, Payment, ApprovalView, RevocationTarget, Status, StreamEvent } from "./types";
import type { AppConfig } from "./config-schema";

// §6.2 — Lane A implements (packages/ens); the server and Lane B consume it.
// If any ENS read fails, fail closed: authority is unknown, so writes and payments pause.
export interface EnsAuthority {
  getAgentAuthority(label: string): Promise<AgentView & { recordsOk: boolean }>; // live getOwner(labelhash) + text records via UR; short cache
  resolveEns(name: string): Promise<`0x${string}` | null>;                        // viem getEnsAddress (Universal Resolver)
  findVendorEns(address: `0x${string}`): Promise<string | null>;                  // reverse-lookup among configured team vendor names
  teamVendors(): string[];                                                        // full ENS names of team vendors
  agentRegistryRef(label: string): { registry: `0x${string}`; labelhash: `0x${string}` }; // for vault setAgent
  watch?(onEvent: (e: { type: "unregistered" | "expiry" | "roles" | "records"; label: string; txHash: string }) => void): () => void; // SHOULD
}

// §6.3 — Lane A provides these adapters.
export interface GraphView {                      // read-only view of the in-memory graph
  get(key: string): MemoryNode | undefined;               // one node by key (includes quarantined); undefined if unknown or expired
  memoriesByAddress(addr: `0x${string}`): MemoryNode[];   // includes quarantined
  memoriesBySubject(ensName: string): MemoryNode[];
  ancestors(key: string): MemoryNode[];
  status(key: string): Status;
}
export interface ArkivWriter {                    // serialised per signer
  writePayment(p: Payment): Promise<{ key: string; proofUrl: string }>;
}
export interface PaymentsDeps { ens: EnsAuthority; graph: GraphView; arkiv: ArkivWriter; emit: (e: StreamEvent) => void; config: AppConfig }

// §6.3 — Lane B implements (packages/payments); Lane A calls it from the server.
export interface Payments {
  pay(agentLabel: string, input: { payee: string; amount: string; memo: string; cites?: string[] }): Promise<PayDecision>;
  status(intentId: string): Promise<PayDecision>;
  onRevoke(dry: DryRun, target: RevocationTarget): Promise<{ vaultTxUrl?: string; cancelled: string[]; error?: string }>;
  pauseAgent(label: string): Promise<{ txUrl?: string; error?: string }>;
  list(): Payment[];
  approvals(): ApprovalView[];
  cancel(approvalId: string): Promise<void>;
}
export type CreatePayments = (deps: PaymentsDeps) => Payments;
