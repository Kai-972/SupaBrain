// v2 git-style refs on ENS: after an AI's checkpoint is confirmed on Arkiv, its key is written to that AI's ENS name
// (text record sb.memory.head) by the server's team key. Anyone can then resolve claude.<brain>.supabrain.eth →
// newest commit → walk its lineage on Arkiv, without asking our server (refs on ENS, objects on Arkiv).
// Per AI, only the newest pending head is published (a burst of checkpoints costs one transaction), and a stopped or
// quarantined checkpoint never becomes a head.
import type { HeadView } from "@supabrain/shared";
import type { MemoryGraph } from "./engine/graph";
import type { EventBus } from "./events";

export interface HeadWriter {
  setHead(agentEns: string, key: `0x${string}`): Promise<{ txHash: string | null; txUrl: string | null }>;
}

export function createHeadPublisher(p: {
  writer: HeadWriter; bus: EventBus; graph: MemoryGraph; ensOf: (agent: string) => string | undefined;
  /** true for a checkpoint that is being stopped (its revocation may land after Arkiv confirms it) */
  skip?: (key: string) => boolean;
  now?: () => number; log?: (l: string) => void;
}) {
  const publishable = (key: string) => p.graph.get(key)?.kind === "checkpoint" && p.graph.status(key) === "active" && !p.skip?.(key);
  const now = p.now ?? Date.now;
  const heads = new Map<string, HeadView>();
  const wanted = new Map<string, string>(); // agent → newest key still to publish
  const busy = new Set<string>();

  async function drain(agent: string) {
    if (busy.has(agent)) return;
    busy.add(agent);
    try {
      for (let key = wanted.get(agent); key; key = wanted.get(agent)) {
        wanted.delete(agent);
        const ens = p.ensOf(agent);
        if (!ens) return;
        if (!publishable(key)) continue; // checked again: it may have been stopped since it was queued
        try {
          const r = await p.writer.setHead(ens, key as `0x${string}`);
          const head: HeadView = { agent, ens, key, at: now(), ...(r.txUrl ? { txUrl: r.txUrl } : heads.get(agent)?.txUrl ? { txUrl: heads.get(agent)!.txUrl } : {}) };
          heads.set(agent, head);
          p.bus.emit({ t: "head", head });
        } catch (e) {
          const head: HeadView = { agent, ens, key, at: now(), error: (e as Error).message.split("\n")[0]! };
          heads.set(agent, head);
          p.log?.(`ENS head for ${ens} not written: ${head.error}`);
        }
      }
    } finally {
      busy.delete(agent);
    }
  }

  const unsubscribe = p.bus.subscribe(({ event }) => {
    if (event.t !== "confirmed") return;
    const n = p.graph.get(event.key);
    if (!n || !publishable(n.key)) return;
    wanted.set(n.agent, n.key);
    void drain(n.agent);
  });

  return {
    /** What the server last published per AI (or tried to). */
    list(): HeadView[] { return [...heads.values()]; },
    /** For tests: wait until nothing is pending. */
    async idle() { while (busy.size || wanted.size) await new Promise((r) => setTimeout(r, 5)); },
    stop: unsubscribe,
  };
}
export type HeadPublisher = ReturnType<typeof createHeadPublisher>;
