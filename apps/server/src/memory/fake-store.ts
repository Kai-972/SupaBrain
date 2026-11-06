// In-memory MemoryStore for tests only (CLAUDE.md §2.1: mocks only in unit tests).
import { keccak256, toHex, type Hex } from "viem";
import type { MemoryNode, RevocationTarget } from "@supabrain/shared";
import { SELF_ROOT } from "../engine/lineage";
import type { MemoryDraft, MemoryStore, StoreWatchHandlers, WriteReceipt } from "./store";

export class FakeMemoryStore implements MemoryStore {
  readonly written: { signer: string; key: Hex; draft: MemoryDraft }[] = [];
  /** set to make the next commit fail (after the key was handed out) */
  failNextCommit?: string;
  /** set to make the next write fail before a key exists */
  failNextWrite?: string;
  /** hold commits until release() (to observe the pending state) */
  holdCommits = false;
  private held: (() => void)[] = [];
  private n = 0;

  constructor(private readonly wallets: Record<string, Hex>, private readonly preload: MemoryNode[] = [], private readonly lifetimeMs = 172_800_000) {}

  walletOf(signer: string) {
    return this.wallets[signer];
  }

  async writeMemory(signer: string, draft: MemoryDraft) {
    if (this.failNextWrite) { const m = this.failNextWrite; this.failNextWrite = undefined; throw new Error(m); }
    const key = keccak256(toHex(`fake-${++this.n}`));
    const roots = draft.roots.map((r) => (r === SELF_ROOT ? key : r));
    this.written.push({ signer, key, draft: { ...draft, roots } });
    const fail = this.failNextCommit;
    this.failNextCommit = undefined;
    const committed = new Promise<WriteReceipt>((resolve, reject) => {
      const done = () => (fail ? reject(new Error(fail)) : resolve({ txHash: keccak256(toHex(`tx-${key}`)), proofUrl: `https://explorer.test/tx/${key}`, expiresAt: draft.createdAt + this.lifetimeMs })); // hardcode-ok: test fake proof link
      if (this.holdCommits) this.held.push(done); else queueMicrotask(done);
    });
    committed.catch(() => undefined);
    return { key, roots, committed };
  }

  release() {
    for (const f of this.held.splice(0)) f();
  }

  async loadAll(): Promise<{ memories: MemoryNode[]; revocations: RevocationTarget[] }> {
    return { memories: this.preload, revocations: [] };
  }

  watch(_h: StoreWatchHandlers) {
    return () => undefined;
  }

  entityUrl(key: string) {
    return `https://explorer.test/entity/${key}`; // hardcode-ok: test fake proof link
  }
}
