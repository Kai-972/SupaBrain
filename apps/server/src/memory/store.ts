// The boundary between the memory service and Arkiv. Real implementation: ../arkiv/store.ts. Test fake: ./fake-store.ts.
import type { Hex } from "viem";
import type { MemoryKind, MemoryNode, PrivateRef, RevocationTarget, SourceRef, Trust, Vendor } from "@supabrain/shared";

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
  /** Everything for this app + team from known creators: the startup rebuild. */
  loadAll(): Promise<{ memories: MemoryNode[]; revocations: RevocationTarget[] }>;
  /** Live tail. Start it BEFORE loadAll (the chain serves no history). Returns a stop function. */
  watch(h: StoreWatchHandlers): () => void;
  /** Explorer link for an entity (proof for memories loaded at startup, whose create tx is unknown). */
  entityUrl(key: string): string;
}
