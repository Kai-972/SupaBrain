import { describe, expect, it } from "vitest";
import type { MemoryNode, StreamEvent } from "@supabrain/shared";
import { MemoryGraph } from "../engine/graph";
import { EventBus } from "../events";
import type { MemoryStore, StoreWatchHandlers } from "./store";
import { startSync } from "./sync";

let now = 1_800_000_000_000;
const node = (key: string, o: Partial<MemoryNode> = {}): MemoryNode => ({
  key: key as `0x${string}`, text: key, kind: "fact", folder: "f", trust: 2, agent: "lead-claude", vendor: "claude",
  seq: Number.parseInt(key.slice(2), 16), createdAt: now, expiresAt: now + 60_000, parents: [], roots: [], status: "active", ...o,
});

function fakeStore(initial: MemoryNode[], revs: { type: "source"; id: string }[] = []) {
  const calls: string[] = [];
  let handlers: StoreWatchHandlers | undefined;
  const store = {
    walletOf: () => undefined, entityUrl: (k: string) => k, writeMemory: async () => { throw new Error("n/a"); },
    async loadAll() { calls.push("load"); return { memories: initial, revocations: revs, notices: [] }; },
    writeRevocation: async () => { throw new Error("n/a"); }, writeNotices: async () => { throw new Error("n/a"); }, extendMemory: async () => { throw new Error("n/a"); },
    watch(h: StoreWatchHandlers) { calls.push("watch"); handlers = h; return () => { calls.push("unwatch"); }; },
  } satisfies MemoryStore;
  return { store, calls, fire: () => handlers! };
}

describe("startSync", () => {
  it("starts the watcher BEFORE loading (the chain serves no history), then rebuilds the graph", async () => {
    const { store, calls } = fakeStore([node("0x1"), node("0x2", { parents: ["0x1"] })], [{ type: "source", id: "email:x" }]);
    const graph = new MemoryGraph(() => now);
    const s = startSync({ store, graph, bus: new EventBus(), now: () => now, tickMs: 0 });
    expect(await s.ready).toEqual({ memories: 2, revocations: 1 });
    expect(calls).toEqual(["watch", "load"]);
    expect(graph.all().map((n) => n.key)).toEqual(["0x1", "0x2"]);
    expect(graph.isRevoked({ type: "source", id: "email:x" })).toBe(true);
    expect(graph.nextSeq()).toBe(3);
    s.stop();
  });

  it("adds memories written by others (another server, a script) and announces them; ignores ones it already has", async () => {
    const { store, fire } = fakeStore([node("0x1")]);
    const graph = new MemoryGraph(() => now);
    const bus = new EventBus();
    const events: StreamEvent[] = [];
    bus.subscribe((e) => events.push(e.event));
    const s = startSync({ store, graph, bus, now: () => now, tickMs: 0 });
    await s.ready;
    fire().onMemory(node("0x1"));
    fire().onMemory(node("0x5", { parents: ["0x1"] }));
    expect(events.map((e) => e.t)).toEqual(["memory"]);
    expect(graph.get("0x5")?.parents).toEqual(["0x1"]);
    fire().onExtended("0x5", now + 999_999);
    expect(graph.get("0x5")?.expiresAt).toBe(now + 999_999);
    expect(events.at(-1)).toEqual({ t: "kept", key: "0x5", expiresAt: now + 999_999 });
    fire().onRevocation({ type: "agent", id: "lead-claude" });
    expect(graph.status("0x5")).toBe("quarantined");
    s.stop();
  });

  it("a pending memory seen by the watcher is confirmed", async () => {
    const { store, fire } = fakeStore([]);
    const graph = new MemoryGraph(() => now);
    graph.upsert(node("0x9", { pending: true }));
    const s = startSync({ store, graph, bus: new EventBus(), now: () => now, tickMs: 0 });
    await s.ready;
    fire().onMemory(node("0x9", { proofUrl: "https://x/entity/0x9" }));
    expect(graph.get("0x9")).toMatchObject({ pending: false });
    s.stop();
  });

  it("restarts the watcher and reconciles after repeated errors (it cannot recover on its own)", async () => {
    const { store, calls, fire } = fakeStore([node("0x1")]);
    const s = startSync({ store, graph: new MemoryGraph(() => now), bus: new EventBus(), now: () => now, tickMs: 0, maxWatchErrors: 2 });
    await s.ready;
    fire().onError(new Error("segment_range_of"));
    fire().onError(new Error("segment_range_of"));
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toEqual(["watch", "load", "unwatch", "watch", "load"]);
    s.stop();
  });

  it("the expiry ticker announces each expired memory once (Arkiv emits no expiry event)", async () => {
    const { store } = fakeStore([node("0x1", { expiresAt: now + 1000 })]);
    const graph = new MemoryGraph(() => now);
    const bus = new EventBus();
    const events: StreamEvent[] = [];
    bus.subscribe((e) => events.push(e.event));
    const s = startSync({ store, graph, bus, now: () => now, tickMs: 0 });
    await s.ready;
    s.tick();
    expect(events).toEqual([]);
    now += 2000;
    s.tick();
    s.tick();
    expect(events).toEqual([{ t: "expired", key: "0x1" }]);
    s.stop();
  });
});
