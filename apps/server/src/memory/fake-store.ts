// In-memory MemoryStore for tests only (CLAUDE.md §2.1: mocks only in unit tests).
import { keccak256, toHex, type Hex } from "viem";
import type { MemoryNode, Payment, RevocationTarget } from "@supabrain/shared";
import { SELF_ROOT } from "../engine/lineage";
import type { MemoryDraft, MemoryStore, NoticeRecord, RevocationRecord, StoreWatchHandlers, WriteReceipt } from "./store";

export class FakeMemoryStore implements MemoryStore {
  readonly written: { signer: string; key: Hex; draft: MemoryDraft }[] = [];
  readonly revocations: RevocationRecord[] = [];
  readonly noticesWritten: NoticeRecord[] = [];
  readonly extended: { key: string; seconds: number }[] = [];
  readonly payments: Payment[] = [];
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

  async writeRevocation(r: RevocationRecord) {
    this.revocations.push(r);
    const key = keccak256(toHex(`rev-${this.revocations.length}`));
    return { key, txHash: keccak256(toHex(`tx-${key}`)), proofUrl: `https://explorer.test/tx/${key}`, expiresAt: r.at + 182 * 86_400_000 }; // hardcode-ok: test fake proof link
  }

  async writePayment(p: Payment) {
    this.payments.push(p);
    const key = keccak256(toHex(`pay-${this.payments.length}`));
    return { key, txHash: keccak256(toHex(`tx-${key}`)), proofUrl: `https://explorer.test/tx/${key}`, expiresAt: Date.now() + 30 * 86_400_000 }; // hardcode-ok: test fake proof link
  }

  async writeNotices(notices: NoticeRecord[]) {
    this.noticesWritten.push(...notices);
    return { txHash: keccak256(toHex(`notices-${this.noticesWritten.length}`)), proofUrl: "https://explorer.test/tx/notices", expiresAt: Date.now() + this.lifetimeMs }; // hardcode-ok: test fake proof link
  }

  async extendMemory(key: string, seconds: number) {
    this.extended.push({ key, seconds });
    return { txHash: keccak256(toHex(`keep-${key}`)), proofUrl: `https://explorer.test/tx/keep-${key}`, expiresAt: Date.now() + seconds * 1000, extended: 1 }; // hardcode-ok: test fake proof link
  }

  async loadAll(): Promise<{ memories: MemoryNode[]; revocations: RevocationTarget[]; notices: NoticeRecord[] }> {
    return { memories: this.preload, revocations: [], notices: [] };
  }

  watch(_h: StoreWatchHandlers) {
    return () => undefined;
  }

  entityUrl(key: string) {
    return `https://explorer.test/entity/${key}`; // hardcode-ok: test fake proof link
  }
}
