// Everything stateful the server holds, built once and shared by the MCP tools and the dashboard API.
import type { AppConfig, EnsAuthority } from "@supabrain/shared";
import { MemoryGraph } from "./engine/graph";
import { NoticeBox, ReadLog, ReadSets } from "./engine/session";
import { EventBus } from "./events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { BlockedLog, createContinuityService, type BlockedStore } from "./memory/continuity-service";
import { createMemoryService } from "./memory/service";
import type { MemoryStore } from "./memory/store";

export interface ClientSeen { name: string; version: string; protocolVersion?: string; at: number }

/** Keeps the refusal log in a small JSON file so counts survive a restart (the website's "blocked by ENS"). */
export function fileBlockedStore(path: string): BlockedStore {
  return {
    load: () => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : []),
    save: (entries) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(entries)); },
  };
}

export function createRuntime(p: { config: AppConfig; ens: EnsAuthority; store: MemoryStore; now?: () => number; log?: (l: string) => void; blockedStore?: BlockedStore }) {
  const now = p.now ?? Date.now;
  const graph = new MemoryGraph(now);
  const bus = new EventBus();
  const readSets = new ReadSets(p.config.app.readSet.ttlSec, now);
  const readLog = new ReadLog();
  const notices = new NoticeBox();
  const deps = { config: p.config, ens: p.ens, store: p.store, graph, readSets, readLog, notices, bus, now, log: p.log };
  const service = createMemoryService(deps);
  /** v2: continue / checkpoint / checkout (docs/PLAN.md §3.2) */
  const blocked = new BlockedLog((block) => bus.emit({ t: "blocked", block }), 200, p.blockedStore);
  const continuity = createContinuityService({ ...deps, service, blocked });
  /** last MCP client seen per agent (from `initialize`), for whoami and the agents rail */
  const clients = new Map<string, ClientSeen>();
  return { graph, bus, readSets, readLog, notices, service, continuity, blocked, store: p.store, clients };
}

export type Runtime = ReturnType<typeof createRuntime>;
