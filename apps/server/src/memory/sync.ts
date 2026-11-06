// Keeps the in-memory graph equal to Arkiv (A-BRAIN S2 step 1): watcher first, then the full load; merge live events;
// restart the watcher when it falls behind (it never recovers on its own, arkiv/friction.md); expiry ticker.
import type { MemoryNode } from "@supabrain/shared";
import type { MemoryGraph } from "../engine/graph";
import type { EventBus } from "../events";
import type { MemoryStore, StoreWatchHandlers } from "./store";

export interface SyncDeps {
  store: MemoryStore;
  graph: MemoryGraph;
  bus: EventBus;
  now?: () => number;
  /** expiry ticker period; 0 disables the timer (tests call tick()) */
  tickMs?: number;
  maxWatchErrors?: number;
  log?: (line: string) => void;
}

export function startSync(d: SyncDeps) {
  const now = d.now ?? Date.now;
  const log = d.log ?? (() => undefined);
  const announcedExpired = new Set<string>();
  let errors = 0;
  let stopped = false;

  const merge = (n: MemoryNode, announce: boolean) => {
    const have = d.graph.get(n.key);
    if (have) {
      if (have.pending) d.graph.patch(n.key, { pending: false, ...(have.proofUrl ? {} : n.proofUrl ? { proofUrl: n.proofUrl } : {}) });
      return;
    }
    d.graph.upsert(n);
    if (announce) d.bus.emit({ t: "memory", node: d.graph.get(n.key)!, edges: n.parents.map((parent) => ({ parent, child: n.key })) });
  };

  const handlers: StoreWatchHandlers = {
    onMemory: (n) => { errors = 0; merge(n, true); },
    onRevocation: (t) => { errors = 0; d.graph.applyRevocation(t); },
    onExtended: (key, expiresAt) => {
      if (!d.graph.has(key)) return;
      d.graph.patch(key, { expiresAt });
      announcedExpired.delete(key);
      d.bus.emit({ t: "kept", key, expiresAt });
    },
    onError: (e) => {
      errors++;
      log(`arkiv watcher error ${errors}: ${e.message}`);
      if (errors >= (d.maxWatchErrors ?? 3) && !stopped) void restart();
    },
  };

  const load = async () => {
    const { memories, revocations } = await d.store.loadAll();
    for (const r of revocations) d.graph.applyRevocation(r);
    for (const m of memories.sort((a, b) => a.seq - b.seq)) merge(m, false);
    return { memories: memories.length, revocations: revocations.length };
  };

  let unwatch = d.store.watch(handlers);
  const ready = load();

  async function restart() {
    errors = 0;
    unwatch();
    unwatch = d.store.watch(handlers);
    try {
      const r = await load();
      log(`arkiv watcher restarted at head; reconciled ${r.memories} memories`);
    } catch (e) {
      log(`arkiv reload after watcher restart failed: ${(e as Error).message}`);
    }
  }

  const tick = () => {
    for (const n of d.graph.all()) {
      if (n.status === "expired" && n.expiresAt <= now() && !announcedExpired.has(n.key)) {
        announcedExpired.add(n.key);
        d.bus.emit({ t: "expired", key: n.key });
      }
    }
  };
  const timer = d.tickMs ? setInterval(tick, d.tickMs) : undefined;
  timer?.unref?.();

  return {
    ready,
    tick,
    stop() {
      stopped = true;
      unwatch();
      if (timer) clearInterval(timer);
    },
  };
}
