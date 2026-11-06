// In-memory fakes for UNIT TESTS ONLY (CLAUDE.md §2.1). Never mount these in the server or the demo.
import type { AgentView, MemoryNode, Payment, Status } from "../types";
import type { ArkivWriter, EnsAuthority, GraphView } from "../interfaces";

type Hex = `0x${string}`;

export interface FakeEnsOptions {
  agents?: Record<string, AgentView & { recordsOk?: boolean }>;
  names?: Record<string, Hex | null>;                         // ENS name -> resolved address
  vendors?: string[];                                         // full ENS names of team vendors
  registryRefs?: Record<string, { registry: Hex; labelhash: Hex }>;
}

/** Fake ENS. Set `failing = true` to simulate an ENS outage: every read throws (callers must fail closed). */
export class FakeEns implements EnsAuthority {
  failing = false;
  readonly agents: Record<string, AgentView & { recordsOk?: boolean }>;
  readonly names: Record<string, Hex | null>;
  readonly vendors: string[];
  readonly registryRefs: Record<string, { registry: Hex; labelhash: Hex }>;

  constructor(o: FakeEnsOptions = {}) {
    this.agents = { ...o.agents };
    this.names = { ...o.names };
    this.vendors = [...(o.vendors ?? [])];
    this.registryRefs = { ...o.registryRefs };
  }

  private guard(): void {
    if (this.failing) throw new Error("FakeEns: ENS read failed");
  }

  async getAgentAuthority(label: string) {
    this.guard();
    const a = this.agents[label];
    if (!a) throw new Error(`FakeEns: unknown agent ${label}`);
    return { ...a, recordsOk: a.recordsOk ?? true };
  }

  async resolveEns(name: string) {
    this.guard();
    return this.names[name] ?? null;
  }

  async findVendorEns(address: Hex) {
    this.guard();
    const hit = this.vendors.find((v) => this.names[v]?.toLowerCase() === address.toLowerCase());
    return hit ?? null;
  }

  teamVendors() {
    return [...this.vendors];
  }

  agentRegistryRef(label: string) {
    const r = this.registryRefs[label];
    if (!r) throw new Error(`FakeEns: no registry ref for ${label}`);
    return r;
  }

  /** Test helper: simulate the owner unregistering an agent. */
  unregister(label: string): void {
    const a = this.agents[label];
    if (a) this.agents[label] = { ...a, registered: false, status: "unregistered" };
  }
}

/** Fake graph over a fixed node list. Status is whatever the node says; tests set it explicitly. */
export class FakeGraph implements GraphView {
  private readonly byKey = new Map<string, MemoryNode>();

  constructor(nodes: MemoryNode[] = []) {
    for (const n of nodes) this.byKey.set(n.key, n);
  }

  add(node: MemoryNode): void {
    this.byKey.set(node.key, node);
  }

  setStatus(key: string, status: Status): void {
    const n = this.byKey.get(key);
    if (n) this.byKey.set(key, { ...n, status });
  }

  get(key: string) {
    return this.byKey.get(key);
  }

  memoriesByAddress(addr: Hex) {
    const a = addr.toLowerCase();
    return [...this.byKey.values()].filter((n) => n.address?.toLowerCase() === a);
  }

  memoriesBySubject(ensName: string) {
    return [...this.byKey.values()].filter((n) => n.subject === ensName);
  }

  /** All ancestors (transitive parents), excluding the node itself, each once. */
  ancestors(key: string) {
    const out: MemoryNode[] = [];
    const seen = new Set<string>([key]);
    const queue = [...(this.byKey.get(key)?.parents ?? [])];
    while (queue.length) {
      const k = queue.shift()!;
      if (seen.has(k)) continue;
      seen.add(k);
      const n = this.byKey.get(k);
      if (!n) continue;
      out.push(n);
      queue.push(...n.parents);
    }
    return out;
  }

  status(key: string): Status {
    return this.byKey.get(key)?.status ?? "expired";
  }
}

/** Fake Arkiv writer: records payments in order and returns deterministic keys. */
export class FakeArkivWriter implements ArkivWriter {
  readonly payments: Payment[] = [];

  async writePayment(p: Payment) {
    this.payments.push(p);
    const n = this.payments.length;
    return { key: `0x${n.toString(16).padStart(64, "0")}`, proofUrl: `fake-arkiv://payment/${n}` };
  }
}
