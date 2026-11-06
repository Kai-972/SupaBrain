"use client";
// The hero: one swimlane per author (people + each AI), one row per memory in write order, parent → child curves.
// One node per row means labels never collide, at any width. Every encoding also has a text tag.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Vendor } from "@supabrain/shared";
import type { GraphNode } from "@/lib/api";
import type { Cascade } from "@/lib/store";
import { vendorOf, TRUST, ago, SOURCE_ICON } from "@/lib/format";

export interface Lane { id: string; label: string; sub: string; vendor: Vendor; count: number; on?: boolean }
interface Props {
  nodes: GraphNode[];
  lanes: Lane[];
  selected?: string;
  focus?: Set<string>;   // dim everything else
  hot?: string[][];      // lineage paths to draw in amber ("why does my AI believe this?")
  blast?: Set<string>;   // dry-run preview, drawn red before anything changes
  cascade?: Cascade;
  onSelect: (key: string) => void;
}

const HEAD = 58, ROW = 66, TOP = 26;

function tagsFor(n: GraphNode, cascading: boolean): { t: string; c: "bad" | "warn" | "ok" | "mut" }[] {
  const out: { t: string; c: "bad" | "warn" | "ok" | "mut" }[] = [];
  const q = n.status === "quarantined" || cascading;
  if (q) out.push({ t: "QUARANTINED", c: "bad" });
  else if (n.dispute?.state === "disputed") out.push({ t: "DISPUTED BY ENS", c: "warn" });
  else if (n.dispute?.state === "unverified") out.push({ t: "UNVERIFIED", c: "mut" });
  if (n.status === "stale") out.push({ t: "STALE", c: "warn" });
  if (n.status === "expired") out.push({ t: "EXPIRED", c: "mut" });
  if (n.pending) out.push({ t: "WRITING TO ARKIV…", c: "mut" });
  if (n.kept && !q) out.push({ t: "KEPT", c: "ok" });
  if (n.ref) out.push({ t: "PRIVATE", c: "mut" });
  return out;
}

export function LineageGraph({ nodes, lanes, selected, focus, hot, blast, cascade, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(900);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = W < 640;
  const padL = narrow ? 22 : 44;
  const labelRoom = narrow ? 0 : Math.min(380, W * 0.38);
  const gap = lanes.length > 1 ? (narrow ? Math.max(48, (W - padL - 40) / (lanes.length - 1)) : Math.max(90, Math.min(200, (W - padL * 2 - labelRoom) / (lanes.length - 1)))) : 0;
  const laneX = useMemo(() => Object.fromEntries(lanes.map((l, i) => [l.id, padL + i * gap])), [lanes, padL, gap]);

  const ordered = useMemo(() => [...nodes].sort((a, b) => a.seq - b.seq), [nodes]);
  const pos = useMemo(() => {
    const m: Record<string, { x: number; y: number }> = {};
    ordered.forEach((n, i) => { m[n.key] = { x: laneX[n.agent] ?? padL, y: TOP + i * ROW }; });
    return m;
  }, [ordered, laneX, padL]);
  const H = TOP + Math.max(1, ordered.length) * ROW + 20;

  const hotEdges = useMemo(() => {
    const s = new Set<string>();
    for (const p of hot ?? []) for (let i = 0; i < p.length - 1; i++) { s.add(`${p[i + 1]}>${p[i]}`); s.add(`${p[i]}>${p[i + 1]}`); }
    return s;
  }, [hot]);
  const hotNodes = useMemo(() => new Set((hot ?? []).flat()), [hot]);
  const casc = cascade && Date.now() - cascade.at < 6000 ? cascade : undefined;
  const cascSet = useMemo(() => new Set(casc?.affected ?? []), [casc]);

  const edges = ordered.flatMap((n) => n.parents.filter((p) => pos[p]).map((p) => ({ p, c: n.key })));

  return (
    <div ref={box} style={{ position: "relative", minWidth: 0 }}>
      {/* lane heads stay visible while scrolling */}
      <div style={{ position: "sticky", top: 0, zIndex: 3, height: HEAD, background: "linear-gradient(var(--bg) 70%, transparent)" }}>
        {lanes.map((l) => {
          const x = laneX[l.id];
          const v = vendorOf(l.vendor);
          const right = !narrow || x < W / 2;
          return (
            <div key={l.id} title={`${l.label} · ${l.sub}`} style={{ position: "absolute", top: 14, ...(narrow ? { left: x - 14 } : right ? { left: Math.max(4, x - 14) } : { right: Math.max(4, W - x - 14) }), display: "flex", alignItems: "center", gap: 7, height: 28, padding: "0 10px 0 4px", borderRadius: 999, background: "var(--panel3)", border: `1px solid ${l.on ? "var(--flow)" : "var(--line2)"}`, font: "500 .74rem var(--mono)", whiteSpace: "nowrap", boxShadow: l.on ? "0 0 16px var(--flow-soft)" : undefined }}>
              <span className={`vb ${v.cls}`}>{v.letter}</span>
              {!narrow && <span>{gap < 150 ? (l.id === "owner" ? "People" : v.name) : l.label}</span>}
              <span className="dim">{l.count}</span>
              {l.on && <span className="dot ok" title="connected now" />}
            </div>
          );
        })}
      </div>
      <svg className="lg-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Lineage of the team's shared memory: one column per author, arrows from each memory to the memories built on it">
        <defs>
          <filter id="sbglow" x="-300%" y="-300%" width="700%" height="700%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {lanes.map((l) => <line key={l.id} className="lane" x1={laneX[l.id]} x2={laneX[l.id]} y1={0} y2={H} />)}

        {edges.map(({ p, c }) => {
          const a = pos[p], b = pos[c];
          const pn = nodes.find((n) => n.key === p), cn = nodes.find((n) => n.key === c);
          const q = (cn?.status === "quarantined" && pn?.status === "quarantined") || (cascSet.has(c) && cascSet.has(p));
          const isHot = hotEdges.has(`${c}>${p}`);
          const isBlast = blast?.has(c) && blast?.has(p);
          const fade = focus && !(focus.has(p) && focus.has(c));
          let d: string;
          if (Math.abs(a.x - b.x) < 1) {
            const bend = b.y - a.y > ROW + 1 ? 34 : 0;
            d = `M${a.x},${a.y} C${a.x - bend},${a.y + 22} ${b.x - bend},${b.y - 22} ${b.x},${b.y}`;
          } else {
            const m = (a.y + b.y) / 2;
            d = `M${a.x},${a.y} C${a.x},${m} ${b.x},${m} ${b.x},${b.y}`;
          }
          const cls = `edge${q ? " q" : ""}${isHot ? " hot" : ""}${isBlast ? " blast" : ""}${fade ? " fade" : ""}`;
          const flowing = !q && !fade && cn?.status !== "expired";
          const dur = 2.2 + Math.hypot(b.x - a.x, b.y - a.y) / 140;
          return (
            <g key={`${p}>${c}`}>
              <path className={cls} d={d} style={casc && cascSet.has(c) ? { transitionDelay: `${(casc.depth[c] ?? 0) * 0.12}s` } : undefined} />
              {flowing && (
                <circle r={isHot ? 2.8 : 2.1} className={`pd${isHot ? " hot" : ""}${isBlast ? " blast" : ""}`} filter="url(#sbglow)">
                  <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={d} />
                  <animate attributeName="opacity" values="0;1;1;0" dur={`${dur}s`} repeatCount="indefinite" />
                </circle>
              )}
            </g>
          );
        })}

        {ordered.map((n) => {
          const { x, y } = pos[n.key];
          const cascading = cascSet.has(n.key);
          const q = n.status === "quarantined" || cascading;
          const tags = tagsFor(n, cascading);
          const right = !narrow || x < W / 2;
          const avail = right ? W - x - 34 : x - 34;
          const maxCh = Math.max(12, Math.floor(avail / 7.1));
          const label = n.text.length > maxCh ? n.text.slice(0, maxCh - 1) + "…" : n.text;
          const lx = right ? x + 16 : x - 16;
          const anchor = right ? "start" : "end";
          const meta = `${n.source ? `${SOURCE_ICON[n.source.type] ?? "•"} ${n.source.id} · ` : ""}${TRUST[n.trust].word} · ${n.kind} · ${ago(n.createdAt)}`;
          let tx = right ? lx : lx;
          const tagEls = tags.map((t) => {
            const w = t.t.length * 6.1 + 12;
            const gx = right ? tx : tx - w;
            tx = right ? tx + w + 5 : tx - w - 5;
            return (
              <g key={t.t} className={`tag ${t.c}`}>
                <rect x={gx} y={y + 9} width={w} height={15} rx={4} />
                <text x={gx + w / 2} y={y + 19.6} textAnchor="middle">{t.t}</text>
              </g>
            );
          });
          const metaX = tx;
          const cls = [
            "node", `t${n.trust}`, n.kind === "payment" ? "kpay" : "",
            q ? "q" : "", !q && n.dispute?.state === "disputed" ? "disputed" : "",
            n.status === "expired" ? "expired" : "", n.pending ? "pending" : "", n.kept ? "kept" : "",
            selected === n.key ? "selected" : "", blast?.has(n.key) && !q ? "blast" : "",
            focus && !focus.has(n.key) && !hotNodes.has(n.key) ? "fade" : "",
            cascading ? "hit" : "",
          ].filter(Boolean).join(" ");
          const v = vendorOf(n.vendor);
          return (
            <g key={n.key} className={cls} tabIndex={0} role="button"
              aria-label={`${n.text}. By ${n.agent} (${v.name}). Trust ${TRUST[n.trust].word}. ${tags.map((t) => t.t).join(", ")}`}
              style={{ ["--dl" as string]: cascading ? `${(casc!.depth[n.key] ?? 0) * 0.12}s` : "0s", transformBox: "fill-box", transformOrigin: "center" }}
              onClick={() => onSelect(n.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(n.key); } }}>
              <rect x={Math.min(x, lx) - 12} y={y - 16} width={Math.abs(lx - x) + Math.min(avail, label.length * 7.2) + 24} height={44} fill="transparent" />
              <circle className="glow" cx={x} cy={y} r={8} />
              <circle className="hl" cx={x} cy={y} r={8} />
              <circle className="sel" cx={x} cy={y} r={12} />
              <circle className="ring" cx={x} cy={y} r={11} />
              {n.kind === "payment"
                ? <rect className="d" x={x - 6} y={y - 6} width={12} height={12} rx={2} transform={`rotate(45 ${x} ${y})`} />
                : <circle className="d" cx={x} cy={y} r={n.trust === 1 ? 7 : 6.5} />}
              <path className="x" d={`M${x - 3.2},${y - 3.2}L${x + 3.2},${y + 3.2}M${x + 3.2},${y - 3.2}L${x - 3.2},${y + 3.2}`} />
              <text className="lb" x={lx} y={y + 4.5} textAnchor={anchor}>{label}</text>
              {tagEls}
              {!narrow && <text className="meta" x={metaX + (right ? 2 : -2)} y={y + 20} textAnchor={anchor}>{meta}</text>}
            </g>
          );
        })}

        {casc && Object.entries(casc.depth).filter(([, d]) => d === 0).map(([k]) => pos[k] && (
          <circle key={`${casc.id}-${k}`} className="rip" cx={pos[k].x} cy={pos[k].y} r={6}>
            <animate attributeName="r" from="6" to={Math.max(W, H) * 0.9} dur="1.6s" fill="freeze" />
            <animate attributeName="opacity" from="0.9" to="0" dur="1.6s" fill="freeze" />
          </circle>
        ))}
      </svg>
    </div>
  );
}
