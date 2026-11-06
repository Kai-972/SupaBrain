// v2: AIs' newest checkpoints become git-style refs on their ENS names (sb.memory.head).
import { describe, expect, it } from "vitest";
import type { MemoryNode, StreamEvent } from "@supabrain/shared";
import { MemoryGraph } from "./engine/graph";
import { createHeadPublisher } from "./ens-heads";
import { EventBus } from "./events";

const key = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;
const cp = (k: string, agent = "gemini", kind: MemoryNode["kind"] = "checkpoint"): MemoryNode => ({
  key: k as `0x${string}`, text: "work", kind, folder: "project", trust: 2, agent, vendor: "gemini", seq: 1, createdAt: 1, expiresAt: Date.now() + 1e9, parents: [], roots: [], status: "active",
});

function setup(slow = 0) {
  const graph = new MemoryGraph();
  const bus = new EventBus();
  const sent: { ens: string; key: string }[] = [];
  const writer = { async setHead(ens: string, k: `0x${string}`) { await new Promise((r) => setTimeout(r, slow)); sent.push({ ens, key: k }); return { txHash: "0xabc", txUrl: `tx/${k.slice(-4)}` }; } };
  const events: StreamEvent[] = [];
  bus.subscribe((e) => events.push(e.event));
  const pub = createHeadPublisher({ writer, bus, graph, ensOf: (a) => `${a}.otter.supabrain.eth` });
  return { graph, bus, sent, events, pub };
}

describe("ENS heads", () => {
  it("a confirmed checkpoint is published to its AI's ENS name and streamed as `head`", async () => {
    const { graph, bus, sent, events, pub } = setup();
    graph.upsert(cp(key(1)));
    bus.emit({ t: "confirmed", key: key(1), proofUrl: "arkiv/1" });
    await pub.idle();
    expect(sent).toEqual([{ ens: "gemini.otter.supabrain.eth", key: key(1) }]);
    expect(events.some((e) => e.t === "head" && e.head.key === key(1))).toBe(true);
    expect(pub.list()[0]).toMatchObject({ agent: "gemini", key: key(1), txUrl: "tx/0001" });
  });

  it("a burst of checkpoints publishes only the newest one after the in-flight write", async () => {
    const { graph, bus, sent, pub } = setup(20);
    for (const n of [1, 2, 3]) { graph.upsert(cp(key(n))); bus.emit({ t: "confirmed", key: key(n), proofUrl: "x" }); }
    await pub.idle();
    expect(sent.map((s) => s.key)).toEqual([key(1), key(3)]);
  });

  it("stopped (quarantined) checkpoints, tasks and files never become a head", async () => {
    const { graph, bus, sent, pub } = setup();
    graph.upsert(cp(key(1)));
    graph.applyRevocation({ type: "memory", id: key(1) });
    graph.upsert(cp(key(2), "gemini", "task"));
    for (const n of [1, 2]) bus.emit({ t: "confirmed", key: key(n), proofUrl: "x" });
    await pub.idle();
    expect(sent).toEqual([]);
  });
});
