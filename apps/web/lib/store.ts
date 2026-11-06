"use client";
// One store for the whole dashboard (C-UI.md §4). Real mode: REST snapshot + SSE patches through applyEvent.
// Mock mode (?mock=1 only): the same applyEvent replays fixtures/demo.json, behind a visible MOCK DATA banner.
import { useSyncExternalStore } from "react";
import type { ApprovalView, Payment, StreamEvent, Vendor, RevocationTarget, DryRun } from "@supabrain/shared";
import { api, ApiError, SERVER_URL, type GraphNode, type Health, type TeamResponse, type LiveAgent } from "./api";
import { DECISION_WORD, shortKey } from "./format";

export type Tone = "ok" | "bad" | "warn" | "info";
export interface FeedItem { id: string; at: number; tone: Tone; agent?: string; vendor?: Vendor; text: string; key?: string; href?: string }
export interface Cascade { id: number; affected: string[]; depth: Record<string, number>; at: number }
export type Conn = "connecting" | "open" | "reconnecting" | "noserver" | "mock";

export interface State {
  mode: "live" | "mock";
  conn: Conn;
  loaded: boolean;
  error?: string;
  health?: Health;
  team?: TeamResponse;
  nodes: Record<string, GraphNode>;
  payments: Payment[];
  approvals: ApprovalView[];
  feed: FeedItem[];
  notices: Record<string, number>;
  connected: Record<string, string>;
  admin: boolean;
  cascade?: Cascade;
  toast?: { id: number; tone: Tone; text: string };
  lastEvent: number;
}

let state: State = { mode: "live", conn: "connecting", loaded: false, nodes: {}, payments: [], approvals: [], feed: [], notices: {}, connected: {}, admin: false, lastEvent: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const getState = () => state;
export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  emit();
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(state));
}

let toastId = 0;
export const toast = (text: string, tone: Tone = "info") => setState({ toast: { id: ++toastId, tone, text } });

// ---------- derived helpers ----------
export function childrenOf(nodes: Record<string, GraphNode>) {
  const kids: Record<string, string[]> = {};
  for (const n of Object.values(nodes)) for (const p of n.parents) (kids[p] ??= []).push(n.key);
  return kids;
}
export function ancestors(nodes: Record<string, GraphNode>, key: string) {
  const out = new Set<string>(); const st = [key];
  while (st.length) { const k = st.pop()!; for (const p of nodes[k]?.parents ?? []) if (!out.has(p)) { out.add(p); st.push(p); } }
  return out;
}
export function descendants(nodes: Record<string, GraphNode>, key: string) {
  const kids = childrenOf(nodes); const out = new Set<string>(); const st = [key];
  while (st.length) { const k = st.pop()!; for (const c of kids[k] ?? []) if (!out.has(c)) { out.add(c); st.push(c); } }
  return out;
}
/** BFS depth from the revoked roots, for the ~120 ms-per-hop cascade. */
function cascadeDepth(nodes: Record<string, GraphNode>, affected: string[]) {
  const set = new Set(affected); const depth: Record<string, number> = {};
  const memo = (k: string, seen = new Set<string>()): number => {
    if (k in depth) return depth[k];
    if (seen.has(k)) return 0; seen.add(k);
    const ps = (nodes[k]?.parents ?? []).filter((p) => set.has(p));
    return (depth[k] = ps.length ? 1 + Math.max(...ps.map((p) => memo(p, seen))) : 0);
  };
  affected.forEach((k) => memo(k));
  return depth;
}
export function agentByLabel(label: string): LiveAgent | undefined {
  return state.team?.agents.find((a) => a.label === label);
}
export const vendorOfAgent = (label: string): Vendor => (label === "owner" ? "human" : agentByLabel(label)?.vendor ?? "human");

// ---------- feed ----------
function pushFeed(items: FeedItem[]) {
  if (!items.length) return;
  setState((s) => {
    const seen = new Set(s.feed.map((f) => f.id));
    const add = items.filter((i) => !seen.has(i.id));
    if (!add.length) return {};
    return { feed: [...add, ...s.feed].sort((a, b) => b.at - a.at).slice(0, 200) };
  });
}
const memoryFeed = (n: GraphNode): FeedItem => ({
  id: `m:${n.key}`, at: n.createdAt, agent: n.agent, vendor: n.vendor, key: n.key,
  tone: n.status === "quarantined" ? "bad" : n.dispute?.state === "disputed" ? "warn" : n.trust === 3 ? "ok" : "info",
  text: `${n.agent === "owner" ? "A person" : n.agent} saved “${n.text.length > 80 ? n.text.slice(0, 80) + "…" : n.text}”${n.source ? ` from ${n.source.type}` : ""}`,
});
const paymentFeed = (p: Payment): FeedItem => ({
  id: `p:${p.intentId}:${p.decision.status}`, at: p.createdAt, agent: p.agent, vendor: vendorOfAgent(p.agent),
  tone: p.decision.status === "paid" ? "ok" : p.decision.status === "blocked" ? "bad" : p.decision.status === "pending_human" ? "warn" : "info",
  text: `Payment ${DECISION_WORD[p.decision.status]}: ${p.amount} USDC to ${p.payeeEns ?? shortKey(p.payee)}`,
  href: p.decision.status === "paid" ? p.decision.txUrl : undefined,
});

// ---------- snapshot ----------
let refetchTimer: ReturnType<typeof setTimeout> | undefined;
export async function refreshGraph() {
  if (state.mode === "mock") return;
  const g = await api.graph(0);
  const nodes: Record<string, GraphNode> = {};
  for (const n of g.nodes) nodes[n.key] = { ...n, pending: state.nodes[n.key]?.pending && !n.proofUrl ? true : n.pending };
  setState({ nodes });
  pushFeed(g.nodes.map(memoryFeed));
}
const soonRefresh = () => { clearTimeout(refetchTimer); refetchTimer = setTimeout(() => { refreshGraph().catch(() => {}); refreshTeam().catch(() => {}); }, 700); };
export async function refreshTeam() { if (state.mode === "live") setState({ team: await api.team() }); }
export async function refreshPayments() {
  if (state.mode === "mock") return;
  const [payments, approvals] = await Promise.all([api.payments(), api.approvals()]);
  setState({ payments, approvals });
  pushFeed(payments.map(paymentFeed));
}
export async function refreshAdmin() { if (state.mode === "live") setState({ admin: (await api.me().catch(() => ({ admin: false }))).admin }); }

// ---------- events ----------
let replaying = true;
export function applyEvent(e: StreamEvent | { t: string; [k: string]: unknown }, opts: { animate?: boolean } = {}) {
  const animate = opts.animate ?? !replaying;
  const ev = e as StreamEvent;
  const now = Date.now();
  switch (ev.t) {
    case "memory": {
      setState((s) => ({ nodes: { ...s.nodes, [ev.node.key]: { ...s.nodes[ev.node.key], ...ev.node } } }));
      pushFeed([memoryFeed(ev.node)]);
      soonRefresh();
      break;
    }
    case "confirmed":
      setState((s) => (s.nodes[ev.key] ? { nodes: { ...s.nodes, [ev.key]: { ...s.nodes[ev.key], pending: false, proofUrl: ev.proofUrl } } } : {}));
      pushFeed([{ id: `c:${ev.key}`, at: now, tone: "ok", key: ev.key, text: `Signed and stored on Arkiv: ${shortKey(ev.key)}`, href: ev.proofUrl }]);
      break;
    case "write_failed":
      setState((s) => { const nodes = { ...s.nodes }; delete nodes[ev.key]; return { nodes }; });
      if (animate) toast(`A write did not land on Arkiv: ${ev.error}`, "bad");
      break;
    case "revocation": {
      pushFeed([{ id: `r:${ev.target.type}:${ev.target.id}`, at: now, tone: "bad", text: `Revoked ${ev.target.type} ${ev.target.type === "memory" ? shortKey(ev.target.id) : ev.target.id}: ${ev.affected.length} memories quarantined in every AI`, href: ev.arkivUrl }]);
      if (animate) setState((s) => ({ cascade: { id: now, affected: ev.affected, depth: cascadeDepth(s.nodes, ev.affected), at: now } }));
      soonRefresh();
      refreshPayments().catch(() => {});
      break;
    }
    case "notice":
      setState((s) => ({ notices: { ...s.notices, [ev.toAgent]: ev.count } }));
      pushFeed([{ id: `n:${ev.toAgent}:${ev.count}`, at: now, tone: "warn", agent: ev.toAgent, vendor: vendorOfAgent(ev.toAgent), text: `${ev.toAgent} has ${ev.count} retraction notice${ev.count === 1 ? "" : "s"} waiting` }]);
      break;
    case "kept":
      setState((s) => (s.nodes[ev.key] ? { nodes: { ...s.nodes, [ev.key]: { ...s.nodes[ev.key], kept: true, expiresAt: ev.expiresAt } } } : {}));
      pushFeed([{ id: `k:${ev.key}:${ev.expiresAt}`, at: now, tone: "ok", key: ev.key, text: `A person kept ${shortKey(ev.key)}, so it won't fade` }]);
      break;
    case "expired":
      setState((s) => (s.nodes[ev.key] ? { nodes: { ...s.nodes, [ev.key]: { ...s.nodes[ev.key], status: "expired" } } } : {}));
      pushFeed([{ id: `x:${ev.key}`, at: now, tone: "info", key: ev.key, text: `${shortKey(ev.key)} faded out of Arkiv (2-day lease ended)` }]);
      break;
    case "connected":
      setState((s) => ({ connected: { ...s.connected, [ev.agent]: ev.client ?? "an MCP client" } }));
      pushFeed([{ id: `cn:${ev.agent}:${ev.client}`, at: now, tone: "ok", agent: ev.agent, vendor: vendorOfAgent(ev.agent), text: `${ev.agent} connected${ev.client ? ` via ${ev.client}` : ""}` }]);
      refreshTeam().catch(() => {});
      break;
    case "payment":
      setState((s) => ({ payments: [ev.payment, ...s.payments.filter((p) => p.intentId !== ev.payment.intentId)] }));
      pushFeed([{ ...paymentFeed(ev.payment), at: Math.max(ev.payment.createdAt, now - 1000) }]);
      if (ev.payment.decision.status !== "pending_human") setState((s) => ({ approvals: s.approvals.filter((a) => a.intentId !== ev.payment.intentId) }));
      if (animate) toast(`Payment ${DECISION_WORD[ev.payment.decision.status]}: ${ev.payment.amount} USDC to ${ev.payment.payeeEns ?? shortKey(ev.payment.payee)}`, ev.payment.decision.status === "paid" ? "ok" : ev.payment.decision.status === "blocked" ? "bad" : "warn");
      refreshPayments().catch(() => {});
      break;
    case "approval":
      setState((s) => ({ approvals: [ev.approval, ...s.approvals.filter((a) => a.id !== ev.approval.id)] }));
      pushFeed([{ id: `a:${ev.approval.id}`, at: now, tone: "warn", agent: ev.approval.agent, vendor: vendorOfAgent(ev.approval.agent), text: `${ev.approval.agent} needs a human to approve ${ev.approval.amount} USDC to ${ev.approval.payeeEns ?? shortKey(ev.approval.payee)}` }]);
      refreshPayments().catch(() => {});
      break;
    case "agent":
      setState((s) => (s.team ? { team: { ...s.team, agents: s.team.agents.map((a) => (a.label === ev.agent.label ? { ...a, ...ev.agent } : a)) } } : {}));
      pushFeed([{ id: `ag:${ev.agent.label}:${ev.agent.status}`, at: now, tone: ev.agent.status === "active" ? "ok" : "bad", agent: ev.agent.label, vendor: ev.agent.vendor, text: `${ev.agent.ens} is now ${ev.agent.status.toUpperCase()} on ENS` }]);
      break;
  }
}

// ---------- boot ----------
let booted = false;
let es: EventSource | undefined;
let lastSeq = 0;

function openStream() {
  es?.close();
  replaying = true;
  const src = new EventSource(api.streamUrl(lastSeq), { withCredentials: true });
  es = src;
  let quiet: ReturnType<typeof setTimeout> = setTimeout(() => (replaying = false), 900);
  src.onopen = () => setState({ conn: "open" });
  src.onmessage = (m) => {
    const id = Number(m.lastEventId); if (id) lastSeq = Math.max(lastSeq, id);
    clearTimeout(quiet); if (replaying) quiet = setTimeout(() => (replaying = false), 400);
    try { applyEvent(JSON.parse(m.data)); setState({ lastEvent: Date.now() }); } catch { /* ignore a bad frame */ }
  };
  src.onerror = () => {
    src.close();
    if (es !== src) return;
    setState({ conn: "reconnecting" });
    setTimeout(() => { if (es === src) openStream(); }, 2000);
  };
}

export async function boot(mock: boolean) {
  if (booted) return;
  booted = true;
  if (mock) { const { startMock } = await import("./mock"); return startMock(); }
  if (!SERVER_URL) { setState({ conn: "noserver", loaded: true, error: "NEXT_PUBLIC_SERVER_URL is not set, so there is no server to read from." }); return; }
  try {
    // /healthz sits outside the server's /api CORS scope, so the browser doesn't call it (Request filed to Lane A).
    const team = await api.team();
    setState({ team });
    await Promise.all([refreshGraph(), refreshPayments().catch(() => {}), refreshAdmin()]);
    setState({ loaded: true, error: undefined });
    openStream();
  } catch (e) {
    booted = false;
    setState({ conn: "noserver", loaded: true, error: e instanceof ApiError ? e.message : "The Supabrain server can't be reached." });
    setTimeout(() => boot(false), 4000);
  }
}

// ---------- owner actions (mock mode computes them locally) ----------
export async function dryRun(target: RevocationTarget): Promise<DryRun> {
  if (state.mode === "mock") return (await import("./mock")).mockDryRun(target);
  return api.dryRun(target);
}
