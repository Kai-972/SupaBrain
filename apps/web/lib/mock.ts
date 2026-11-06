"use client";
// ?mock=1 only (CLAUDE.md §2.1): replays fixtures/v2-demo.json through the same applyEvent the live stream uses.
// Every page shows a MOCK DATA banner while this runs. The lab refuses to run in mock mode.
import type { BlockedEntry, StreamEvent } from "@supabrain/shared";
import fx from "../fixtures/v2-demo.json";
import type { BrainView, GraphNode, HeadRow, Health, Registry, RulesResponse } from "./api";
import { applyEvent, setState } from "./store";

export function startMock() {
  const nodes = (fx.graph.nodes as unknown as GraphNode[]).slice().sort((a, b) => a.seq - b.seq);
  setState({
    mode: "mock", conn: "mock", loaded: true, admin: false,
    health: fx.health as unknown as Health,
    brain: fx.brain as unknown as BrainView,
    rules: fx.rules as unknown as RulesResponse,
    heads: fx.heads as unknown as HeadRow[],
    registry: fx.registry as unknown as Registry,
    checkpoints: fx.checkpoints as never, tasks: fx.tasks as never, files: fx.files as never,
  });
  const base = Date.now() - nodes.length * 1000;
  let t = 250;
  const blocked = fx.blocked as unknown as BlockedEntry[];
  nodes.forEach((n, i) => {
    setTimeout(() => applyEvent({ t: "memory", node: { ...n, createdAt: base + i * 1000, pending: false }, edges: [] } as StreamEvent, { animate: true }), t);
    t += 650;
    const stop = blocked.find((b) => b.key === n.key);
    if (stop) { const at = t; setTimeout(() => applyEvent({ t: "blocked", block: { ...stop, at: Date.now() } }, { animate: true }), at); t += 650; }
  });
  for (const b of blocked.filter((x) => !x.key)) { const at = t; setTimeout(() => applyEvent({ t: "blocked", block: { ...b, at: Date.now() } }, { animate: true }), at); t += 650; }
}
