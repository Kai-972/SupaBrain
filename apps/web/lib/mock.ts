"use client";
// ?mock=1 only (CLAUDE.md §2.1): replays fixtures/demo.json through the same applyEvent the real SSE uses.
// The page shows a MOCK DATA banner whenever this runs.
import type { DryRun, Payment, RevocationTarget, Vendor } from "@supabrain/shared";
import fixture from "../fixtures/demo.json";
import type { GraphNode, TeamResponse } from "./api";
import { applyEvent, descendants, getState, setState } from "./store";

const nodes = fixture.nodes as unknown as (GraphNode & { mockStatus?: string })[];
const payments = fixture.payments as unknown as Payment[];

export function startMock() {
  setState({ mode: "mock", conn: "mock", loaded: true, team: fixture.team as unknown as TeamResponse, admin: true, health: { ok: true, app: "mock", team: "mock", payments: "enabled" } });
  const base = Date.now() - nodes.length * 900;
  const order = [...nodes].sort((a, b) => a.seq - b.seq);
  const blocked = payments.filter((p) => p.decision.status === "blocked").slice(-1);
  let t = 300;
  for (const [i, n] of order.entries()) {
    const at = t;
    setTimeout(() => {
      const { mockStatus: _m, ...rest } = n; const node = rest as GraphNode;
      applyEvent({ t: "memory", node: { ...node, key: node.key as `0x${string}`, createdAt: base + i * 900, pending: false }, edges: [] }, { animate: true });
    }, at);
    t += 700;
    if (n.kind === "address" && blocked.length && i > 2) {
      const p = blocked.shift()!;
      setTimeout(() => applyEvent({ t: "payment", payment: { ...p, createdAt: Date.now() } }, { animate: true }), t);
      t += 700;
    }
  }
}

function affectedBy(target: RevocationTarget): string[] {
  const all = getState().nodes;
  const seeds = Object.values(all).filter((n) =>
    target.type === "source" ? n.roots.includes(target.id) && n.parents.every((p) => !all[p]?.roots.includes(target.id))
      : target.type === "agent" ? n.agent === target.id : n.key === target.id).map((n) => n.key);
  const out = new Set<string>(seeds);
  seeds.forEach((s) => descendants(all, s as string).forEach((d) => out.add(d)));
  return [...out];
}

export function mockDryRun(target: RevocationTarget): DryRun {
  const all = getState().nodes;
  const memories = affectedBy(target).filter((k) => all[k]?.status !== "quarantined");
  const ms = memories.map((k) => all[k]);
  return {
    target, memories, roots: [],
    agents: [...new Set(ms.map((m) => m.agent))],
    vendors: [...new Set(ms.map((m) => m.vendor))] as Vendor[],
    readers: [...new Set(ms.map((m) => m.agent))],
    pendingPayments: getState().approvals.map((a) => a.intentId),

  };
}

export async function mockRevoke(target: RevocationTarget) {
  const affected = mockDryRun(target).memories;
  await new Promise((r) => setTimeout(r, 1400));
  applyEvent({ t: "revocation", target, affected }, { animate: true });
  setState((s) => {
    const n = { ...s.nodes };
    for (const k of affected) n[k] = { ...n[k], status: "quarantined" };
    return { nodes: n };
  });
  return { revocationKey: "mock", affected, notified: [...new Set(affected.map((k) => getState().nodes[k]?.agent))] };
}
