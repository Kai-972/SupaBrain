// The boundary between the memory service and Arkiv. Real implementation: ../arkiv/store.ts. Test fake: ./fake-store.ts.
import type { Hex } from "viem";
import type { DryRun, MemoryKind, MemoryNode, Payment, PrivateRef, RevocationTarget, SourceRef, Trust, Vendor } from "@supabrain/shared";

/** A memory about to be written. `roots` may contain SELF_ROOT (human memories), replaced by the store with the key. */
export interface MemoryDraft {
  text: string;
  kind: MemoryKind;
  folder: string;
  trust: Trust;
  agent: string;
  vendor: Vendor;
  seq: number;
  createdAt: number;
  parents: string[];
  roots: string[];
  subject?: string;
  address?: Hex;
  source?: SourceRef;
  ref?: PrivateRef;
  supersedes?: string;
}

export interface WriteReceipt { txHash: Hex; proofUrl: string; expiresAt: number }

/** A retraction notice for one agent (stored on Arkiv as sb.notice, owned by the team). */
export interface NoticeRecord { toAgent: string; revocation: string; text: string; affected: string[]; at: number }

export interface RevocationRecord { target: RevocationTarget; revokedBy: string; seq: number; reason: string; dryRun: DryRun; at: number }

export interface StoreWatchHandlers {
  onMemory(node: MemoryNode): void;
  onRevocation(t: RevocationTarget): void;
  onExtended(key: string, expiresAt: number): void;
  onError(e: Error): void;
}

export interface MemoryStore {
  /** The wallet that signs for `signer` (an agent label, or "team"); undefined if the server holds no key for it. */
  walletOf(signer: string): Hex | undefined;
  /**
   * Write one memory (+ edges + taint rows) signed by `signer`'s own wallet and owned by the team wallet.
   * Resolves as soon as the key is known (optimistic); `committed` settles when the receipt lands.
   */
  writeMemory(signer: string, draft: MemoryDraft): Promise<{ key: Hex; roots: string[]; committed: Promise<WriteReceipt> }>;
  /** Team wallet writes a revocation (max lifetime: it must outlive whatever it revokes). Resolves after the receipt. */
  writeRevocation(r: RevocationRecord): Promise<{ key: Hex } & WriteReceipt>;
  /** Team wallet records a payment decision (sb.payment): pending intents live 15 min, decisions 30 days. */
  writePayment(p: Payment): Promise<{ key: string } & WriteReceipt>;
  /** Team wallet writes retraction notices in one batch. */
  writeNotices(notices: NoticeRecord[]): Promise<WriteReceipt>;
  /** Keep: the team (owner) extends a memory AND its edges and taint rows to `seconds` from now, in one batch. */
  extendMemory(key: string, seconds: number): Promise<WriteReceipt & { extended: number }>;
  /** Everything for this app + team from known creators: the startup rebuild. */
  loadAll(): Promise<{ memories: MemoryNode[]; revocations: RevocationTarget[]; notices: NoticeRecord[] }>;
  /** Live tail. Start it BEFORE loadAll (the chain serves no history). Returns a stop function. */
  watch(h: StoreWatchHandlers): () => void;
  /** Explorer link for an entity (proof for memories loaded at startup, whose create tx is unknown). */
  entityUrl(key: string): string;
}
