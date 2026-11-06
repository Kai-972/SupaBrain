// The in-memory team graph: a cache of what is on Arkiv, rebuilt from it at startup (A-BRAIN S2).
// Status is computed lazily (CLAUDE.md §7 rule 3) and memoised until the next change.
import type { GraphView, MemoryNode, RevocationTarget, Status } from "@supabrain/shared";

export class MemoryGraph implements GraphView {
  private readonly nodes = new Map<string, MemoryNode>();
  private readonly children = new Map<string, Set<string>>();
  private readonly revoked = { source: new Set<string>(), agent: new Set<string>(), memory: new Set<string>() };
  private reasons = new Map<string, string | null>(); // memo: quarantine reason, null = clean
  private seqCounter = 0;

  constructor(private readonly now: () => number = Date.now) {}

  upsert(node: MemoryNode): void {
    const prev = this.nodes.get(node.key);
    if (prev) for (const p of prev.parents) this.children.get(p)?.delete(node.key);
    this.nodes.set(node.key, node);
    for (const p of node.parents) {
      if (!this.children.has(p)) this.children.set(p, new Set());
      this.children.get(p)!.add(node.key);
    }
    this.seqCounter = Math.max(this.seqCounter, node.seq);
    this.reasons.clear();
  }

  /** Update fields of an existing node (pending → confirmed, Keep). */
  patch(key: string, fields: Partial<MemoryNode>): MemoryNode | undefined {
    const n = this.nodes.get(key);
    if (!n) return undefined;
    const next = { ...n, ...fields };
    this.nodes.set(key, next);
    this.reasons.clear();
    return next;
  }

  remove(key: string): void {
    const n = this.nodes.get(key);
    if (!n) return;
    for (const p of n.parents) this.children.get(p)?.delete(key);
    this.nodes.delete(key);
    this.reasons.clear();
  }

  applyRevocation(t: RevocationTarget): void {
    this.revoked[t.type].add(t.id);
    this.reasons.clear();
  }

  isRevoked(t: RevocationTarget): boolean {
    return this.revoked[t.type].has(t.id);
  }

  /** Why a memory is quarantined (first reason found), or undefined if it is not. */
  why(key: string): string | undefined {
    return this.reason(key, new Set()) ?? undefined;
  }

  private reason(key: string, visiting: Set<string>): string | null {
    const memo = this.reasons.get(key);
    if (memo !== undefined) return memo;
    const n = this.nodes.get(key);
    let r: string | null = null;
    if (this.revoked.memory.has(key)) r = `memory ${key} was revoked`;
    else if (n) {
      const root = n.roots.find((x) => this.revoked.source.has(x) || this.revoked.memory.has(x));
      if (root) r = this.revoked.source.has(root) ? `its source ${root} was revoked` : `it is built on revoked memory ${root}`;
      else if (this.revoked.agent.has(n.agent)) r = `its author ${n.agent} was revoked`;
      else if (!visiting.has(key)) {
        visiting.add(key);
        for (const p of n.parents) {
          const pr = this.reason(p, visiting);
          if (pr) { r = `it is built on ${p}, which is quarantined (${pr})`; break; }
        }
        visiting.delete(key);
      }
    }
    this.reasons.set(key, r);
    return r;
  }

  status(key: string): Status {
    const n = this.nodes.get(key);
    if (!n || n.expiresAt <= this.now()) return "expired";
    return this.reason(key, new Set()) ? "quarantined" : "active";
  }

  private withStatus = (n: MemoryNode): MemoryNode => ({ ...n, status: this.status(n.key) });

  get(key: string): MemoryNode | undefined {
    const n = this.nodes.get(key);
    return n ? this.withStatus(n) : undefined;
  }

  has(key: string): boolean {
    return this.nodes.has(key);
  }

  all(): MemoryNode[] {
    return [...this.nodes.values()].sort((a, b) => a.seq - b.seq).map(this.withStatus);
  }

  since(seq: number): MemoryNode[] {
    return this.all().filter((n) => n.seq > seq);
  }

  maxSeq(): number {
    return this.seqCounter;
  }

  nextSeq(): number {
    return ++this.seqCounter;
  }

  memoriesByAddress(addr: `0x${string}`): MemoryNode[] {
    const a = addr.toLowerCase();
    return this.all().filter((n) => n.address?.toLowerCase() === a);
  }

  memoriesBySubject(ensName: string): MemoryNode[] {
    return this.all().filter((n) => n.subject === ensName);
  }

  /** Transitive parents present in the graph, each once (breadth first). */
  ancestors(key: string): MemoryNode[] {
    return this.walk(key, (n) => n.parents);
  }

  /** Transitive children, each once. */
  descendants(key: string): MemoryNode[] {
    return this.walk(key, (n) => [...(this.children.get(n.key) ?? [])]);
  }

  private walk(key: string, next: (n: MemoryNode) => string[]): MemoryNode[] {
    const start = this.nodes.get(key);
    if (!start) return [];
    const out: MemoryNode[] = [];
    const seen = new Set([key]);
    const queue = next(start);
    while (queue.length) {
      const k = queue.shift()!;
      if (seen.has(k)) continue;
      seen.add(k);
      const n = this.nodes.get(k);
      if (!n) continue;
      out.push(this.withStatus(n));
      queue.push(...next(n));
    }
    return out;
  }

  /** Every path from `key` up to a memory with no (known) parents, as key lists. Capped for safety. */
  lineagePaths(key: string, max = 20): string[][] {
    const out: string[][] = [];
    const go = (k: string, path: string[]) => {
      if (out.length >= max) return;
      const n = this.nodes.get(k);
      const parents = (n?.parents ?? []).filter((p) => !path.includes(p));
      const known = parents.filter((p) => this.nodes.has(p));
      if (!n || known.length === 0) { out.push([...path, k]); return; }
      for (const p of known) go(p, [...path, k]);
    };
    go(key, []);
    return out;
  }

  counts() {
    const all = this.all();
    const by = (s: Status) => all.filter((n) => n.status === s).length;
    return { memories: all.length, active: by("active"), quarantined: by("quarantined"), expired: by("expired"), pending: all.filter((n) => n.pending).length };
  }
}
