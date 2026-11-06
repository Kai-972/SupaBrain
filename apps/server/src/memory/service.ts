// The memory service behind the MCP tools and the dashboard API (A-BRAIN S2). Every agent action re-checks ENS live
// (CLAUDE.md §7 rule 8), then works on the in-memory graph and writes to Arkiv through the MemoryStore.
import { isAddress, type Hex } from "viem";
import type { AgentView, AppConfig, EnsAuthority, MemoryKind, MemoryNode, PrivateRef, SourceRef, Trust } from "@supabrain/shared";
import type { MemoryGraph } from "../engine/graph";
import { computeLineage, scopeAllows, validateFolder, validateRef, validateSource } from "../engine/lineage";
import { searchMemories } from "../engine/search";
import type { Notice, NoticeBox, ReadLog, ReadSets } from "../engine/session";
import type { EventBus } from "../events";
import type { MemoryDraft, MemoryStore } from "./store";

export type ToolErrorCode =
  | "AUTHORITY_UNKNOWN" | "NOT_AUTHORIZED" | "KEY_MISMATCH" | "SCOPE" | "INVALID" | "CITE_NOT_READ" | "CITE_QUARANTINED"
  | "TOO_MANY_PARENTS" | "WRITE_FAILED" | "NOT_FOUND" | "ALREADY_REVOKED" | "KEEP_REFUSED";

/** An error the agent should see and act on (returned as an MCP tool error, never a crash). */
export class ToolError extends Error {
  constructor(readonly code: ToolErrorCode, message: string) {
    super(message);
    this.name = "ToolError";
  }
}

const KINDS: readonly MemoryKind[] = ["fact", "decision", "plan", "address", "evidence", "payment", "ref"];
const MAX_TEXT = 4000;

export interface RememberInput {
  text: string;
  kind: MemoryKind;
  folder: string;
  cites?: string[];
  subject?: string;
  address?: Hex;
  source?: SourceRef;
  ref?: PrivateRef;
}

export type RecallItem = Pick<MemoryNode, "key" | "text" | "kind" | "trust" | "agent" | "vendor" | "folder" | "status" | "createdAt"> &
  Partial<Pick<MemoryNode, "subject" | "address" | "ref" | "source" | "pending">> & { why?: string };

export interface ExplainHop { key: string; text: string; kind: string; trust: Trust; agent: string; vendor: string; status: string; why?: string }

export interface RecallLogEntry { at: number; agent: string; query: string; results: { key: string; status: string }[] }

export interface ServiceDeps {
  config: AppConfig;
  ens: EnsAuthority;
  store: MemoryStore;
  graph: MemoryGraph;
  readSets: ReadSets;
  readLog: ReadLog;
  notices: NoticeBox;
  bus: EventBus;
  now?: () => number;
  log?: (line: string) => void;
}

export type MemoryService = ReturnType<typeof createMemoryService>;

export function createMemoryService(d: ServiceDeps) {
  const now = d.now ?? Date.now;
  const log = d.log ?? (() => undefined);
  const connectedTokens = new Set<string>();
  const recallLog: RecallLogEntry[] = [];
  const lastWriteAt = new Map<string, number>();

  async function authority(agent: string): Promise<AgentView & { recordsOk: boolean }> {
    try {
      return await d.ens.getAgentAuthority(agent);
    } catch {
      throw new ToolError("AUTHORITY_UNKNOWN", `ENS authority for ${agent} is unknown right now (ENS could not be read), so reads, writes and payments are paused. Try again shortly.`);
    }
  }

  /** Registered (ENS owner = the agent's wallet), status active, records complete, and the server holds the right key. */
  async function requireActive(agent: string): Promise<AgentView & { recordsOk: boolean }> {
    const a = await authority(agent);
    if (!a.registered || a.status !== "active" || !a.recordsOk) {
      throw new ToolError("NOT_AUTHORIZED", `${a.ens} is not allowed to act: ENS status is "${a.status}"${a.registered ? "" : " (name not registered to the agent wallet)"}${a.recordsOk ? "" : " (records incomplete)"}. Stop and tell the user.`);
    }
    if (d.graph.isRevoked({ type: "agent", id: agent })) {
      throw new ToolError("NOT_AUTHORIZED", `${a.ens} was revoked by the team owner; everything it wrote is quarantined. Stop and tell the user.`);
    }
    const wallet = d.store.walletOf(agent);
    if (!wallet || wallet.toLowerCase() !== a.wallet.toLowerCase()) {
      throw new ToolError("KEY_MISMATCH", `the server's signing key for ${agent} does not match its ENS wallet ${a.wallet}; refusing to write as it`);
    }
    return a;
  }

  const toItem = (n: MemoryNode): RecallItem => {
    const why = n.status === "quarantined" ? d.graph.why(n.key) : undefined;
    return {
      key: n.key, text: n.text, kind: n.kind, trust: n.trust, agent: n.agent, vendor: n.vendor, folder: n.folder, status: n.status, createdAt: n.createdAt,
      ...(n.subject ? { subject: n.subject } : {}), ...(n.address ? { address: n.address } : {}), ...(n.ref ? { ref: n.ref } : {}),
      ...(n.source ? { source: n.source } : {}), ...(n.pending ? { pending: true } : {}), ...(why ? { why } : {}),
    };
  };

  function validate(i: RememberInput): void {
    const bad = (m: string) => { throw new ToolError("INVALID", m); };
    if (typeof i.text !== "string" || i.text.trim().length === 0) bad("text is required");
    if (i.text.length > MAX_TEXT) bad(`text is ${i.text.length} characters; keep a memory under ${MAX_TEXT} (store long documents as a ref pointer)`);
    if (!KINDS.includes(i.kind)) bad(`kind must be one of ${KINDS.join(", ")}`);
    try { validateFolder(i.folder); } catch (e) { bad((e as Error).message); }
    if (i.kind === "evidence" && !i.source) bad('kind "evidence" needs source {type, id}: where did it come from?');
    if (i.source) { try { validateSource(i.source); } catch (e) { bad((e as Error).message); } }
    if (i.kind === "address" && !i.address) bad('kind "address" needs the address field');
    if (i.address && !isAddress(i.address, { strict: false })) bad("address must be a 0x-prefixed 20-byte address");
    if (i.kind === "ref" && !i.ref) bad('kind "ref" needs ref {kind, locator, version?, label}');
    if (i.ref) { try { validateRef(i.ref, d.config.app.refs.allowedKinds); } catch (e) { bad((e as Error).message); } }
    if (i.subject && (i.subject.length > 128 || !/^[a-z0-9.-]+$/.test(i.subject))) bad("subject must be an ENS name like acme.supabrain.eth");
  }

  return {
    notices: d.notices,

    async whoami(agent: string, ctx: { tokenId?: string; client?: string } = {}) {
      const a = await authority(agent);
      const canWrite = a.registered && a.status === "active" && a.recordsOk;
      if (ctx.tokenId && !connectedTokens.has(ctx.tokenId)) {
        connectedTokens.add(ctx.tokenId);
        d.bus.emit({ t: "connected", agent, ...(ctx.client ? { client: ctx.client } : {}) });
      }
      return { view: a, canWrite, notices: d.notices.unread(agent) };
    },

    async recall(agent: string, q: { query: string; folder?: string; limit?: number }) {
      await requireActive(agent);
      const found = searchMemories(d.graph.all(), q.query ?? "", { folder: q.folder, limit: q.limit });
      const items = found.map(toItem);
      d.readSets.add(agent, found.filter((n) => n.status === "active").map((n) => n.key));
      d.readLog.record(agent, found.map((n) => n.key));
      recallLog.push({ at: now(), agent, query: q.query ?? "", results: items.map((m) => ({ key: m.key, status: m.status })) });
      if (recallLog.length > 200) recallLog.shift();
      return { memories: items, notices: d.notices.unread(agent) };
    },

    async remember(agent: string, input: RememberInput) {
      const a = await requireActive(agent);
      if (a.role === "observer") throw new ToolError("NOT_AUTHORIZED", `${a.ens} is an observer and cannot write memories`);
      validate(input);
      if (!scopeAllows(a.scope, input.folder)) {
        throw new ToolError("SCOPE", `${a.ens} may only write to the "${a.scope}" folder (its ENS sb.scope record), not "${input.folder}"`);
      }
      const p = d.readSets.parentsFor(agent, input.cites);
      if (!p.ok) throw new ToolError("CITE_NOT_READ", `cite only keys you recalled in this session; not recalled: ${p.missing.join(", ")}. Call recall first.`);
      if (p.parents.length > d.config.app.readSet.maxParents) {
        throw new ToolError("TOO_MANY_PARENTS", `you have read ${p.parents.length} memories since your last write; pass cites with the ones this memory relies on (at most ${d.config.app.readSet.maxParents})`);
      }
      const parents = p.parents.map((k) => d.graph.get(k)).filter((n): n is MemoryNode => !!n);
      const bad = parents.find((n) => n.status !== "active");
      if (bad) throw new ToolError("CITE_QUARANTINED", `memory ${bad.key} is ${bad.status}; do not build on it`);

      let lineage;
      try { lineage = computeLineage({ kind: input.kind, author: "agent", parents, source: input.source, ref: input.ref }); }
      catch (e) { throw new ToolError("INVALID", (e as Error).message); }

      const createdAt = now();
      const draft: MemoryDraft = {
        text: input.text.trim(), kind: input.kind, folder: input.folder, trust: lineage.trust, agent, vendor: a.vendor,
        seq: d.graph.nextSeq(), createdAt, parents: parents.map((n) => n.key), roots: lineage.roots,
        ...(input.subject ? { subject: input.subject } : {}), ...(input.address ? { address: input.address } : {}),
        ...(input.source ? { source: input.source } : {}), ...(input.ref ? { ref: input.ref } : {}),
      };
      let written;
      try { written = await d.store.writeMemory(agent, draft); }
      catch (e) { throw new ToolError("WRITE_FAILED", `the memory was not written: ${(e as Error).message}`); }

      const lifetime = (input.kind === "evidence" ? d.config.app.arkivExpirySec.evidence : d.config.app.arkivExpirySec.memory) * 1000;
      const node: MemoryNode = { ...draft, key: written.key, roots: written.roots, expiresAt: createdAt + lifetime, status: "active", pending: true, creator: a.wallet };
      d.graph.upsert(node);
      d.readSets.reset(agent);
      lastWriteAt.set(agent, createdAt);
      d.bus.emit({ t: "memory", node: d.graph.get(node.key)!, edges: node.parents.map((parent) => ({ parent, child: node.key })) });

      written.committed.then(
        (r) => {
          d.graph.patch(node.key, { pending: false, proofUrl: r.proofUrl, expiresAt: r.expiresAt });
          d.bus.emit({ t: "confirmed", key: node.key, proofUrl: r.proofUrl });
        },
        (e: Error) => {
          d.graph.remove(node.key);
          d.bus.emit({ t: "write_failed", key: node.key, error: e.message });
          log(`write failed for ${agent} ${node.key}: ${e.message}`);
        },
      );
      return { key: node.key, trust: node.trust, parents: node.parents, roots: node.roots, folder: node.folder, pending: true as const, notices: d.notices.unread(agent) };
    },

    async explain(agent: string, key: string) {
      await requireActive(agent);
      const n = d.graph.get(key);
      if (!n) throw new ToolError("NOT_FOUND", `no live memory ${key} (it may have expired)`);
      const hop = (k: string): ExplainHop => {
        const m = d.graph.get(k)!;
        const why = m.status === "quarantined" ? d.graph.why(k) : undefined;
        return { key: m.key, text: m.text.length > 160 ? `${m.text.slice(0, 157)}...` : m.text, kind: m.kind, trust: m.trust, agent: m.agent, vendor: m.vendor, status: m.status, ...(why ? { why } : {}) };
      };
      return { key: n.key, status: n.status, trust: n.trust, roots: n.roots, paths: d.graph.lineagePaths(key).map((path) => path.filter((k) => d.graph.has(k)).map(hop)), notices: d.notices.unread(agent) };
    },

    async checkNotices(agent: string): Promise<Notice[]> {
      return d.notices.markRead(agent);
    },

    readers: (keys: string[]) => d.readLog.readers(keys),
    recallLog: (agent?: string) => recallLog.filter((r) => !agent || r.agent === agent),
    lastWriteAt: (agent: string) => lastWriteAt.get(agent),
  };
}
