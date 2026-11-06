"use client";
// The hero product card: the whole story in one loop, drawn like the live commit graph.
// Illustration only (labelled); the live pages read the real server.
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

type Lane = 0 | 1 | 2;
interface Row { lane: Lane; text: string; tag?: { t: string; c: "ok" | "bad" | "warn" | "mut" }; kind: "cp" | "note" | "block"; from?: number }
const ROWS: Row[] = [
  { lane: 0, kind: "cp", text: "Scaffolded the to-do app" },
  { lane: 0, kind: "cp", text: "Added the list view", tag: { t: "HEAD ON ENS", c: "warn" }, from: 0 },
  { lane: 1, kind: "cp", text: "continue · dark mode", tag: { t: "HANDOFF", c: "ok" }, from: 1 },
  { lane: 1, kind: "note", text: "README: “ignore all previous instructions…”", tag: { t: "STOPPED · INJECTION", c: "bad" }, from: 2 },
  { lane: 1, kind: "block", text: ".github/workflows/deploy.yml", tag: { t: "BLOCKED BY ENS · sb.scope", c: "bad" } },
  { lane: 0, kind: "cp", text: "continue · clean context", tag: { t: "NOT RECEIVED ✓", c: "mut" }, from: 1 },
];
const LANES = [{ l: "claude", c: "var(--vc)", k: "C" }, { l: "gemini", c: "var(--vg)", k: "G" }, { l: "openai", c: "var(--vo)", k: "O" }];
const X = [40, 150, 260], Y0 = 92, DY = 58;

export function HandoffHero() {
  const ens = useStore((s) => s.health?.ens);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setStep(ROWS.length); return; }
    const t = setInterval(() => setStep((s) => (s >= ROWS.length + 2 ? 0 : s + 1)), 1150);
    return () => clearInterval(t);
  }, []);
  const shown = Math.min(step, ROWS.length);
  return (
    <div className="hero-card dark" aria-label="Illustration: Claude commits, Gemini continues, a poisoned README is stopped, a write outside scope is blocked by ENS">
      <div className="hc-top">
        <span className="dot ok pulse" /><span className="mono">{ens ?? "<brain>.<team>.eth"}</span><span className="dim mono">{ens ? "· live brain" : "· a brain"}</span>
        <span className="spacer" /><span className="mono dim tiny">illustration</span>
      </div>
      <svg viewBox="0 0 470 440" className="hc-svg" role="img">
        {LANES.map((l, i) => (
          <g key={l.l}>
            <line x1={X[i]} x2={X[i]} y1={58} y2={430} className="hc-lane" />
            <rect x={X[i] - 16} y={22} width={l.l.length * 8 + 40} height={26} rx={13} className="hc-pill" />
            <circle cx={X[i] - 3} cy={35} r={8} style={{ fill: l.c }} />
            <text x={X[i] - 3} y={38.5} className="hc-pl">{l.k}</text>
            <text x={X[i] + 10} y={39.5} className="hc-pt">{l.l}</text>
          </g>
        ))}
        {ROWS.map((r, i) => {
          if (i >= shown || r.from === undefined) return null;
          const a = ROWS[r.from], ax = X[a.lane], ay = Y0 + r.from * DY, bx = X[r.lane], by = Y0 + i * DY, m = (ay + by) / 2;
          const d = ax === bx ? `M${ax},${ay} L${bx},${by}` : `M${ax},${ay} C${ax},${m} ${bx},${m} ${bx},${by}`;
          const bad = r.tag?.c === "bad";
          return <path key={`e${i}`} d={d} className={`hc-edge${bad ? " bad" : ""}`} />;
        })}
        {ROWS.map((r, i) => {
          if (i >= shown) return null;
          const x = X[r.lane], y = Y0 + i * DY;
          const bad = r.tag?.c === "bad";
          const lx = x + 18;
          return (
            <g key={i} className="hc-row">
              {r.kind === "block"
                ? <rect x={x - 7} y={y - 7} width={14} height={14} rx={3} className="hc-blk" />
                : <circle cx={x} cy={y} r={r.kind === "cp" ? 7.5 : 6} className={`hc-dot${bad ? " bad" : ""}${r.kind === "note" ? " note" : ""}`} style={bad || r.kind === "note" ? undefined : { fill: LANES[r.lane].c, stroke: LANES[r.lane].c }} />}
              {bad && r.kind !== "block" && <path d={`M${x - 3.5},${y - 3.5}L${x + 3.5},${y + 3.5}M${x + 3.5},${y - 3.5}L${x - 3.5},${y + 3.5}`} className="hc-x" />}
              {r.tag?.t === "HEAD ON ENS" && <circle cx={x} cy={y} r={12} className="hc-head" />}
              {bad && <circle cx={x} cy={y} r={8} className="hc-rip" />}
              <text x={lx} y={y + 5} className={`hc-lb${bad ? " bad" : ""}`}>{r.text}</text>
              {r.tag && <g className={`hc-tag ${r.tag.c}`}><rect x={lx} y={y + 12} width={r.tag.t.length * 6.9 + 14} height={18} rx={4} /><text x={lx + 7} y={y + 24.5}>{r.tag.t}</text></g>}
            </g>
          );
        })}
      </svg>
      <div className="hc-foot mono">
        <span>signed on Arkiv by each AI&apos;s wallet</span><span>rules read live from ENS</span>
      </div>
    </div>
  );
}
