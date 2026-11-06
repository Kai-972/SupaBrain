// Every call to the Supabrain server (docs/FRONTEND_V2.md §5, docs/API_V2.md). The base URL is public config.
import type {
  AgentView, BlockedEntry, CheckpointView, Client, Edge, FileView, HeadView, MemoryNode, TaskView,
} from "@supabrain/shared";

export const SERVER_URL = (process.env.NEXT_PUBLIC_SERVER_URL ?? "").replace(/\/+$/, "");

export interface Health { ok: boolean; app: string; team: string; mode: "brain" | "team"; ens: string; payments: "enabled" | "disabled" }

export type LiveAgent = Omit<AgentView, "status"> & {
  status: AgentView["status"] | "paused" | "unknown";
  authority?: "live" | "unavailable";
  recordsOk?: boolean;
  writeDaily?: string;
};
export interface BrainView {
  id: string; name: string; ens: string; visibility: string; active: boolean; stopped: boolean;
  owner?: string; createdAt?: number; expiresAt?: number;
  agents: LiveAgent[];
  counts: { checkpoints: number; tasksOpen: number; tasksDone: number; files: number; notices: number };
}
export interface RuleRow { agent: string; vendor: string; ens: string; resolver?: string; status: string; scope: string; writeDaily?: string; role: string }
export interface RulesResponse { editable: boolean; agents: RuleRow[] }
export interface RuleChange { agent: string; ens: string; txHash: string | null; txUrl?: string; changed: Record<string, { from: string; to: string }> }
export interface HeadRow { agent: string; ens: string; serverHead: string | null; ensHead: string | null; match: boolean; txUrl?: string; error?: string }
export interface ReviewItem { key: string; agent: string; ens: string; reason: string; excerpt: string; at: number; status: "stopped"; arkivUrl?: string }
export interface RegistryAgent { ens: string; wallet: string; resolver: string; expiry: number; records: Record<string, string>; fundingUrl?: string; fundedGlm?: string | number }
export interface RegistryBrain { label: string; ens: string; index: number; registry: string; expiry: number; served: boolean; txUrls: string[]; agents: Record<string, RegistryAgent> }
export interface Registry { teamRegistry: string; updatedAt: string; served: string; brains: RegistryBrain[] }
export type GraphNode = MemoryNode & { dispute?: unknown };
export interface GraphResponse { nodes: GraphNode[]; edges: Edge[]; seq: number }
export type MemoryDetail = GraphNode & { lineage: string[][]; readers: string[]; why?: string };
export interface FileContent { path: string; key: string; content: string; status: string; agent: string;
  versions: { key: string; agent: string; vendor: string; at: number; size: number; status: string; deleted?: boolean; proofUrl?: string }[] }
export interface Summary { text: string; pack: Record<string, unknown> }
export type LabAction = "continue" | "checkpoint" | "checkout";
export type LabResponse =
  | { agent: string; action: LabAction; outcome: "ok"; result: { text?: string; key?: string; [k: string]: unknown } }
  | { agent: string; action: LabAction; outcome: "stopped"; result: { key: string; stopped: { rule: string; excerpt: string; arkivUrl?: string } } }
  | { agent: string; action: LabAction; outcome: "refused"; code: string; rule?: string; message: string };
export interface PairResult { agent: string; ens: string; client?: Client; token: string; snippets: Record<string, string>; prompt: string; code?: string; qrPayload?: string; expiresAt: number }
export type { BlockedEntry, CheckpointView, FileView, HeadView, TaskView };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  if (!SERVER_URL) throw new ApiError(0, "NO_SERVER", "NEXT_PUBLIC_SERVER_URL is not set");
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}${path}`, {
      credentials: "include", cache: "no-store", ...rest,
      ...(json !== undefined ? { method: rest.method ?? "POST", body: JSON.stringify(json), headers: { "content-type": "application/json" } } : {}),
    });
  } catch {
    throw new ApiError(0, "OFFLINE", "The Supabrain server can't be reached.");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const b = body as { error?: string; message?: string };
    throw new ApiError(res.status, b.error ?? String(res.status), b.message ?? b.error ?? `request failed (${res.status})`);
  }
  return body as T;
}

const b = (id: string) => `/api/brains/${encodeURIComponent(id)}`;

export const api = {
  health: () => call<Health>("/healthz"),
  brains: () => call<BrainView[]>("/api/brains"),
  registry: () => call<Registry>("/api/registry"),
  graph: (since = 0) => call<GraphResponse>(`/api/graph?since=${since}`),
  memory: (key: string) => call<MemoryDetail>(`/api/memory/${encodeURIComponent(key)}`),
  summary: (id: string, focus?: string) => call<Summary>(`${b(id)}/summary${focus ? `?focus=${encodeURIComponent(focus)}` : ""}`),
  checkpoints: (id: string) => call<CheckpointView[]>(`${b(id)}/checkpoints`),
  tasks: (id: string) => call<TaskView[]>(`${b(id)}/tasks`),
  addTask: (id: string, title: string) => call<TaskView>(`${b(id)}/tasks`, { json: { title } }),
  files: (id: string) => call<FileView[]>(`${b(id)}/files`),
  fileContent: (id: string, path: string, key?: string) => call<FileContent>(`${b(id)}/files/content?path=${encodeURIComponent(path)}${key ? `&key=${encodeURIComponent(key)}` : ""}`),
  notes: (id: string) => call<MemoryNode[]>(`${b(id)}/notes`),
  rules: (id: string) => call<RulesResponse>(`${b(id)}/rules`),
  setRules: (id: string, body: { agent: string; status?: string; scope?: string; writeDaily?: string; role?: string }) => call<RuleChange>(`${b(id)}/rules`, { json: body }),
  blocked: (id: string) => call<BlockedEntry[]>(`${b(id)}/blocked`),
  review: (id: string) => call<ReviewItem[]>(`${b(id)}/review`),
  heads: (id: string) => call<HeadRow[]>(`${b(id)}/heads`),
  lab: (id: string, agent: string, action: LabAction, input: Record<string, unknown>) => call<LabResponse>(`${b(id)}/lab/act`, { json: { agent, action, input } }),
  me: () => call<{ admin: boolean }>("/api/admin/me"),
  login: (passphrase: string) => call<unknown>("/api/admin/login", { json: { passphrase } }),
  logout: () => call<unknown>("/api/admin/logout", { method: "POST" }),
  pair: (label: string, client?: string) => call<PairResult>("/api/pair", { json: { label, client } }),
  pairCode: (code: string) => call<PairResult>(`/api/pair/${encodeURIComponent(code)}`),
  streamUrl: (since: number) => `${SERVER_URL}/api/stream?since=${since}`,
};

/** Explorer base derived from a tx link the API gave us (never hard-coded), e.g. for resolver address links. */
export function explorerFromTx(txUrl?: string): string | undefined {
  if (!txUrl) return undefined;
  const m = /^(.*)\/tx\/0x[0-9a-fA-F]+\/?$/.exec(txUrl);
  return m ? m[1] : undefined;
}
