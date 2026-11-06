"use client";
// Fig. 1, the hero: one swimlane per AI, one row per event in time order (newest at the bottom).
// Checkpoints are dots in the AI's colour; notes and evidence are smaller; tasks and files attach to their checkpoint.
// A stopped item is a hollow red ring with ✕; a blocked action (nothing was written) is a red square tick on its lane.
import { useEffect, useMemo, useRef, useState } from "react";
import type { BlockedEntry, Vendor } from "@supabrain/shared";
import type { GraphNode } from "@/lib/api";
import type { Cascade } from "@/lib/store";
import { blockLabel, clock, short, vendorOf } from "@/lib/format";

export interface Lane { id: string; ens: string; vendor: Vendor; count: number; on?: boolean; pulse?: boolean }
type Row =
  | { kind: "node"; at: number; n: GraphNode; files: GraphNode[]; tasks: GraphNode[] }
  | { kind: "block"; at: number; b: BlockedEntry };

interface Props {
  nodes: GraphNode[];
  blocked: BlockedEntry[];
  lanes: Lane[];
  heads: Record<string, string | undefined>; // agent → the Arkiv key its ENS name points at
  selected?: string;
  hot?: Set<string>;
  cascade?: Cascade;
  onSelect: (key: string) => void;
}

const HEAD_H = 56, ROW = 64, TOP = 24, TIMECOL = 64;
const LANE_COLOR: Record<string, string> = { claude: "var(--vc)", gemini: "var(--vg)", openai: "var(--vo)", human: "var(--vh)" };

export function CommitGraph({ nodes, blocked, lanes, heads, selected, hot, cascade, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(900);
  const [tip, setTip] = useState<{ x: number; y: number; row: Row } | undefined>();
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = W < 640;
  const tcol = narrow ? 0 : TIMECOL;
  const padL = tcol + (narrow ? 22 : 34);
  const labelRoom = narrow ? 0 : Math.min(420, W * 0.42);
  const gap = lanes.length > 1 ? (narrow ? Math.max(48, (W - padL - 40) / (lanes.length - 1)) : Math.max(96, Math.min(210, (W - padL - 30 - labelRoom) / (lanes.length - 1)))) : 0;
  const laneX = useMemo(() => Object.fromEntries(lanes.map((l, i) => [l.id, padL + i * gap])), [lanes, padL, gap]);

  const rows: Row[] = useMemo(() => {
    const attach: Record<string, { files: GraphNode[]; tasks: GraphNode[] }> = {};
    for (const n of nodes) if (n.kind === "file" || n.kind === "task") for (const p of n.parents) (attach[p] ??= { files: [], tasks: [] })[n.kind === "file" ? "files" : "tasks"].push(n);
    const r: Row[] = nodes.filter((n) => n.kind !== "file" && n.kind !== "task").map((n) => ({ kind: "node", at: n.createdAt, n, files: attach[n.key]?.files ?? [], tasks: attach[n.key]?.tasks ?? [] }));
    for (const b of blocked) if (!b.key || !nodes.some((n) => n.key === b.key)) r.push({ kind: "block", at: b.at, b });
    return r.sort((a, b) => a.at - b.at || (a.kind === "node" && b.kind === "node" ? a.n.seq - b.n.seq : 0));
  }, [nodes, blocked]);

  const pos = useMemo(() => {
    const m: Record<string, { x: number; y: number }> = {};
    rows.forEach((r, i) => { if (r.kind === "node") m[r.n.key] = { x: laneX[r.n.agent] ?? padL, y: TOP + i * ROW }; });
    return m;
  }, [rows, laneX, padL]);
  const H = TOP + Math.max(1, rows.length) * ROW + 24;

  // Keep the newest row in view when something arrives.
  const prevLen = useRef(0);
  useEffect(() => {
    const scroller = box.current?.parentElement;
    if (scroller && rows.length > prevLen.current) scroller.scrollTo({ top: scroller.scrollHeight, behavior: prevLen.current ? "smooth" : "auto" });
    prevLen.current = rows.length;
  }, [rows.length]);

  const byKey = useMemo(() => Object.fromEntries(nodes.map((n) => [n.key, n])), [nodes]);
  const shown = useMemo(() => new Set(Object.keys(pos)), [pos]);
  const edges = rows.flatMap((r) => (r.kind === "node" ? r.n.parents.filter((p) => shown.has(p)).map((p) => ({ p, c: r.n.key })) : []));
  const handoff = edges.find(({ p, c }) => byKey[p]?.kind === "checkpoint" && byKey[c]?.kind === "checkpoint" && byKey[p].agent !== byKey[c].agent);
  const casc = cascade && Date.now() - cascade.at < 6000 ? new Set(cascade.keys) : undefined;

  return (
    <div ref={box} className="cg" style={{ position: "relative", minWidth: 0 }} onMouseLeave={() => setTip(undefined)}>
      <div className="cg-heads" style={{ height: HEAD_H }}>
        {!narrow && <span className="mono tiny dim" style={{ position: "absolute", left: 8, top: 22 }}>TIME</span>}
        {lanes.map((l) => {
          const v = vendorOf(l.vendor);
          return (
            <div key={l.id} className={`cg-pill${l.on ? " on" : ""}${l.pulse ? " pulse" : ""}`} title={l.ens} style={{ left: Math.max(4, laneX[l.id] - 14) }}>
              <span className={`vb ${v.cls}`}>{v.letter}</span>
              {!narrow && <span>{l.id}</span>}
              <span className="dim">{l.count}</span>
              {l.on && <span className="dot ok" title="connected now" />}
            </div>
          );
        })}
      </div>
      <svg className="lg-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Commit graph: one column per AI, one row per event in time order">
        <defs>
          <filter id="sbglow" x="-300%" y="-300%" width="700%" height="700%"><feGaussianBlur stdDeviation="3.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {lanes.map((l) => <line key={l.id} className={`lane${l.pulse ? " pulse" : ""}`} x1={laneX[l.id]} x2={laneX[l.id]} y1={0} y2={H} />)}
        {!narrow && rows.map((r, i) => <text key={`t${i}`} className="tick" x={8} y={TOP + i * ROW + 4}>{clock(r.at)}</text>)}

        {edges.map(({ p, c }) => {
          const a = pos[p], b = pos[c];
          const pn = byKey[p], cn = byKey[c];
          const q = pn?.status === "quarantined" || cn?.status === "quarantined";
          const isHot = hot?.has(p) && hot?.has(c);
          let d: string;
          if (Math.abs(a.x - b.x) < 1) { const bend = b.y - a.y > ROW + 1 ? 30 : 0; d = `M${a.x},${a.y} C${a.x - bend},${a.y + 22} ${b.x - bend},${b.y - 22} ${b.x},${b.y}`; }
          else { const m = (a.y + b.y) / 2; d = `M${a.x},${a.y} C${a.x},${m} ${b.x},${m} ${b.x},${b.y}`; }
          const dur = 2.2 + Math.hypot(b.x - a.x, b.y - a.y) / 140;
          const isHand = handoff && handoff.p === p && handoff.c === c;
          return (
            <g key={`${p}>${c}`}>
              <path className={`edge${q ? " q" : ""}${isHot ? " hot" : ""}`} d={d} style={{ stroke: q || isHot ? undefined : `color-mix(in srgb, ${LANE_COLOR[cn?.vendor ?? "human"]} 55%, var(--line2))` }} />
              {!q && cn?.status !== "expired" && (
                <circle r={isHot ? 2.8 : 2.1} className={`pd${isHot ? " hot" : ""}`} style={{ fill: isHot ? undefined : LANE_COLOR[cn?.vendor ?? "human"] }} filter="url(#sbglow)">
                  <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={d} />
                  <animate attributeName="opacity" values="0;1;1;0" dur={`${dur}s`} repeatCount="indefinite" />
                </circle>
              )}
              {isHand && (
                <g className="tag ok">
                  <rect x={(a.x + b.x) / 2 - 34} y={(a.y + b.y) / 2 - 9} width={68} height={18} rx={9} />
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 + 3.5} textAnchor="middle">continue</text>
                </g>
              )}
            </g>
          );
        })}

        {rows.map((r, i) => {
          const y = TOP + i * ROW;
          if (r.kind === "block") {
            const x = laneX[r.b.agent] ?? padL;
            const label = blockLabel(r.b.code, r.b.rule);
            const lx = x + 16;
            return (
              <g key={`b${r.at}${i}`} className="node blockrow" onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, row: r })}>
                <rect x={x - 6} y={y - 6} width={12} height={12} rx={2} className="blk" />
                <path className="x" style={{ opacity: 1, stroke: "var(--lie-on)" }} d={`M${x - 3},${y - 3}L${x + 3},${y + 3}M${x + 3},${y - 3}L${x - 3},${y + 3}`} />
                <g className="tag bad"><rect x={lx} y={y - 8} width={label.length * 6.1 + 12} height={16} rx={4} /><text x={lx + (label.length * 6.1 + 12) / 2} y={y + 3.2} textAnchor="middle">{label}</text></g>
                {!narrow && <text className="meta" x={lx} y={y + 21}>{r.b.ens ?? r.b.agent} · nothing was written · {r.b.tool}</text>}
              </g>
            );
          }
          const n = r.n;
          const { x } = pos[n.key];
          const q = n.status === "quarantined";
          const isHead = heads[n.agent] === n.key;
          const isCp = n.kind === "checkpoint";
          const color = LANE_COLOR[n.vendor] ?? "var(--fg)";
          const right = !narrow || x < W / 2;
          const avail = right ? W - x - 30 : x - 30;
          const maxCh = Math.max(12, Math.floor(avail / 7.2));
          const raw = n.text.replace(/\s+/g, " ").trim() || n.kind;
          const label = raw.length > maxCh ? raw.slice(0, maxCh - 1) + "…" : raw;
          const lx = right ? x + 16 : x - 16;
          const anchor = right ? "start" : "end";
          const tags: { t: string; c: string }[] = [];
          if (q) tags.push({ t: "STOPPED", c: "bad" });
          else if (n.status === "expired") tags.push({ t: "EXPIRED", c: "mut" });
          else if (n.pending) tags.push({ t: "SAVING", c: "mut" });
          if (isHead && !q) tags.push({ t: "HEAD", c: "warn" });
          if (!isCp) tags.push({ t: n.kind.toUpperCase(), c: "mut" });
          let tx = lx;
          const tagEls = tags.map((t) => { const w = t.t.length * 6.1 + 12; const gx = right ? tx : tx - w; tx = right ? tx + w + 5 : tx - w - 5; return <g key={t.t} className={`tag ${t.c}`}><rect x={gx} y={y + 9} width={w} height={15} rx={4} /><text x={gx + w / 2} y={y + 19.6} textAnchor="middle">{t.t}</text></g>; });
          const attach = [r.files.length ? `▤ ${r.files.length} file${r.files.length > 1 ? "s" : ""}` : "", r.tasks.length ? `☐ ${r.tasks.length} task${r.tasks.length > 1 ? "s" : ""}` : "", n.checkpoint?.done?.length ? `✓ ${n.checkpoint.done.length} done` : ""].filter(Boolean).join(" · ");
          const client = n.checkpoint?.client;
          const meta = `T${n.trust}${client ? ` · ${client === "supabrain-lab" ? "LAB" : client}` : ""}${attach ? ` · ${attach}` : ""}${n.source ? ` · ${n.source.id}` : ""}`;
          const cls = ["node", isCp ? "cp" : "note", n.trust === 1 ? "t1" : "", q ? "q" : "", n.status === "expired" ? "expired" : "", n.pending ? "pending" : "", selected === n.key ? "selected" : "", hot && !hot.has(n.key) ? "fade" : "", casc?.has(n.key) ? "hit" : ""].filter(Boolean).join(" ");
          return (
            <g key={n.key} className={cls} tabIndex={0} role="button"
              aria-label={`${n.text || n.kind}. By ${n.agent}. ${tags.map((t) => t.t).join(", ")}`}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
              onClick={() => onSelect(n.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(n.key); } }}
              onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, row: r })} onMouseLeave={() => setTip(undefined)}>
              <rect x={Math.min(x, lx) - 12} y={y - 16} width={Math.abs(lx - x) + Math.min(avail, label.length * 7.3) + 24} height={44} fill="transparent" />
              <circle className="sel" cx={x} cy={y} r={13} />
              {isHead && !q && <circle className="headring" cx={x} cy={y} r={11} />}
              {casc?.has(n.key) && <circle className="rip" cx={x} cy={y} r={6}><animate attributeName="r" from="6" to="140" dur="1.4s" fill="freeze" /><animate attributeName="opacity" from="0.9" to="0" dur="1.4s" fill="freeze" /></circle>}
              <circle className="d" cx={x} cy={y} r={isCp ? 6.5 : 4.5} style={q ? undefined : n.trust === 1 ? { stroke: color } : { fill: color, stroke: color }} />
              <path className="x" d={`M${x - 3.2},${y - 3.2}L${x + 3.2},${y + 3.2}M${x + 3.2},${y - 3.2}L${x - 3.2},${y + 3.2}`} />
              <text className="lb" x={lx} y={y + 4.5} textAnchor={anchor}>{label}</text>
              {tagEls}
              {!narrow && <text className="meta" x={tx + (right ? 2 : -2)} y={y + 20} textAnchor={anchor}>{meta}</text>}
            </g>
          );
        })}
      </svg>
      {tip && <HoverCard tip={tip} box={box.current} />}
    </div>
  );
}

function HoverCard({ tip, box }: { tip: { x: number; y: number; row: Row }; box: HTMLDivElement | null }) {
  if (!box) return null;
  const r = box.getBoundingClientRect();
  const left = Math.min(r.width - 290, Math.max(8, tip.x - r.left + 18));
  const top = Math.max(8, tip.y - r.top + 14);
  const row = tip.row;
  return (
    <div className="hovercard" style={{ left, top }}>
      {row.kind === "block" ? (
        <>
          <b style={{ color: "var(--lie)" }}>{blockLabel(row.b.code, row.b.rule)}</b>
          <div className="small">{row.b.message}</div>
          <div className="m">{row.b.ens ?? row.b.agent} · {row.b.tool} · {clock(row.b.at)}</div>
          <div className="m">Nothing was written. Logged as an event.</div>
        </>
      ) : (
        <>
          <b>{row.n.kind === "checkpoint" ? row.n.text : `${row.n.kind}: ${row.n.text.slice(0, 120)}`}</b>
          {row.n.checkpoint?.next && <div className="small muted">next: {row.n.checkpoint.next}</div>}
          <div className="m">{row.n.agent} · signer {short(row.n.creator, 8, 6) || "—"}</div>
          <div className="m">T{row.n.trust} · {row.n.parents.length} parent{row.n.parents.length === 1 ? "" : "s"}{row.n.checkpoint?.client ? ` · ${row.n.checkpoint.client}` : ""}</div>
          <div className="m">{row.n.status === "quarantined" ? "STOPPED: no AI receives this" : row.n.pending ? "writing to Arkiv…" : "on Arkiv · click for proof and lineage"}</div>
        </>
      )}
    </div>
  );
}
