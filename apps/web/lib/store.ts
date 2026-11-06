"use client";
// One store for the whole site. Real mode: REST snapshot + SSE patches through applyEvent.
// Mock mode (?mock=1 only): the same applyEvent replays fixtures/v2-demo.json behind the MOCK DATA banner.
import { useSyncExternalStore } from "react";
import type { BlockedEntry, CheckpointView, FileView, HeadView, StreamEvent, TaskView, Vendor } from "@supabrain/shared";
import {
  api, ApiError, HAS_SERVER,
  type BrainView, type GraphNode, type HeadRow, type Health, type LabResponse, type Registry, type ReviewItem, type RulesResponse,
} from "./api";
import { blockLabel, short } from "./format";

export type Tone = "ok" | "bad" | "warn" | "info";
export interface FeedItem { id: string; at: number; tone: Tone; agent?: string; vendor?: Vendor; label?: string; text: string; key?: string; href?: string; source?: string }
export interface Cascade { id: number; keys: string[]; at: number }
export interface LabEntry { id: number; at: number; agent: string; action: string; input: Record<string, unknown>; res?: LabResponse; error?: string; pending?: boolean }
export type Conn = "connecting" | "open" | "reconnecting" | "noserver" | "mock";

export interface State {
  mode: "live" | "mock";
  conn: Conn;
  loaded: boolean;
  error?: string;
  health?: Health;
  brain?: BrainView;
  nodes: Record<string, GraphNode>;
  checkpoints: CheckpointView[];
  tasks: TaskView[];
  files: FileView[];
  rules?: RulesResponse;
  blocked: BlockedEntry[];
  heads: HeadRow[];
  review: ReviewItem[];
  registry?: Registry;
  headEvents: Record<string, HeadView>;
  connected: Record<string, string>;
  notices: Record<string, number>;
  feed: FeedItem[];
  lab: LabEntry[];
  admin: boolean;
  cascade?: Cascade;
  pulse?: { agent: string; at: number };
  toast?: { id: number; tone: Tone; text: string };
  lastEvent: number;
  /** key → when it last changed (memory / confirmed / stop), so the graph animates only what just changed */
  recent: Record<string, number>;
}

let state: State = {
  mode: "live", conn: "connecting", loaded: false, nodes: {}, checkpoints: [], tasks: [], files: [], blocked: [], heads: [], review: [],
  headEvents: {}, connected: {}, notices: {}, feed: [], lab: [], admin: false, lastEvent: 0, recent: {},
};
const touch = (s: State, ...keys: string[]) => {
  const now = Date.now();
  const recent: Record<string, number> = {};
  for (const [k, t] of Object.entries(s.recent)) if (now - t < 8000) recent[k] = t; // keep it small
  for (const k of keys) recent[k] = now;
  return recent;
};
const listeners = new Set<() => void>();
export const getState = () => state;
export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(state));
}
let toastId = 0;
export const toast = (text: string, tone: Tone = "info") => setState({ toast: { id: ++toastId, tone, text } });

export const brainId = () => state.brain?.id ?? state.health?.team ?? "";
export const agentOf = (label: string) => state.brain?.agents.find((a) => a.label === label);
export const vendorOfAgent = (label: string): Vendor => (label === "owner" ? "human" : (agentOf(label)?.vendor as Vendor) ?? "human");
export const ensOf = (label: string) => agentOf(label)?.ens ?? label;

// ---------- feed ----------
function pushFeed(items: FeedItem[]) {
  if (!items.length) return;
  setState((s) => {
    const seen = new Set(s.feed.map((f) => f.id));
    const add = items.filter((i) => !seen.has(i.id));
    return add.length ? { feed: [...add, ...s.feed].sort((a, b) => b.at - a.at).slice(0, 250) } : {};
  });
}
const nodeFeed = (n: GraphNode): FeedItem | undefined => {
  if (n.kind === "file" || n.kind === "task") return undefined;
  const client = n.checkpoint?.client;
  return {
    id: `m:${n.key}`, at: n.createdAt, agent: n.agent, vendor: n.vendor, key: n.key, href: n.proofUrl,
    tone: n.status === "quarantined" ? "bad" : "info",
    label: n.status === "quarantined" ? "STOPPED" : n.pending ? "SAVING" : "SAVED",
    text: `${ensOf(n.agent)} ${n.kind === "checkpoint" ? "saved" : `noted (${n.kind})`} “${n.text.length > 90 ? n.text.slice(0, 90) + "…" : n.text}”`,
    source: client ? (client === "supabrain-lab" ? "LAB" : `MCP · ${client}`) : undefined,
  };
};
const blockFeed = (b: BlockedEntry): FeedItem => ({
  id: `b:${b.at}:${b.agent}:${b.code}`, at: b.at, agent: b.agent, vendor: vendorOfAgent(b.agent), key: b.key, href: b.arkivUrl,
  tone: "bad", label: blockLabel(b.code, b.rule),
  text: b.code === "STOPPED" && b.excerpt ? `relayed by ${b.ens ?? b.agent} · “${b.excerpt}”` : `${b.ens ?? b.agent} · ${b.message}`,
});

// ---------- snapshot ----------
const debounced: Record<string, ReturnType<typeof setTimeout>> = {};
const soon = (k: string, fn: () => Promise<unknown>, ms = 600) => { clearTimeout(debounced[k]); debounced[k] = setTimeout(() => { fn().catch(() => {}); }, ms); };

export async function refreshGraph() {
  if (state.mode === "mock") return;
  const g = await api.graph(0);
  const nodes: Record<string, GraphNode> = {};
  for (const n of g.nodes) nodes[n.key] = n;
  setState({ nodes });
  pushFeed(g.nodes.map(nodeFeed).filter(Boolean) as FeedItem[]);
}
export async function refreshWork() {
  const id = brainId(); if (!id || state.mode === "mock") return;
  const [checkpoints, tasks, files] = await Promise.all([api.checkpoints(id), api.tasks(id), api.files(id)]);
  setState({ checkpoints, tasks, files });
}
export async function refreshSafety() {
  const id = brainId(); if (!id || state.mode === "mock") return;
  const [blocked, heads, review] = await Promise.all([api.blocked(id).catch(() => state.blocked), api.heads(id).catch(() => state.heads), api.review(id).catch(() => state.review)]);
  setState({ blocked, heads, review });
  pushFeed(blocked.map(blockFeed));
}
export async function refreshRules() {
  const id = brainId(); if (!id || state.mode === "mock") return;
  setState({ rules: await api.rules(id) });
}
export async function refreshBrain() {
  if (state.mode === "mock") return;
  const brains = await api.brains();
  const want = state.health?.team;
  setState({ brain: brains.find((b) => b.id === want) ?? brains[0] });
}
export async function refreshAdmin() { if (state.mode === "live") setState({ admin: (await api.me().catch(() => ({ admin: false }))).admin }); }
export async function loadRegistry() { if (state.mode === "live" && !state.registry) setState({ registry: await api.registry() }); }

// ---------- events ----------
let replaying = true;
export function applyEvent(e: StreamEvent | { t: string; [k: string]: unknown }, opts: { animate?: boolean } = {}) {
  const animate = opts.animate ?? !replaying;
  const ev = e as StreamEvent;
  const now = Date.now();
  switch (ev.t) {
    case "memory": {
      setState((s) => ({ nodes: { ...s.nodes, [ev.node.key]: { ...s.nodes[ev.node.key], ...ev.node } }, ...(animate ? { recent: touch(s, ev.node.key) } : {}) }));
      const f = nodeFeed(ev.node); if (f) pushFeed([f]);
      soon("graph", refreshGraph, 900); soon("work", refreshWork); soon("brain", refreshBrain, 1200);
      break;
    }
    case "confirmed":
      setState((s) => (s.nodes[ev.key] ? { nodes: { ...s.nodes, [ev.key]: { ...s.nodes[ev.key], pending: false, proofUrl: ev.proofUrl } }, ...(animate ? { recent: touch(s, ev.key) } : {}) } : {}));
      pushFeed([{ id: `c:${ev.key}`, at: now, tone: "ok", label: "ON ARKIV", key: ev.key, text: `Signed and stored on Arkiv · ${short(ev.key)}`, href: ev.proofUrl }]);
      soon("work", refreshWork);
      break;
    case "write_failed":
      setState((s) => { const nodes = { ...s.nodes }; delete nodes[ev.key]; return { nodes }; });
      if (animate) toast(`A write did not land on Arkiv: ${ev.error}`, "bad");
      break;
    case "blocked": {
      setState((s) => ({ blocked: [ev.block, ...s.blocked.filter((b) => !(b.at === ev.block.at && b.agent === ev.block.agent && b.code === ev.block.code))], pulse: { agent: ev.block.agent, at: now } }));
      pushFeed([blockFeed(ev.block)]);
      if (ev.block.code === "STOPPED" && ev.block.key && animate) setState({ cascade: { id: now, keys: [ev.block.key], at: now } });
      soon("safety", refreshSafety); soon("graph", refreshGraph, 1500);
      break;
    }
    case "head": {
      setState((s) => ({ headEvents: { ...s.headEvents, [ev.head.agent]: ev.head } }));
      pushFeed([{ id: `h:${ev.head.agent}:${ev.head.key}`, at: ev.head.at || now, tone: ev.head.error ? "warn" : "ok", label: ev.head.error ? "HEAD FAILED" : "HEAD ON ENS", agent: ev.head.agent, vendor: vendorOfAgent(ev.head.agent), key: ev.head.key, href: ev.head.txUrl, text: ev.head.error ? `${ev.head.ens}: ${ev.head.error}` : `${ev.head.ens} now points at ${short(ev.head.key)} (sb.memory.head)` }]);
      soon("safety", refreshSafety, 1500);
      break;
    }
    case "revocation":
      if (animate) setState({ cascade: { id: now, keys: ev.affected, at: now } });
      pushFeed([{ id: `r:${ev.target.type}:${ev.target.id}`, at: now, tone: "bad", label: "REVOKED ON ARKIV", text: `${ev.affected.length} item${ev.affected.length === 1 ? "" : "s"} revoked: no AI will receive ${ev.affected.length === 1 ? "it" : "them"}`, href: ev.arkivUrl }]);
      soon("graph", refreshGraph, 700); soon("work", refreshWork); soon("safety", refreshSafety);
      break;
    case "notice":
      setState((s) => ({ notices: { ...s.notices, [ev.toAgent]: ev.count } }));
      break;
    case "connected":
      setState((s) => ({ connected: { ...s.connected, [ev.agent]: ev.client ?? "an MCP app" } }));
      pushFeed([{ id: `cn:${ev.agent}:${ev.client}`, at: now, tone: "ok", label: "CONNECTED", agent: ev.agent, vendor: vendorOfAgent(ev.agent), text: `${ensOf(ev.agent)} connected via ${ev.client ?? "an MCP app"}` }]);
      soon("brain", refreshBrain);
      break;
    case "agent":
      soon("brain", refreshBrain); soon("rules", refreshRules);
      break;
    case "expired":
      setState((s) => (s.nodes[ev.key] ? { nodes: { ...s.nodes, [ev.key]: { ...s.nodes[ev.key], status: "expired" } } } : {}));
      break;
    default:
      break;
  }
}

// ---------- boot ----------
let booted = false;
let es: EventSource | undefined;
let lastSeq = 0;
let lastOpenAt = 0;

function openStream() {
  es?.close();
  replaying = true;
  const src = new EventSource(api.streamUrl(lastSeq), { withCredentials: true });
  es = src;
  let quiet = setTimeout(() => (replaying = false), 900);
  let beat = Date.now();
  const watchdog = setInterval(() => {
    if (es !== src) return clearInterval(watchdog);
    if (Date.now() - beat > 35_000) { clearInterval(watchdog); src.close(); setState({ conn: "reconnecting" }); openStream(); } // pings stopped: a dead socket
  }, 5_000);
  src.addEventListener("ping", () => { beat = Date.now(); });
  src.onopen = () => { beat = Date.now(); lastOpenAt = beat; setState({ conn: "open" }); };
  src.onmessage = (m) => {
    beat = Date.now();
    const id = Number(m.lastEventId); if (id) lastSeq = Math.max(lastSeq, id);
    clearTimeout(quiet); if (replaying) quiet = setTimeout(() => (replaying = false), 400);
    try { applyEvent(JSON.parse(m.data)); setState({ lastEvent: Date.now() }); } catch { /* skip a bad frame */ }
  };
  src.onerror = () => {
    clearInterval(watchdog);
    src.close();
    if (es !== src) return;
    // Hosts close long-lived responses every minute or two. Reopen at once from lastSeq (nothing is lost) and only
    // say "reconnecting" if the new stream has not opened within a few seconds.
    const wasOpen = state.conn === "open";
    setTimeout(() => {
      if (es !== src) return;
      const at = Date.now();
      openStream();
      const next = es;
      setTimeout(() => { if (es === next && lastOpenAt < at) setState({ conn: "reconnecting" }); }, wasOpen ? 4000 : 0);
    }, wasOpen ? 0 : 2000);
  };
}

export async function boot(mock: boolean) {
  if (booted) return;
  booted = true;
  if (mock) { const { startMock } = await import("./mock"); return startMock(); }
  if (!HAS_SERVER) { setState({ conn: "noserver", loaded: true, error: "NEXT_PUBLIC_SERVER_URL is not set, so there is no server to read from." }); return; }
  try {
    const health = await api.health();
    setState({ health });
    await refreshBrain();
    await Promise.all([refreshGraph(), refreshWork(), refreshSafety(), refreshRules().catch(() => {}), refreshAdmin()]);
    setState({ loaded: true, error: undefined });
    openStream();
  } catch (e) {
    booted = false;
    setState({ conn: "noserver", loaded: true, error: e instanceof ApiError ? e.message : "The Supabrain server can't be reached." });
    setTimeout(() => boot(false), 4000);
  }
}

// ---------- the attack lab ----------
let labId = 0;
export async function runLab(agent: string, action: "continue" | "checkpoint" | "checkout", input: Record<string, unknown>): Promise<LabEntry> {
  const entry: LabEntry = { id: ++labId, at: Date.now(), agent, action, input, pending: true };
  setState((s) => ({ lab: [entry, ...s.lab].slice(0, 80) }));
  const done = (patch: Partial<LabEntry>) => {
    const next = { ...entry, ...patch, pending: false };
    setState((s) => ({ lab: s.lab.map((l) => (l.id === entry.id ? next : l)) }));
    return next;
  };
  if (state.mode === "mock") return done({ error: "The lab needs the live server: MOCK DATA can't run real tools." });
  try {
    const res = await api.lab(brainId(), agent, action, input);
    if (res.outcome !== "ok" || action === "checkpoint") { soon("safety", refreshSafety, 300); soon("graph", refreshGraph, 500); soon("work", refreshWork, 500); }
    return done({ res });
  } catch (e) {
    return done({ error: e instanceof ApiError ? (e.status === 401 ? "Owner sign-in needed to drive the lab." : e.status === 429 ? `Lab limit reached: ${e.message}` : e.message) : "Request failed" });
  }
}
