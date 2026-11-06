"use client";
// The hero (UI_REDESIGN_PROMPT.md §5.7): one lane per AI as a big sticky column header, one 88px row per event, one
// line of text per node in an aligned column on the right (like `git log --graph`), a thick labelled "continue" curve
// for a handoff, a red ring + caption for a stop, a red square + caption for a block, a yellow ring for HEAD on ENS.
// Particles run only along an edge that just changed. Arrow keys move between rows, Enter opens the side panel.
import { useEffect, useMemo, useRef, useState } from "react";
import type { BlockedEntry, Vendor } from "@supabrain/shared";
import type { GraphNode, LiveAgent, RuleRow } from "@/lib/api";
import type { Cascade } from "@/lib/store";
import { blockLabel, clock, GUARD_RULES, vendorOf } from "@/lib/format";

export interface Lane { id: string; ens: string; vendor: Vendor; count: number; on?: boolean; pulse?: boolean; agent?: LiveAgent; rule?: RuleRow; headOk?: boolean }
type Row =
  | { kind: "node"; at: number; n: GraphNode; files: number; tasks: number; stopRule?: string }
  | { kind: "block"; at: number; b: BlockedEntry };

interface Props {
  nodes: GraphNode[];
  blocked: BlockedEntry[];
  lanes: Lane[];
  heads: Record<string, string | undefined>;
  selected?: string;
  hot?: Set<string>;
  recent: Record<string, number>;
  cascade?: Cascade;
  newestFirst?: boolean;
  fit?: boolean;
  onSelect: (key: string) => void;
  onLane: (lane: string, rect: DOMRect) => void;
}

const COLOR: Record<string, string> = { claude: "var(--vc)", gemini: "var(--vg)", openai: "var(--vo)", human: "var(--vh)" };
const HEADER = 92;

function caption(r: Row): string {
  if (r.kind === "block") {
    const why = r.b.code === "SCOPE" ? /not "([^"]+)"/.exec(r.b.message)?.[1] : undefined;
    return `${blockLabel(r.b.code, r.b.rule)}${why ? ` · tried ${why}` : ""}`;
  }
  const n = r.n;
  if (n.status === "quarantined") return r.stopRule ? `Stopped · ${GUARD_RULES[r.stopRule] ?? r.stopRule}` : n.kind === "checkpoint" ? "Stopped · kept for review, no AI receives it" : `Stopped · ${n.kind} inside a stopped commit`;
  const t = (n.text || n.file?.path || n.kind).replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 59)}…` : t;
}

export function LiveGraph({ nodes, blocked, lanes, heads, selected, hot, recent, cascade, newestFirst, fit, onSelect, onLane }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(1100);
  const [vh, setVh] = useState(700);
  const [tip, setTip] = useState<{ x: number; y: number; r: Row }>();
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => { setW(Math.max(320, Math.floor(e.contentRect.width))); setVh(window.innerHeight); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = W < 720;
  const rows: Row[] = useMemo(() => {
    const count: Record<string, { files: number; tasks: number }> = {};
    for (const n of nodes) if (n.kind === "file" || n.kind === "task") for (const p of n.parents) { const c = (count[p] ??= { files: 0, tasks: 0 }); if (n.kind === "file") c.files++; else c.tasks++; }
    const stopRule: Record<string, string> = {};
    for (const b of blocked) if (b.code === "STOPPED" && b.key && b.rule) stopRule[b.key] = b.rule;
    const r: Row[] = nodes.filter((n) => n.kind !== "file" && n.kind !== "task").map((n) => ({ kind: "node", at: n.createdAt, n, files: count[n.key]?.files ?? 0, tasks: count[n.key]?.tasks ?? 0, stopRule: stopRule[n.key] }));
    for (const b of blocked) if (b.code !== "STOPPED") r.push({ kind: "block", at: b.at, b }); // a stop is drawn on its saved node
    r.sort((a, b) => a.at - b.at || (a.kind === "node" && b.kind === "node" ? a.n.seq - b.n.seq : 0));
    return newestFirst ? r.reverse() : r;
  }, [nodes, blocked, newestFirst]);

  // Geometry: lanes on the left (≥ 220px apart on desktop), the text column to their right.
  const padL = narrow ? 28 : 56;
  const gap = lanes.length > 1 ? (narrow ? Math.max(44, Math.min(90, (W * 0.42) / (lanes.length - 1))) : Math.max(150, Math.min(240, (W * 0.5) / (lanes.length - 1)))) : 0;
  const laneX = useMemo(() => Object.fromEntries(lanes.map((l, i) => [l.id, padL + i * gap])), [lanes, padL, gap]);
  const textX = padL + Math.max(0, lanes.length - 1) * gap + (narrow ? 30 : 64);
  const maxCh = Math.max(14, Math.floor((W - textX - 12) / 8.6));
  const fitText = (t: string) => (t.length > maxCh ? `${t.slice(0, maxCh - 1)}…` : t);
  const ROW = fit ? Math.max(40, Math.min(88, Math.floor((vh - 320) / Math.max(1, rows.length)))) : narrow ? 72 : 88;
  const TOP = ROW / 2 + 22;
  const H = TOP + Math.max(1, rows.length) * ROW;
  const y = (i: number) => TOP + i * ROW;

  const pos = useMemo(() => {
    const m: Record<string, { x: number; y: number; i: number }> = {};
    rows.forEach((r, i) => { if (r.kind === "node") m[r.n.key] = { x: laneX[r.n.agent] ?? padL, y: TOP + i * ROW, i }; });
    return m;
  }, [rows, laneX, padL, TOP, ROW]);
  const byKey = useMemo(() => Object.fromEntries(nodes.map((n) => [n.key, n])), [nodes]);
  const edges = rows.flatMap((r) => (r.kind === "node" ? r.n.parents.filter((p) => pos[p]).map((p) => ({ p, c: r.n.key })) : []));
  const now = Date.now();
  const casc = cascade && now - cascade.at < 6000 ? new Set(cascade.keys) : undefined;

  // Follow the newest row when something arrives.
  const prev = useRef(0);
  useEffect(() => {
    const sc = box.current?.closest(".lg4-scroll") as HTMLElement | null;
    if (sc && rows.length > prev.current && !newestFirst) sc.scrollTo({ top: sc.scrollHeight, behavior: prev.current ? "smooth" : "auto" });
    prev.current = rows.length;
  }, [rows.length, newestFirst]);

  // Keyboard: arrows move between rows, Enter opens.
  const order = rows.filter((r): r is Extract<Row, { kind: "node" }> => r.kind === "node").map((r) => r.n.key);
  const onKey = (e: React.KeyboardEvent) => {
    if (!order.length) return;
    const i = selected ? order.indexOf(selected as `0x${string}`) : -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); onSelect(order[Math.min(order.length - 1, i + 1)]!); }
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); onSelect(order[Math.max(0, i - 1)]!); }
  };

  return (
    <div ref={box} className="lg4" onKeyDown={onKey} onMouseLeave={() => setTip(undefined)}>
      <div className="lg4-heads" style={{ height: HEADER }}>
        {lanes.map((l) => {
          const v = vendorOf(l.vendor);
          const status = l.agent ? (l.agent.authority === "unavailable" || l.agent.status === "unknown" ? "Authority unknown" : l.agent.status === "active" ? "Active" : l.agent.status === "paused" ? "Paused" : l.agent.status) : l.id === "owner" ? "Person" : "";
          const scope = l.rule?.scope ?? l.agent?.scope;
          return (
            <button key={l.id} className={`lane-h${l.pulse ? " pulse" : ""}${l.agent && l.agent.status !== "active" ? " off" : ""}`} style={{ left: Math.max(0, (laneX[l.id] ?? 0) - 22), borderBottomColor: COLOR[l.vendor] }}
              onClick={(e) => onLane(l.id, (e.currentTarget as HTMLElement).getBoundingClientRect())} aria-label={`${l.ens}: ${status}. Show rules`}>
              <span className="lh-top"><i className={`dot4 ${v.cls}`} /><b>{narrow ? (l.id === "owner" ? "H" : v.letter) : l.id === "owner" ? "Owner" : v.name}</b>{l.on && !narrow && <span className="live-pill">CONNECTED</span>}</span>
              {!narrow && <span className="lh-sub">{status}{scope ? ` · ${scope === "*" ? "writes anywhere" : `only ${scope}`}` : ""}</span>}
            </button>
          );
        })}
      </div>
      <svg className="lg4-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Commit graph: one column per AI, one row per event in time order">
        {lanes.map((l) => <line key={l.id} className="lane4" x1={laneX[l.id]} x2={laneX[l.id]} y1={0} y2={H} />)}
        {edges.map(({ p, c }) => {
          const a = pos[p]!, b = pos[c]!;
          const pn = byKey[p], cn = byKey[c];
          const q = pn?.status === "quarantined" || cn?.status === "quarantined";
          const hand = !q && pn?.kind === "checkpoint" && cn?.kind === "checkpoint" && pn.agent !== cn.agent;
          const isHot = hot?.has(p) && hot?.has(c);
          let d: string;
          if (Math.abs(a.x - b.x) < 1) d = `M${a.x},${a.y} L${b.x},${b.y}`;
          else { const m = (a.y + b.y) / 2; d = `M${a.x},${a.y} C${a.x},${m} ${b.x},${m} ${b.x},${b.y}`; }
          const fresh = !q && (recent[c] ?? 0) > now - 4500;
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          return (
            <g key={`${p}>${c}`}>
              <path className={`edge4${q ? " q" : ""}${hand ? " hand" : ""}${isHot ? " hot" : ""}`} d={d} />
              {fresh && <circle r={hand ? 5 : 4} className="pd4" style={{ fill: COLOR[cn?.vendor ?? "human"] }}><animateMotion dur="1.1s" repeatCount="2" path={d} /></circle>}
              {hand && !narrow && (
                <g className="hand-tag"><rect x={mx - 46} y={my - 14} width={92} height={28} rx={14} /><text x={mx} y={my + 5} textAnchor="middle">continue</text></g>
              )}
            </g>
          );
        })}
        {rows.map((r, i) => {
          const yy = y(i);
          const cap = fitText(caption(r));
          const isSel = r.kind === "node" && r.n.key === selected;
          if (r.kind === "block") {
            const x = laneX[r.b.agent] ?? padL;
            return (
              <g key={`b${r.at}${i}`} className="row4 blocked" onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, r })}>
                <line className="leader" x1={x + 14} x2={textX - 12} y1={yy} y2={yy} />
                <rect x={x - 11} y={yy - 11} width={22} height={22} rx={4} className="blk4" />
                <path className="xmark" d={`M${x - 5},${yy - 5}L${x + 5},${yy + 5}M${x + 5},${yy - 5}L${x - 5},${yy + 5}`} />
                <text className="lb4 bad" x={textX} y={yy + 6}>{cap}</text>
              </g>
            );
          }
          const n = r.n;
          const p = pos[n.key]!;
          const q = n.status === "quarantined";
          const head = !q && heads[n.agent] === n.key;
          const isCp = n.kind === "checkpoint";
          const color = COLOR[n.vendor] ?? "var(--fg)";
          const fresh = (recent[n.key] ?? 0) > now - 4500;
          const count = r.files + r.tasks;
          const mark = q ? "STOPPED" : n.status === "expired" ? "EXPIRED" : n.pending ? "SAVING" : head ? "HEAD" : "";
          const cls = ["row4", isCp ? "cp" : "note", q ? "q" : "", n.pending ? "pending" : "", n.status === "expired" ? "expired" : "", isSel ? "sel" : "", hot && !hot.has(n.key) ? "fade" : "", fresh ? "fresh" : ""].filter(Boolean).join(" ");
          return (
            <g key={n.key} className={cls} tabIndex={0} role="button" aria-label={`${cap}. ${vendorOf(n.vendor).name}. ${mark || "saved"}. ${clock(n.createdAt)}`}
              onClick={() => onSelect(n.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(n.key); } }}
              onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, r })} onMouseLeave={() => setTip(undefined)}>
              <rect className="hit" x={0} y={yy - ROW / 2} width={W} height={ROW} />
              <line className="leader" x1={p.x + 16} x2={textX - 12} y1={yy} y2={yy} />
              {head && <circle className="head4" cx={p.x} cy={yy} r={18} />}
              {casc?.has(n.key) && <circle className="rip4" cx={p.x} cy={yy} r={12}><animate attributeName="r" from="12" to="120" dur="1.3s" fill="freeze" /><animate attributeName="opacity" from=".85" to="0" dur="1.3s" fill="freeze" /></circle>}
              {q ? (
                <>
                  <circle className="qring" cx={p.x} cy={yy} r={12} />
                  <path className="xmark q" d={`M${p.x - 5},${yy - 5}L${p.x + 5},${yy + 5}M${p.x + 5},${yy - 5}L${p.x - 5},${yy + 5}`} />
                </>
              ) : isCp ? (
                <circle className="dot" cx={p.x} cy={yy} r={12} style={{ fill: n.pending ? "var(--bg)" : color, stroke: color }} />
              ) : (
                <circle className="dot hollow" cx={p.x} cy={yy} r={9} style={{ stroke: color }} />
              )}
              {count > 0 && !q && (
                <g className="badge4"><circle cx={p.x + 13} cy={yy - 12} r={9} /><text x={p.x + 13} y={yy - 8.5} textAnchor="middle">{count}</text></g>
              )}
              <text className={`lb4${q ? " bad" : ""}`} x={textX} y={yy + 6}>{cap}</text>
              {mark && mark !== "STOPPED" && <text className={`mk4 ${mark === "HEAD" ? "head" : ""}`} x={textX} y={yy + 28}>{mark === "HEAD" ? "HEAD ON ENS" : mark}</text>}
            </g>
          );
        })}
      </svg>
      {tip && <Hover tip={tip} box={box.current} />}
    </div>
  );
}

function Hover({ tip, box }: { tip: { x: number; y: number; r: Row }; box: HTMLDivElement | null }) {
  if (!box) return null;
  const b = box.getBoundingClientRect();
  const left = Math.min(b.width - 320, Math.max(8, tip.x - b.left + 18));
  const top = Math.max(8, tip.y - b.top + 16);
  const r = tip.r;
  return (
    <div className="hover4" style={{ left, top }} role="tooltip">
      {r.kind === "block" ? (
        <><b className="bad">{blockLabel(r.b.code, r.b.rule)}</b><p>{r.b.message}</p><span>{clock(r.b.at)} · nothing was written</span></>
      ) : (
        <><b>{vendorOf(r.n.vendor).name} · {r.n.kind}</b><p>{(r.n.text || r.n.file?.path || "").slice(0, 160)}</p><span>{clock(r.n.createdAt)} · click for proof and lineage</span></>
      )}
    </div>
  );
}
