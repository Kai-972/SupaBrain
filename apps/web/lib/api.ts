// Every call to the Supabrain server lives here (C-UI.md §6). The base URL is public config, never a secret.
import type { AgentView, ApprovalView, DryRun, Edge, MemoryNode, Payment, RevocationTarget, Client, MemoryKind, PrivateRef } from "@supabrain/shared";

export const SERVER_URL = (process.env.NEXT_PUBLIC_SERVER_URL ?? "").replace(/\/+$/, "");

export type Dispute =
  | { state: "disputed"; subject: string; ensAddress: `0x${string}`; claimed: string[] }
  | { state: "unverified"; subject: string; reason: string };

export type GraphNode = MemoryNode & { dispute?: Dispute };
export type LiveAgent = Omit<AgentView, "status"> & {
  status: AgentView["status"] | "unknown";
  authority?: "live" | "unavailable";
  recordsOk?: boolean;
};
export interface TeamResponse {
  team: { id: string; displayName: string; ens: string };
  agents: LiveAgent[];
  vendors: string[];
  counts: { memories: number; active: number; quarantined: number; expired: number; pending: number };
}
export interface GraphResponse { nodes: GraphNode[]; edges: Edge[]; seq: number }
export type MemoryDetail = GraphNode & { lineage: string[][]; readers: string[]; why?: string };
export interface RecallLogEntry { at: number; agent: string; query: string; results: { key: string; status: string }[] }
export interface Health { ok: boolean; app: string; team: string; payments: "enabled" | "disabled" }
export interface RevokeResult {
  revocationKey: string; arkivUrl?: string; affected: string[]; notified?: string[] | number; dryRun?: DryRun;
  vaultTxUrl?: string; cancelled?: string[]; paymentsError?: string; ensNote?: string;
}
export interface PairResult {
  agent: string; ens: string; client?: Client; token: string; snippets: Record<Client, string>; prompt: string;
  code?: string; qrPayload?: string; expiresAt: number;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  if (!SERVER_URL) throw new ApiError(0, "NO_SERVER", "NEXT_PUBLIC_SERVER_URL is not set");
  const { json, ...rest } = init ?? {};
  const res = await fetch(`${SERVER_URL}${path}`, {
    credentials: "include",
    cache: "no-store",
    ...rest,
    ...(json !== undefined ? { method: rest.method ?? "POST", body: JSON.stringify(json), headers: { "content-type": "application/json" } } : {}),
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const b = body as { error?: string; message?: string };
    throw new ApiError(res.status, b.error ?? String(res.status), b.message ?? b.error ?? `request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  health: () => call<Health>("/healthz"),
  team: () => call<TeamResponse>("/api/team"),
  graph: (since = 0) => call<GraphResponse>(`/api/graph?since=${since}`),
  memory: (key: string) => call<MemoryDetail>(`/api/memory/${encodeURIComponent(key)}`),
  recallLog: (agent?: string, q?: string) => {
    const p = new URLSearchParams();
    if (agent) p.set("agent", agent);
    if (q) p.set("q", q);
    return call<RecallLogEntry[]>(`/api/recall-log?${p}`);
  },
  payments: () => call<Payment[]>("/api/payments"),
  approvals: () => call<ApprovalView[]>("/api/approvals"),
  me: () => call<{ admin: boolean }>("/api/admin/me"),
  login: (passphrase: string) => call<unknown>("/api/admin/login", { json: { passphrase } }),
  logout: () => call<unknown>("/api/admin/logout", { method: "POST" }),
  dryRun: (target: RevocationTarget) => call<DryRun>("/api/dryrun", { json: { target } }),
  revoke: (target: RevocationTarget, reason?: string) => call<RevokeResult>("/api/revoke", { json: { target, reason } }),
  addContext: (b: { text: string; kind: MemoryKind; folder: string; subject?: string; ref?: PrivateRef }) => call<MemoryNode>("/api/memory/human", { json: b }),
  keep: (key: string, days?: number) => call<{ expiresAt: number; days: number; txUrl?: string; extended?: boolean }>(`/api/memory/${key}/keep`, { json: { days } }),
  correct: (key: string, text: string) => call<{ revocationKey: string; arkivUrl?: string; newKey: string; affected: string[] }>(`/api/memory/${key}/correct`, { json: { text } }),
  cancelApproval: (id: string) => call<void>(`/api/approvals/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  pair: (label: string, client?: Client) => call<PairResult>("/api/pair", { json: { label, client } }),
  pairCode: (code: string) => call<PairResult>(`/api/pair/${encodeURIComponent(code)}`),
  streamUrl: (since: number) => `${SERVER_URL}/api/stream?since=${since}`,
};
