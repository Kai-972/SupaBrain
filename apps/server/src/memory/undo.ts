// Undo (A-BRAIN S3, CLAUDE.md §7 rules 5–7): dry run, revoke, Keep, Correct this, Add context. Owner-only (the API
// guards every call with the admin session). The revocation is written to Arkiv FIRST; the rest follows from it.
import { keccak256, stringToHex, type Hex } from "viem";
import type { AppConfig, DryRun, MemoryKind, MemoryNode, Payments, PrivateRef, RevocationTarget, Vendor } from "@supabrain/shared";
import { SELF_ROOT, validateFolder, validateRef } from "../engine/lineage";
import type { Runtime } from "../runtime";
import { ToolError } from "./service";
import type { NoticeRecord } from "./store";

export interface HumanMemoryInput { text: string; kind: MemoryKind; folder: string; subject?: string; ref?: PrivateRef; supersedes?: string }

const short = (k: string) => (k.startsWith("0x") && k.length > 14 ? `${k.slice(0, 10)}…` : k);

export function createUndo(d: { config: AppConfig; runtime: Runtime; payments: Payments & { enabled?: boolean }; now?: () => number; log?: (l: string) => void }) {
  const { config, runtime } = d;
  const { graph, readSets, readLog, notices, bus, store } = runtime;
  const now = d.now ?? Date.now;
  const log = d.log ?? (() => undefined);
  const agents = new Set(config.app.agents.map((a) => a.label));

  const describe = (t: RevocationTarget) =>
    t.type === "source" ? `the source ${t.id}` : t.type === "agent" ? `everything written by ${t.id}` : `memory ${short(t.id)}`;

  function validateTarget(t: RevocationTarget): void {
    if (t.type === "source") {
      if (!t.id || new TextEncoder().encode(t.id).length > 128) throw new ToolError("INVALID", "source id is required (≤ 128 bytes)");
    } else if (t.type === "agent") {
      if (!agents.has(t.id)) throw new ToolError("INVALID", `unknown agent "${t.id}"`);
    } else if (t.type === "memory") {
      if (!graph.get(t.id) || graph.status(t.id) === "expired") throw new ToolError("NOT_FOUND", `no live memory ${t.id}`);
    } else {
      throw new ToolError("INVALID", "target.type must be source, agent or memory");
    }
  }

  /** What a revocation of `t` would quarantine (live memories only), who wrote and read them, and the vault root hash. */
  function dryRun(t: RevocationTarget): DryRun {
    validateTarget(t);
    const all = graph.all().filter((n) => n.status !== "expired");
    const direct = all.filter((n) =>
      t.type === "source" ? n.roots.includes(t.id) : t.type === "agent" ? n.agent === t.id : n.key === t.id || n.roots.includes(t.id));
    const hit = new Map<string, MemoryNode>();
    for (const n of direct) {
      hit.set(n.key, n);
      for (const c of graph.descendants(n.key)) if (c.status !== "expired") hit.set(c.key, c);
    }
    const memories = [...hit.values()].sort((a, b) => a.seq - b.seq);
    const keys = memories.map((n) => n.key);
    const pending = d.payments.enabled === false ? [] : d.payments.list().filter((p) => p.decision.status === "pending_human" && p.lineage.some((k) => hit.has(k))).map((p) => p.intentId);
    return {
      target: t,
      memories: keys,
      agents: [...new Set(memories.map((n) => n.agent))],
      vendors: [...new Set(memories.map((n) => n.vendor))] as Vendor[],
      readers: readLog.readers(keys),
      pendingPayments: pending,
      roots: t.type === "agent" ? [] : [keccak256(stringToHex(t.id))],
    };
  }

  async function revoke(t: RevocationTarget, reason: string) {
    validateTarget(t);
    if (graph.isRevoked(t)) throw new ToolError("ALREADY_REVOKED", `${describe(t)} is already revoked`);
    const dry = dryRun(t);

    // 1. Arkiv first: the team wallet writes the revocation (max lifetime). Nothing else happens if this fails.
    let rev;
    try {
      rev = await store.writeRevocation({ target: t, revokedBy: "owner", seq: graph.nextSeq(), reason: reason.slice(0, 500), dryRun: dry, at: now() });
    } catch (e) {
      throw new ToolError("WRITE_FAILED", `the revocation was not written to Arkiv, so nothing was revoked: ${(e as Error).message}`);
    }
    graph.applyRevocation(t);

    // 2. Money: cancel intents built on it, revoke the root / pause the agent in the vault. A failure here is reported,
    //    it does not undo the revocation.
    let pay: { vaultTxUrl?: string; cancelled: string[]; error?: string } = { cancelled: [] };
    if (d.payments.enabled !== false) {
      try { pay = await d.payments.onRevoke(dry, t); } catch (e) { pay = { cancelled: [], error: (e as Error).message }; }
    }

    // 3. Quarantined keys leave every read-set.
    readSets.purge(dry.memories);

    // 4. Notices for everyone who wrote or read an affected memory.
    const recipients = [...new Set([...dry.agents, ...dry.readers])].filter((a) => agents.has(a));
    const text = `RETRACTED by the team owner: ${describe(t)}${reason ? ` (${reason.slice(0, 200)})` : ""}. ${dry.memories.length} memor${dry.memories.length === 1 ? "y is" : "ies are"} quarantined: ${dry.memories.slice(0, 12).map(short).join(", ")}${dry.memories.length > 12 ? ", …" : ""}. Stop using them, tell the user, and re-answer.`;
    const records: NoticeRecord[] = recipients.map((toAgent) => ({ toAgent, revocation: rev.key, text, affected: dry.memories, at: now() }));
    for (const n of records) notices.add(n.toAgent, n);
    if (records.length) {
      void store.writeNotices(records).then(
        (r) => log(`notices for ${recipients.join(", ")} on Arkiv: ${r.proofUrl}`),
        (e: Error) => log(`notices were not written to Arkiv (in-memory copies still delivered): ${e.message}`),
      );
    }

    // 5. Tell the dashboard.
    bus.emit({ t: "revocation", target: t, affected: dry.memories, arkivUrl: rev.proofUrl, ...(pay.vaultTxUrl ? { vaultTxUrl: pay.vaultTxUrl } : {}) });
    for (const a of recipients) bus.emit({ t: "notice", toAgent: a, count: notices.unread(a).length });

    return {
      revocationKey: rev.key, arkivUrl: rev.proofUrl, affected: dry.memories, notified: recipients, dryRun: dry,
      ...(pay.vaultTxUrl ? { vaultTxUrl: pay.vaultTxUrl } : {}), cancelled: pay.cancelled, ...(pay.error ? { paymentsError: pay.error } : {}),
      ...(t.type === "agent" ? { ensNote: `ENS still lists ${t.id} as active; the owner can pause it on ENS with \`pnpm ens:set-records ${t.id}\` (sb.status) or kill it with \`pnpm ens:unregister ${t.id}\`` } : {}),
    };
  }

  async function addContext(i: HumanMemoryInput) {
    const bad = (m: string) => { throw new ToolError("INVALID", m); };
    if (!i.text?.trim() || i.text.length > 4000) bad("text is required (≤ 4000 characters)");
    try { validateFolder(i.folder); } catch (e) { bad((e as Error).message); }
    if (i.ref) { try { validateRef(i.ref, config.app.refs.allowedKinds); } catch (e) { bad((e as Error).message); } }
    const createdAt = now();
    const draft = {
      text: i.text.trim(), kind: i.kind, folder: i.folder, trust: 3 as const, agent: "owner", vendor: "human" as const, seq: graph.nextSeq(), createdAt,
      parents: [], roots: [SELF_ROOT], ...(i.subject ? { subject: i.subject } : {}), ...(i.ref ? { ref: i.ref } : {}), ...(i.supersedes ? { supersedes: i.supersedes } : {}),
    };
    let w;
    try { w = await store.writeMemory("team", draft); } catch (e) { throw new ToolError("WRITE_FAILED", (e as Error).message); }
    const node: MemoryNode = { ...draft, key: w.key, roots: w.roots, expiresAt: createdAt + config.app.arkivExpirySec.memory * 1000, status: "active", pending: true, creator: store.walletOf("team") };
    graph.upsert(node);
    bus.emit({ t: "memory", node: graph.get(node.key)!, edges: [] });
    w.committed.then(
      (r) => { graph.patch(node.key, { pending: false, proofUrl: r.proofUrl, expiresAt: r.expiresAt }); bus.emit({ t: "confirmed", key: node.key, proofUrl: r.proofUrl }); },
      (e: Error) => { graph.remove(node.key); bus.emit({ t: "write_failed", key: node.key, error: e.message }); },
    );
    return { key: w.key as Hex, trust: 3 as const, pending: true as const };
  }

  async function keep(key: string, days?: number) {
    const n = graph.get(key);
    if (!n || n.status === "expired") throw new ToolError("NOT_FOUND", `no live memory ${key}`);
    if (n.status === "quarantined") throw new ToolError("KEEP_REFUSED", `${short(key)} is quarantined (${graph.why(key)}); quarantined memories are never extended, so they fade on their own`);
    if (n.pending) throw new ToolError("KEEP_REFUSED", "this memory is still being written; try again in a few seconds");
    const want = Math.max(1, Math.min(Math.round(days ?? config.app.keep.defaultDays), config.app.keep.maxDays));
    let r;
    try { r = await store.extendMemory(key, want * 86_400); } catch (e) { throw new ToolError("WRITE_FAILED", `Keep was not written: ${(e as Error).message}`); }
    graph.patch(key, { expiresAt: r.expiresAt, kept: true });
    bus.emit({ t: "kept", key, expiresAt: r.expiresAt });
    return { expiresAt: r.expiresAt, days: want, txUrl: r.proofUrl, extended: r.extended };
  }

  async function correct(key: string, text: string) {
    const n = graph.get(key);
    if (!n || n.status === "expired") throw new ToolError("NOT_FOUND", `no live memory ${key}`);
    const r = await revoke({ type: "memory", id: key }, "corrected by the team owner");
    const c = await addContext({ text, kind: n.kind === "evidence" ? "fact" : n.kind, folder: n.folder, ...(n.subject ? { subject: n.subject } : {}), supersedes: key });
    return { revocationKey: r.revocationKey, arkivUrl: r.arkivUrl, newKey: c.key, affected: r.affected };
  }

  return { dryRun, revoke, addContext, keep, correct };
}

export type Undo = ReturnType<typeof createUndo>;
