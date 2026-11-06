// Everything stateful the server holds, built once and shared by the MCP tools and the dashboard API.
import type { AppConfig, EnsAuthority } from "@supabrain/shared";
import { MemoryGraph } from "./engine/graph";
import { NoticeBox, ReadLog, ReadSets } from "./engine/session";
import { EventBus } from "./events";
import { createMemoryService } from "./memory/service";
import type { MemoryStore } from "./memory/store";

export interface ClientSeen { name: string; version: string; protocolVersion?: string; at: number }

export function createRuntime(p: { config: AppConfig; ens: EnsAuthority; store: MemoryStore; now?: () => number; log?: (l: string) => void }) {
  const now = p.now ?? Date.now;
  const graph = new MemoryGraph(now);
  const bus = new EventBus();
  const readSets = new ReadSets(p.config.app.readSet.ttlSec, now);
  const readLog = new ReadLog();
  const notices = new NoticeBox();
  const service = createMemoryService({ config: p.config, ens: p.ens, store: p.store, graph, readSets, readLog, notices, bus, now, log: p.log });
  /** last MCP client seen per agent (from `initialize`), for whoami and the agents rail */
  const clients = new Map<string, ClientSeen>();
  return { graph, bus, readSets, readLog, notices, service, store: p.store, clients };
}

export type Runtime = ReturnType<typeof createRuntime>;
